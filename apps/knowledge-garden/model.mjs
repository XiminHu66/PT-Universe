export const MARK='\n\n<!-- PT-KNOWLEDGE-v1\n';
export const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function safeUrl(s){try{const u=new URL(s);return ['http:','https:'].includes(u.protocol)?u.href:''}catch{return ''}}
export function canonical(s){const u=new URL(safeUrl(s));u.hash='';for(const k of [...u.searchParams.keys()])if(/^utm_|^(fbclid|gclid)$/.test(k))u.searchParams.delete(k);return u.href}
export function unpack(note=''){const at=note.lastIndexOf(MARK);if(at<0)return {note,meta:{}};try{const meta=JSON.parse(note.slice(at+MARK.length).split('\n-->')[0]);if(meta.version!==1)throw Error();return {note:note.slice(0,at),meta}}catch{return {note,meta:{}}}}
export function pack(note,meta){return String(note||'')+MARK+JSON.stringify({...meta,version:1})+'\n-->'}
export function item(b){const {note,meta}=unpack(b.note||'');return {...b,userNote:note,meta,title:b.title||b.content?.title||b.content?.url||'未命名资料',url:safeUrl(b.content?.url||b.content?.sourceUrl),category:meta.category||'未分类',reason:meta.reason||'',status:b.archived?'archived':meta.status==='reading'?'reading':'inbox'};}
export function paragraphs(text){return String(text).replace(/\r/g,'').split(/\n\s*\n/).map(x=>x.trim()).filter(Boolean).map((text,i)=>({id:'P'+(i+1),text}));}
export const relationTypes=['extends','improves','applies','compares_with','supports','contradicts','competes_with'];
export const relationLabels={extends:'延伸',improves:'改进',applies:'应用',compares_with:'对比',supports:'支持',contradicts:'存在分歧',mentions:'提及',shared_entity:'共享实体',competes_with:'竞争方案',shares_method:'共享方法',shares_task:'共享任务',shares_dataset:'共享数据集',uses:'采用',addresses:'解决任务',evaluated_on:'评测于',measured_by:'评估指标',implements:'实现',part_of:'组成部分',produces:'生成'};
const str=(s,n=2000)=>typeof s==='string'?s.trim().slice(0,n):'';
// Map formatting-equivalent citations back to an exact span in the archived
// text. Markdown quote prefixes and line wrapping must not reject valid quotes.
export function matchQuote(text,quote){
 const normal=(s,withMap=false)=>{let value='',map=[],lineStart=true;for(let i=0;i<s.length;i++){const c=s[i];if(c==='\n'||c==='\r'){lineStart=true;continue}if(lineStart&&(c==='>'||c===' '||c==='\t'))continue;lineStart=false;if(/\s/.test(c))continue;value+=c;if(withMap)map.push(i)}return {value,map}};
 const q=normal(String(quote||'')).value;if(q.length<5)return '';const t=normal(String(text),true),at=t.value.indexOf(q);return at<0?'':String(text).slice(t.map[at],t.map[at+q.length-1]+1);
}
export function validateExtraction(raw,ps){
 const claims=(Array.isArray(raw.claims)?raw.claims:[]).slice(0,8).map(c=>{const p=ps.find(p=>p.id===c.paragraph);const supplied=str(c.quote,1400),quote=p?matchQuote(p.text,supplied||p.text.slice(0,1200)):'',text=str(c.text);return {text,quote:quote||supplied,paragraph:str(c.paragraph,20),grounded:!!p&&quote.length>=12}}).filter(c=>c.text);
 const entities=(Array.isArray(raw.entities)?raw.entities:[]).slice(0,12).map(e=>{const name=str(e.name,100),p=ps.find(p=>p.id===e.paragraph),supplied=str(e.quote,1000),quote=p?matchQuote(p.text,supplied||p.text.slice(0,1000)):'';return {name,type:['method','tool','task','concept','dataset','model','metric','innovation'].includes(e.type)?e.type:'concept',paragraph:str(e.paragraph,20),quote:quote||supplied,grounded:!!p&&quote.length>=5&&!!matchQuote(p.text.toLowerCase(),name.toLowerCase())}}).filter(e=>e.name);
 return {summary:str(raw.summary,3500),suggestedCategory:str(raw.category,80),claims,entities,createdAt:new Date().toISOString()};
}
export function validateRelations(raw,items){return (Array.isArray(raw.relations)?raw.relations:[]).slice(0,30).filter(r=>r.from!==r.to&&relationTypes.includes(r.type)).map(r=>{const a=items.find(x=>x.id===r.from),b=items.find(x=>x.id===r.to),qa=str(r.quoteFrom,1000),qb=str(r.quoteTo,1000);const actualA=a?matchQuote(a.text,qa):'',actualB=b?matchQuote(b.text,qb):'';const grounded=actualA.length>=12&&actualB.length>=12;return {id:crypto.randomUUID(),from:r.from,to:r.to,type:r.type,reason:str(r.reason,1000),quoteFrom:actualA||qa,quoteTo:actualB||qb,confidence:Math.max(0,Math.min(1,Number(r.confidence)||0)),grounded,status:'pending'}}).filter(r=>items.some(x=>x.id===r.from)&&items.some(x=>x.id===r.to));}
export const entityLabels={document:'资料',method:'方法',task:'任务',dataset:'数据集',metric:'指标',model:'模型',innovation:'创新点',tool:'工具',concept:'概念'};
export const entityKey=(type,name)=>type+':'+String(name).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
const sourceText=b=>(b.meta.index?.pages||[]).map(p=>p.text).join('\n\n');
export function currentExtraction(b){const ex=b.meta.extraction;return !!ex&&(!b.meta.index||(!ex.contentVersion||ex.contentVersion===b.meta.index.version)&&!['error','ocr'].includes(b.meta.index.status));}
export function currentRelation(r,items){const a=items.find(b=>b.id===r.from),b=items.find(b=>b.id===r.to);if(!a||!b||!r.grounded||r.status!=='accepted')return false;return [[a,r.quoteFrom,r.fromVersion],[b,r.quoteTo,r.toVersion]].every(([book,quote,version])=>!book.meta.index||((!version||version===book.meta.index.version)&&!!matchQuote(sourceText(book),quote)));}
export function buildGraph(items,{minConfidence=.6}={}){
 const nodes=[],edges=[],seen=new Map(),edgeKeys=new Set();
 for(const b of items){nodes.push({id:b.id,label:b.title,type:'document',item:b});if(!currentExtraction(b))continue;
  for(const e of b.meta.extraction.entities||[]){if(!e.grounded)continue;const text=sourceText(b);if(b.meta.index&&!matchQuote(text,e.quote))continue;
   const key=entityKey(e.type,e.name);let id=seen.get(key);if(!id){id='entity:'+key;seen.set(key,id);nodes.push({id,label:e.name,type:e.type})}
   const edgeKey=b.id+':'+id;if(edgeKeys.has(edgeKey))continue;edgeKeys.add(edgeKey);
   edges.push({from:b.id,to:id,type:'mentions',quote:e.quote,paragraph:e.paragraph,version:b.meta.index?.version||b.meta.extraction.contentVersion,page:b.meta.index?.pages?.find(p=>matchQuote(p.text,e.quote))?.page||null});
  }
 }
 for(const b of items)for(const r of b.meta.relations||[]){const key=[r.from,r.type,r.to].join(':');if(!edgeKeys.has(key)&&currentRelation(r,items)&&r.confidence>=minConfidence){edgeKeys.add(key);edges.push({...r,owner:b.id})}}
 return {nodes,edges};
}
export function retrieve(items,query,limit=6){const q=String(query).toLowerCase(),terms=q.match(/[a-z0-9_+-]+|[\u4e00-\u9fff]{1,2}/g)||[];const ranked=items.map(b=>{const text=[b.title,b.category,b.reason,b.meta.extraction?.summary,...(b.meta.extraction?.claims||[]).filter(c=>c.grounded).map(c=>c.text),...(b.meta.extraction?.entities||[]).filter(e=>e.grounded).map(e=>e.name)].join(' ').toLowerCase();return {b,score:terms.reduce((n,t)=>n+(text.includes(t)?1:0),0)}}).filter(x=>x.score>0).sort((a,b)=>b.score-a.score);const selected=ranked.slice(0,Math.max(1,limit-2)).map(x=>x.b);const {edges}=buildGraph(items);const seed=new Set(selected.map(b=>b.id)),neighbor=new Set();for(const e of edges)if(seed.has(e.from))neighbor.add(e.to);else if(seed.has(e.to))neighbor.add(e.from);for(const e of edges)if(neighbor.has(e.to))neighbor.add(e.from);for(const b of items)if(neighbor.has(b.id)&&!seed.has(b.id)&&selected.length<limit){selected.push(b);seed.add(b.id)}for(const x of ranked)if(!seed.has(x.b.id)&&selected.length<limit){selected.push(x.b);seed.add(x.b.id)}return selected;}
export function groundedAnswer(raw,contexts){const statements=(Array.isArray(raw.statements)?raw.statements:[]).slice(0,16).map(s=>{const sources=(Array.isArray(s.sources)?s.sources:[]).slice(0,4).map(c=>{const b=contexts.find(x=>x.id===c.id),supplied=str(c.quote,1600),quote=b?matchQuote(b.text,supplied):'';return {id:c.id,quote:quote||supplied,grounded:quote.length>=12}});return {text:str(s.text,4000),sources,grounded:sources.length>0&&sources.every(c=>c.grounded)}});return {title:str(raw.title,200),statements,unknowns:(Array.isArray(raw.unknowns)?raw.unknowns:[]).map(x=>str(x,1000)).slice(0,8),createdAt:new Date().toISOString()};}
export function parseJSON(s){const clean=s.replace(/^\s*```(?:json)?\s*/,'').replace(/\s*```\s*$/,'').trim();try{return JSON.parse(clean)}catch{const a=clean.indexOf('{'),b=clean.lastIndexOf('}');if(a>=0&&b>a)return JSON.parse(clean.slice(a,b+1));throw Error('模型未返回有效 JSON，请重试或切换免费模型。')}}
