export const SITE_REFRESH_REVISION='2026-10-12-source-verification';
import {parseDocument} from 'htmlparser2';
import {findAll,textContent} from 'domutils';
type Row=Record<string,any>;
const plain=(n:any)=>textContent(n).replace(/\s+/g,' ').trim();
const nodes=(n:any)=>findAll(()=>true,n.children||[]) as any[];
const links=(n:any)=>nodes(n).filter(x=>x.name==='a'&&x.attribs?.href);
const absolute=(s:string,base:string)=>{try{return new URL(s,base).href}catch{return ''}};
const work=(url:string,source:string)=>source==='linovelib'?/\/(?:novel|book)\/\d+(?:\.html)?\/?$/.test(new URL(url).pathname):/\/(?:comic|h5\/details\/comic)\/[^/]+\/?$/.test(new URL(url).pathname);
const date=(value:string)=>value.match(/20\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2}(?:日)?(?:\s+\d{1,2}:\d{2})?/)?.[0]||'';
export function parseLatestDetail(html:string,url:string,source:string):Row{
 const doc=parseDocument(html),all=nodes(doc),out:Row={};
 if(source==='linovelib'){
  const marker=links(doc).find(a=>/(?:最后|最後)\s*更新/.test(plain(a)));
  if(marker){
   const value=plain(marker),chapter=nodes(marker).find(n=>n.name==='p');
   out.latest=chapter?plain(chapter):value.replace(/^(?:最后|最後)\s*更新(?:时间|時間|日期)?[·：:\s]*20\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2}(?:日)?\s*/,'');
   out.updated_text=date(value);out.latest_url=absolute(marker.attribs.href,url);
  }
 }else if(source==='copymanga'){
  const title=all.find(n=>n.name==='title'),m=title&&plain(title).match(/[-－](第\s*[^-－]{1,48}?(?:话|話|章|回|卷))[-－]/);
  const latest=links(doc).find(a=>/(?:最新|最后|最後)\s*(?:章节|章節|话|話|更新)/.test(plain(a))&&/第/.test(plain(a)));
  out.latest=m?.[1]||latest&&plain(latest).match(/第\s*[^|]{1,48}?(?:话|話|章|回|卷)/)?.[0]||'';
  const value=plain(doc),dm=value.match(/(?:最后|最後)\s*更新(?:时间|時間|日期)?[：:\s]*(20\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2}(?:日)?)/);
  out.updated_text=dm?.[1]||'';out.latest_url=latest?absolute(latest.attribs.href,url):url;
 }
 if(!out.latest||/^(?:最新更新|更新|目录|目錄)$/.test(out.latest))return {};
 return out;
}
export function parseSiteList(html:string,base:string,source:string,label:string,type:string,limit:number):Row[]{
 const doc=parseDocument(html);let scope:any=doc;
 if(source==='linovelib')scope=nodes(doc).find(n=>String(n.attribs?.class||'').split(/\s+/).includes('book-ol-normal'))||doc;
 if(source==='copymanga'){
  const marker=nodes(doc).find(n=>['h1','h2','h3','h4','h5','h6','span','p','div','strong','b'].includes(n.name)&&/^(?:热门(?:漫画)?更新|熱門(?:漫畫)?更新|最新更新|最近更新|漫畫更新|漫画更新)$/.test(plain(n)));
  for(let n=marker?.parent;n&&n!==doc;n=n.parent){const count=links(n).filter(a=>work(absolute(a.attribs.href,base),source)).length;if(count>=4&&count<=160){scope=n;break}}
  if(scope===doc)throw Error('CopyManga 最新更新区块未找到，不能用排行榜替代');
 }
 const rows:Row[]=[],seen=new Set<string>();
 for(const a of links(scope)){
  const url=absolute(a.attribs.href,base);if(!url||!work(url,source)||seen.has(url))continue;
  let card:any=a;
  for(let n=a.parent,depth=0;n&&depth<6;n=n.parent,depth++){
   const v=plain(n),count=new Set(links(n).map(x=>absolute(x.attribs.href,base)).filter(x=>work(x,source))).size;
   if(count<=1&&v.length<1600){card=n;if(['li','article','tr'].includes(n.name))break}else break;
  }
  const descendants=nodes(card),img=descendants.find(n=>n.name==='img'),heading=nodes(a).find(n=>/^h[1-4]$/.test(n.name)),raw=heading?plain(heading):a.attribs.title||plain(a);
  const title=(/\.\.\.|…/.test(raw)||!raw?img?.attribs.alt||img?.attribs.title:raw)||img?.attribs.alt||'';
  if(title.length<2)continue;
  const context=plain(card),m=context.match(/(?:更新至|最新(?:章节|章節|话|話|卷)?)[：:\s]*([^|]{1,60})/),chapter=links(card).find(n=>n!==a&&/第\s*\S+?(?:章|话|話|回|卷)/.test(plain(n)));
  const latest=chapter?plain(chapter):m?.[1]?.trim()||'';
  seen.add(url);rows.push({type,source,source_label:label,title,latest,updated_text:date(context),url,cover:absolute(img?.attribs['data-src']||img?.attribs['data-original']||img?.attribs.src||'',base),latest_url:chapter?absolute(chapter.attribs.href,base):'',order:rows.length});
  if(rows.length>=limit)break;
 }
 return rows;
}
export function sourceIsFresh(snapshot:any,id:string,day:string):boolean{
 const status=snapshot?.sources?.[id];
 return status?.ok===true&&status?.fallback!==true&&status?.degraded!==true&&String(status?.checked_at||'').startsWith(day);
}
