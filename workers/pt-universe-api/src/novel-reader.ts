// Paragraph restoration adapted from MIT-licensed bili_novel_packer.
// See licenses/bili_novel_packer.txt. Remote JavaScript is parsed, never executed.
export const decodeText=(s:string)=>s.replace(/&#(x[0-9a-f]+|\d+);/gi,(_,n)=>{const x=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n);return x>0&&x<=0x10ffff?String.fromCodePoint(x):'';}).replace(/&nbsp;/g,' ').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');

export function arithmetic(expression:string):number {
 const src=expression.replace(/\s/g,'');if(src.length>600)throw new Error('表达式过长');
 const tokens=src.match(/0x[0-9a-f]+|\d+|[()+*%/-]/gi)||[];if(tokens.join('')!==src)throw new Error('不支持的表达式');let i=0;
 function atom():number {const t=tokens[i++];if(t==='+'||t==='-')return (t==='-'?-1:1)*atom();if(t==='('){const n=sum();if(tokens[i++]!==')')throw new Error('括号错误');return n;}if(!t||!/^\d/.test(t))throw new Error('缺少数值');return Number(t);}
 function product():number {let n=atom();while(['*','/','%'].includes(tokens[i])){const op=tokens[i++],v=atom();n=op==='*'?n*v:op==='/'?n/v:n%v;}return n;}
 function sum():number {let n=product();while(['+','-'].includes(tokens[i])){const op=tokens[i++],v=product();n=op==='+'?n+v:n-v;}return n;}
 const n=sum();if(i!==tokens.length||!Number.isSafeInteger(n))throw new Error('参数无效');return n;
}
type Params={fixed:number;seed:number;a:number;c:number;mod:number};
export function shuffleParams(js:string,id:number):Params {
 const seedRE=/var\s+[_$a-zA-Z0-9]+\s*=\s*[^;]*?Number\s*\(\s*[_$a-zA-Z0-9]+\s*\)\s*,\s*([^,)]+?)\s*\)\s*,\s*([^,)]+?)\s*\)\s*,/g;
 const lcgRE=/([_$a-zA-Z0-9]+)\s*=\s*[^;]*?\(\s*\1\s*,\s*([^,)]+?)\s*\)\s*,\s*([^,)]+?)\s*\)\s*,\s*([^;)]+?)\s*\)\s*;/g;
 let seed:number|undefined,lcg:{a:number;c:number;mod:number}|undefined;
 for(const m of js.matchAll(seedRE)){try{const a=arithmetic(m[1]),b=arithmetic(m[2]);if(a>0&&b>=0){seed=id*a+b;break;}}catch{}}
 for(const m of js.matchAll(lcgRE)){try{const a=arithmetic(m[2]),c=arithmetic(m[3]),mod=arithmetic(m[4]);if(a>0&&c>=0&&mod>a&&mod>c){lcg={a,c,mod};break;}}catch{}}
 if(seed!==undefined&&lcg)return {fixed:20,seed,...lcg};
 // Also support the unobfuscated script used by upstream fixtures.
 try{
  const fixed=Number(js.match(/if\s*\(\s*\w+\s*>\s*(\d+)\s*\)/)?.[1]||20);
  const s=js.match(/=\s*([^;]*Number\s*\(\s*chapterId\s*\)[^;]*)\s*;/)?.[1];
  const l=js.match(/=\s*\(\s*([_$\w]+)\s*\*([^;]+)\)\s*%\s*([^;]+);/);
  if(s&&l){const expr=l[1]+'*'+l[2];const substitute=(x:string,name:string,n:number)=>arithmetic(x.replace(new RegExp(`Number\\s*\\(\\s*${name}\\s*\\)|\\b${name}\\b`,'g'),String(n)));const c=substitute(expr,l[1],0);return {fixed,seed:substitute(s,'chapterId',id),a:substitute(expr,l[1],1)-c,c,mod:arithmetic(l[3])};}
 }catch{}
 throw new Error('来源段落排序规则已变化，已停止读取以避免返回乱序正文');
}
export function restoreParagraphs<T>(paragraphs:T[],params:Params):T[]{
 const indices=paragraphs.map((_,i)=>i),tail=indices.splice(params.fixed);let seed=params.seed;
 for(let i=tail.length-1;i>0;i--){seed=(seed*params.a+params.c)%params.mod;const j=Math.floor(seed/params.mod*(i+1));[tail[i],tail[j]]=[tail[j],tail[i]];}
 indices.push(...tail);const restored=[...paragraphs];paragraphs.forEach((p,i)=>{restored[indices[i]]=p;});return restored;
}

type Block={type:'text'|'image';text?:string;url?:string};
export async function readBiliChapter(raw:string,load:(url:string)=>Promise<string>){
 const start=new URL(raw);if(!/^\/novel\/\d+\/\d+(?:_\d+)?\.html$/.test(start.pathname))throw new Error('请选择实际章节，卷封面不是正文');
 let next:string|null=start.href,title='',pages=0;const blocks:Block[]=[],seen=new Set<string>();
 while(next&&pages<16){
  if(seen.has(next))throw new Error('章节分页循环');seen.add(next);const current:string=next,markup=await load(current);pages++;
  if(/cf-chl-|just a moment|人机验证/i.test(markup))throw new Error('来源要求浏览器验证，无法获取正文');
  let cleaned=await new HTMLRewriter().on('#acontent div, #acontent ins, #acontent script, #acontent .tp, #acontent .bd, .bcontent div, .bcontent ins, .bcontent script, .bcontent .tp, .bcontent .bd',{element(e){e.remove();}}).transform(new Response(markup)).text();
  cleaned=await new HTMLRewriter().on('#acontent *, .bcontent *',{element(e){if(/^[a-z]\d{4}$/i.test(e.tagName))e.remove();}}).transform(new Response(cleaned)).text();
  const page:Block[]=[];let paragraph:Block|undefined;let script='',nextLabel='';
  await new HTMLRewriter().on('#atitle',{text(t){if(pages===1)title+=t.text;}})
   .on('#acontent > p, .bcontent > p',{element(e){paragraph={type:'text',text:''};page.push(paragraph);e.onEndTag(()=>{paragraph=undefined;});},text(t){if(paragraph)paragraph.text+=t.text;}})
   .on('#acontent img, .bcontent img',{element(e){const src=e.getAttribute('data-src')||e.getAttribute('src');if(src&&!src.startsWith('data:')){const u=new URL(src,current);if(u.protocol==='https:')page.push({type:'image',url:u.href});}}})
   .on('script[src*="chapterlog.js"]',{element(e){script=e.getAttribute('src')||'';}})
   .on('#footlink a.nextlink',{text(t){nextLabel+=t.text;}}).transform(new Response(cleaned)).text();
  const textSlots=page.map((b,i)=>b.type==='text'&&b.text?.trim()?i:-1).filter(i=>i>=0);
  if(script&&textSlots.length){const id=Number(markup.match(/chapterid\s*:\s*['"](\d+)/)?.[1]);if(!id)throw new Error('缺少章节排序编号');const js=await load(new URL(script,current).href);const sorted=restoreParagraphs(textSlots.map(i=>page[i]),shuffleParams(js,id));textSlots.forEach((slot,i)=>{page[slot]=sorted[i];});}
  for(const b of page){if(b.type==='text')b.text=decodeText(b.text||'').trim();if(b.type==='image'||b.text)blocks.push(b);}
  const pageLink=markup.match(/url_next\s*:\s*['"]([^'"]+)['"]/)?.[1];next=/下一[页頁]/.test(nextLabel)&&pageLink?new URL(pageLink,current).href:null;
  if(next){const n=new URL(next);if(n.origin!==start.origin||n.pathname.replace(/_\d+(?=\.html$)/,'')!==start.pathname.replace(/_\d+(?=\.html$)/,''))throw new Error('分页指向其他章节，已停止');}
 }
 if(next)throw new Error('章节超过 16 页，请分段读取');
 if(!blocks.length)throw new Error('没有获取到正文或插图，来源可能要求登录');
 return {title:decodeText(title).trim(),text:blocks.filter(b=>b.type==='text').map(b=>b.text).join('\n\n'),blocks,pages,url:raw,fetchedAt:new Date().toISOString()};
}
