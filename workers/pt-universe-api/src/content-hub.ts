// Public, bounded collectors. AI is separately authenticated and only runs on demand.
import {Converter} from 'opencc-js/t2cn';
const simplified=Converter({from:'tw',to:'cn'});
type Obj = Record<string, any>;
type HubEnv = Pick<Env, 'PT_UNIVERSE_DATA' | 'DB'>;
const BGM = 'https://api.bgm.tv';
const UA = 'PT-Universe/1.0 (+https://github.com/XiminHu66/PT-Universe)';
const READ_HOSTS = new Set(['anime1.me','bgm.tv','bangumi.tv','api.bgm.tv','www.v2ex.com','kenney.nl','www.kenney.nl','www.bing.com','news.google.com','search.brave.com','lite.duckduckgo.com','duckduckgo.com','www.sina.cn','auto.sina.cn','finance.sina.com.cn','news.qq.com','view.inews.qq.com','www.autohome.com.cn','club.autohome.com.cn','www.dongchedi.com','raw.githubusercontent.com','en.wikipedia.org','zh.wikipedia.org','en.wikipedia.org','www.factcheck.org','factcheck.afp.com','apnews.com','www.reuters.com','www.bbc.com','www.bbc.co.uk','www.snopes.com','www.cpsc.gov','www.elgato.com','help.elgato.com','www.corsair.com','www.sennheiser-hearing.com','www.sennheiser.com','www.fiio.com','www.toppingaudio.com','www.topping.com.cn','www.rtings.com','www.headphones.com','headphones.com','www.gearpatrol.com','guitar.com','www.soundguys.com','www.sonarworks.com','unheardlab.com','www.sennheiser.com','www.sennheiser-hearing.com','www.audiosciencereview.com','www.head-fi.org','www.sony.com','www.apple.com','support.apple.com','www.nintendo.com','store.steampowered.com','api.steampowered.com','www.ithome.com','sspai.com','www.gcores.com','www.theverge.com','www.tomshardware.com','www.engadget.com','www.digitaltrends.com','m.manhuagui.com','www.manhuagui.com','tw.linovelib.com','www.linovelib.com','www.gutenberg.org']);
const stamp = () => new Date().toISOString();
export function clean(value:unknown):string {return String(value??'').replace(/<script\b[\s\S]*?<\/script>/gi,' ').replace(/<style\b[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/<!\[CDATA\[|\]\]>/g,'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#(?:39|x27);/g,"'").replace(/&(?:nbsp|middot|bull);/g,' ').replace(/&#(\d+);/g,(_,n)=>Number(n)<=0x10ffff?String.fromCodePoint(Number(n)):'').replace(/\s+/g,' ').trim();}
export function publicURL(raw:string):URL {const u=new URL(raw);if(u.protocol!=='https:'||u.port||u.username||u.password||!READ_HOSTS.has(u.hostname))throw Error('仅支持已验证的公开来源；不支持此网址');return u;}
function link(raw:string,base:string){if(!raw)return '';try {const u=new URL(raw,base);return u.protocol==='https:'||u.protocol==='http:'?u.href:'';}catch{return '';}}
async function download(raw:string,init:RequestInit={}):Promise<string>{
 let u=publicURL(raw);
 for(let i=0;i<4;i++){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),9000);
  try{
   const r=await fetch(u.href,{...init,redirect:'manual',headers:{'user-agent':UA,accept:'application/json,text/html,application/rss+xml',...init.headers},signal:controller.signal});
   if([301,302,303,307,308].includes(r.status)){u=publicURL(new URL(r.headers.get('location')||'',u).href);continue;}
   if(!r.ok)throw Error(`来源返回 HTTP ${r.status}`);
   // Elgato's public product HTML includes a large embedded application bundle.
   const maxBytes=u.hostname==='www.elgato.com'?3_000_000:2_000_000;
   if(Number(r.headers.get('content-length')||0)>maxBytes)throw Error('来源内容过大');
   const reader=r.body?.getReader();if(!reader)return '';
   let bytes=0;const chunks:Uint8Array[]=[];
   while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.length;if(bytes>maxBytes){await reader.cancel();throw Error('来源内容过大');}chunks.push(part.value);}
   const all=new Uint8Array(bytes);let pos=0;for(const c of chunks){all.set(c,pos);pos+=c.length;}return new TextDecoder().decode(all);
  }finally{clearTimeout(timer);}
 }throw Error('来源跳转过多');
}
async function json(raw:string,init:RequestInit={}){return JSON.parse(await download(raw,init));}
async function keyFor(value:string){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');}
async function cached(env:HubEnv,key:string,seconds:number,loader:()=>Promise<Obj>,force=false){
 const previous=await env.PT_UNIVERSE_DATA.get<Obj>('hub/'+key,'json');
 const coldCompletion=key==='discover-v2'&&previous?.sources?.completed?.ok===false&&!(previous.items||[]).some((x:Obj)=>x.source==='manhuagui-completed');
 const check=key.startsWith('check-v4/'),ttl=check&&!previous?.items?.length?30:seconds;
 if(previous&&!force&&!coldCompletion&&Date.now()-Date.parse(previous.checked_at||'')<ttl*1000)return {...previous,cached:true};
 try{const loaded=await loader();if(check&&loaded.search_state==='unavailable'){if(previous?.items?.length)return {...previous,cached:true,stale:true,last_attempt_at:stamp(),providers:loaded.providers,errors:loaded.errors,error:'当前搜索来源暂不可用，保留上次成功结果'};return {...loaded,checked_at:stamp(),cached:false,stale:false};}const value={...loaded,checked_at:stamp(),cached:false,stale:false};await env.PT_UNIVERSE_DATA.put('hub/'+key,JSON.stringify(value),{expirationTtl:30*86400});return value;}
 catch(e){if(e instanceof RateError)throw e;if(previous)return {...previous,cached:true,stale:true,error:String(e instanceof Error?e.message:e)};throw e;}
}
export function normalizeSubject(s:Obj){return {id:s.id,type:s.type,title:s.name_cn||s.name||'',original_title:s.name||'',summary:s.summary||'',cover:s.images?.large||s.images?.common||s.images?.medium||s.image||'',date:s.date||s.air_date||null,episodes:s.total_episodes??s.eps??null,score:s.rating?.score??null,tags:(s.tags||[]).slice(0,8).map((t:Obj)=>t.name),url:`https://bgm.tv/subject/${s.id}`,relation:s.relation||null};}
export function parseTopics(html:string){
 const rows:Obj[]=[];
 for(const match of html.matchAll(/<li\b[^>]*id=["']item_(?:subject|ep)_[^"']+["'][\s\S]*?<\/li>/gi)){
  const b=match[0],a=b.match(/<a\b[^>]*href=["'](\/rakuen\/topic\/(?:subject|ep)\/\d+)["'][^>]*class=["'][^"']*title[^"']*["'][^>]*>([\s\S]*?)<\/a>/i),work=b.match(/href=["']\/subject\/(\d+)["'][^>]*>([\s\S]*?)<\/a>/i);
  if(!a)continue;const title=clean(a[2]);if(!title)continue;
  rows.push({id:'bgm-'+a[1].split('/').slice(-2).join('-'),source:'bangumi',source_label:'Bangumi 作品讨论',title,url:'https://bgm.tv'+a[1],subject_id:work?Number(work[1]):null,subject_title:work?clean(work[2]):'',replies:Number(b.match(/\(\+(\d+)\)/)?.[1]||0),activity_text:clean(b.match(/<small\b[^>]*class=["']time["'][^>]*>([\s\S]*?)<\/small>/i)?.[1]||''),spoiler:/剧透|劇透|\/ep\//.test(title+a[1]),published_at:null});
 }return rows.slice(0,100);
}
export function parseAssets(html:string){
 const rows:Obj[]=[];
 for(const m of html.matchAll(/<div\s+class=['"]asset['"][^>]*>([\s\S]*?)<\/h2>\s*([\s\S]*?)<\/div>/gi)){
  const b=m[1],a=b.match(/<h2>\s*<a[^>]*href=['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/a>/i),image=b.match(/background-image:\s*url\(["']?([^"')]+)["']?\)/i);if(!a)continue;
  rows.push({id:a[1].split('/').pop(),title:clean(a[2]),url:link(a[1],'https://kenney.nl'),cover:image?link(image[1],'https://kenney.nl'):'',category:clean(m[2]),source_label:'Kenney',license:'CC0',license_url:'https://kenney.nl/support',license_basis:'Kenney 官方资产许可声明；下载后保留包内许可文件'});
 }return rows;
}
export function resultURL(raw:string){try{const u=new URL(clean(raw),'https://lite.duckduckgo.com');if(['www.bing.com','duckduckgo.com','lite.duckduckgo.com'].includes(u.hostname)){const target=u.searchParams.get('url')||u.searchParams.get('uddg');if(target)return link(target,u.origin);}return link(u.href,u.origin);}catch{return '';}}
export function parseSearch(xml:string){return [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map(m=>{const b=m[1],pick=(tag:string)=>clean(b.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`,'i'))?.[1]||'');return {title:pick('title'),url:resultURL(pick('link')),excerpt:pick('description'),published_at:pick('pubDate')||null,source_label:pick('source'),publisher_url:link(b.match(/<source[^>]*url=["']([^"']+)/i)?.[1]||'','https://news.google.com')};}).filter(x=>x.title&&/^https?:\/\//.test(x.url)).slice(0,12);}
export function parseDuckSearch(html:string){
 const rows:Obj[]=[],anchors=[...html.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)].filter(m=>/class=["'][^"']*\bresult-link\b/.test(m[0]));
 for(let i=0;i<anchors.length;i++){const m=anchors[i],href=m[0].match(/href=["']([^"']+)["']/)?.[1];if(!href)continue;const b=html.slice(m.index!+m[0].length,anchors[i+1]?.index??html.length),url=resultURL(href),excerpt=clean(b.match(/<td\b[^>]*class=["'][^"']*result-snippet[^"']*["'][^>]*>([\s\S]*?)<\/td>/i)?.[1]||'');if(url)rows.push({title:clean(m[1]),url,excerpt:excerpt.slice(0,700),published_at:null});}
 return rows.slice(0,12);
}
export function parseEvidence(html:string,url:string){
 const removed=html.replace(/<(script|style|nav|footer)\b[^>]*>[\s\S]*?<\/\1>/gi,' ');
 const title=clean(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||url),paragraphs:Obj[]=[],specs:Obj[]=[];
 for(const m of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){
  try{const root=JSON.parse(m[1]);const nodes=Array.isArray(root)?root:root['@graph']||[root];for(const n of nodes){const types=Array.isArray(n['@type'])?n['@type']:[n['@type']];if(types.includes('Product')){for(const f of ['name','model','sku','mpn','gtin13','brand'])if(n[f])specs.push({name:f,value:clean(typeof n[f]==='object'?n[f].name:n[f]),source:url});for(const p of n.additionalProperty||[])if(p.name&&p.value!==undefined)specs.push({name:clean(p.name),value:clean(p.value)+(p.unitText?' '+clean(p.unitText):''),source:url});}if(n.articleBody)paragraphs.push({text:clean(n.articleBody).slice(0,4000)});}}
  catch{/* malformed publisher metadata is ignored */}
 }
 for(const m of removed.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)){const cells=[...m[1].matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map(x=>clean(x[1]));if(cells.length===2&&cells[0].length<100&&cells[1].length<500)specs.push({name:cells[0],value:cells[1],source:url});}
 for(const m of removed.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)){const t=clean(m[1]);if(t.length>=45&&t.length<=1800)paragraphs.push({text:t});if(paragraphs.length>=35)break;}
 const meta=html.match(/<meta\b[^>]*(?:name|property)=["'](?:description|og:description)["'][^>]*content=["']([^"']*)["']/i)?.[1];
 return {title,url,excerpt:clean(meta||paragraphs[0]?.text||'').slice(0,600),paragraphs:paragraphs.map((p,i)=>({...p,id:'p'+(i+1)})),specs:specs.slice(0,60),status:'unverified',retrieved_at:stamp(),method:'原文段落与发布者结构化字段；未作语义核实'};
}
function query(url:URL){const q=(url.searchParams.get('q')||'').trim();if(q.length<2||q.length>180)throw Error('请输入 2–180 字的查询');return q;}
export function parseWebSearch(html:string){
 const rows:Obj[]=[],blocks=[...html.matchAll(/<div\b[^>]*class=["']([^"']*)["'][^>]*>/gi)].filter(m=>m[1].split(/\s+/).includes('snippet'));
 for(let i=0;i<blocks.length;i++){
  const m=blocks[i];if(!/data-type=["']web["']/i.test(m[0]))continue;
  const b=html.slice(m.index!+m[0].length,blocks[i+1]?.index??html.length);
  const a=[...b.matchAll(/<a\b[^>]*href=["'](https?:[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)].find(x=>/class=["'][^"']*\bsearch-snippet-title\b/i.test(x[2]));if(!a)continue;
  const title=clean(a[2].match(/<(?:div|h[1-6])\b[^>]*class=["'][^"']*\bsearch-snippet-title\b[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|h[1-6])>/i)?.[1]||a[2]);
  const excerpt=clean(b.match(/class=["'][^"']*\bcontent\b[^"']*\bdesktop-default-regular\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1]||'');
  rows.push({title,url:clean(a[1]),excerpt:excerpt.slice(0,700),published_at:null,source_label:'',publisher_url:''});
 }
 return rows.slice(0,12);
}
export function relevant(row:Obj,q:string){
 const text=simplified(row.title+' '+row.excerpt+' '+row.url).toLowerCase(),compact=text.replace(/[\s-]/g,''),model=q.toLowerCase().match(/[a-z][a-z0-9-]*\d[a-z0-9-]*/g)||[];
 if(model.length)return model.some(t=>compact.includes(t.replace(/-/g,'')));
 const western=(q.toLowerCase().match(/[a-z0-9-]{3,}/g)||[]).filter(t=>!['review','specs','official','pro','max'].includes(t));if(western.some(t=>text.includes(t)||compact.includes(t.replace(/-/g,''))))return true;
 const chinese=simplified(q).match(/[\u3400-\u9fff]{2,}/g)||[],grams=new Set<string>();for(const run of chinese){if(text.includes(run))return true;for(let i=0;i<run.length-1;i++)grams.add(run.slice(i,i+2));}const hits=[...grams].filter(t=>text.includes(t)).length;return grams.size?hits>=Math.max(2,Math.ceil(grams.size*.25)):western.length===0;
}
export const normalizeQuery=(q:string)=>q.trim().replace(/([a-z])\s+(\d)/gi,'$1$2').replace(/\s+/g,' ');
export function parseAnime1(raw:unknown){
 if(!Array.isArray(raw))throw Error('Anime1 目录格式无效');
 return raw.filter(r=>Array.isArray(r)&&Number.isInteger(Number(r[0]))&&Number(r[0])>0&&clean(r[1])).slice(0,3000).map((r,i)=>{
  const label=clean(r[2]),numbers=label.match(/\d+(?:\.\d+)?/g)?.map(Number)||[],ongoing=/連載|连载/.test(label),latest=numbers.length?Math.max(...numbers):null;
  return {id:'anime1-'+r[0],category_id:Number(r[0]),title:clean(r[1]),search_title:simplified(clean(r[1])),available_label:label,latest_episode:latest,status:ongoing?'ongoing':/^\d+\s*[-–]\s*\d+$/.test(label)?'completed':'special',year:clean(r[3]),season:clean(r[4]),subtitles:clean(r[5]),url:'https://anime1.me/?cat='+r[0],source:'anime1',source_order:i};
 });
}
async function collectAnime1(env:HubEnv){return cached(env,'anime1/catalog-v1',1800,async()=>{const items=parseAnime1(await json('https://anime1.me/animelist.json'));if(!items.length)throw Error('Anime1 目录暂不可用');return {items,source:'Anime1 动画目录',source_url:'https://anime1.me/動畫列表',order_basis:'来源目录的最近更新顺序；集数是来源已上架数量，不是已看进度'};});}
export async function loadPublicEvidence(env:HubEnv,raw:string){publicURL(raw);return cached(env,'read/'+await keyFor(raw),86400,async()=>parseEvidence(await download(raw),raw));}
export function searchTerms(q:string,mode:string){
 const term=normalizeQuery(simplified(q));if(mode==='product'||!/[\u3400-\u9fff]/.test(term))return term;
 const words=term.replace(/会不会|是不是|是真的吗|是否|能不能|到底|为什么|怎么|会被/g,' ').replace(/[吗呢？?]+$/g,'').trim();
 const segmenter=new Intl.Segmenter('zh-CN',{granularity:'word'});
 return words.split(/\s+/).flatMap(run=>{if(run.length<4)return [run];const parts=[...segmenter.segment(run)].map(x=>x.segment);return parts.every(x=>x.length===1)&&/^[\u3400-\u9fff]+$/.test(run)?run.match(/.{1,2}/gu)||[run]:parts;}).join(' ').replace(/\s+/g,' ').trim()||term;
}
async function search(q:string,mode:string){
 const term=searchTerms(q,mode),engines=[{name:'Brave 网页检索',url:'https://search.brave.com/search?source=web&q='+encodeURIComponent(term),parse:parseWebSearch},{name:'DuckDuckGo 网页检索',url:'https://lite.duckduckgo.com/lite/?'+new URLSearchParams({q:term}),parse:parseDuckSearch},{name:'Bing 网页检索',url:'https://www.bing.com/search?'+new URLSearchParams({format:'rss',q:term}),parse:parseSearch}];
 if(mode!=='product')engines.push({name:'Bing News 公开订阅',url:'https://www.bing.com/news/search?format=rss&q='+encodeURIComponent(normalizeQuery(q)),parse:parseSearch},{name:'Google News 公开订阅',url:'https://news.google.com/rss/search?'+new URLSearchParams({q:term,hl:'zh-CN',gl:'CN',ceid:'CN:zh-Hans'}),parse:parseSearch});
 const result=await Promise.allSettled(engines.map(e=>download(e.url))),rows:Obj[]=[],errors:string[]=[],providers:Obj[]=[];
 for(let i=0;i<result.length;i++){const r=result[i],e=engines[i];if(r.status==='rejected'){const error=String(r.reason);errors.push(e.name+': '+error);providers.push({name:e.name,ok:false,error});continue;}const all=e.parse(r.value),parsed=all.filter(x=>relevant(x,normalizeQuery(q)));const blocked=!all.length&&/captcha|anomaly|challenge|verify.{0,12}human/i.test(r.value);if(!parsed.length)errors.push(e.name+(blocked?' 要求人工验证':all.length?' 未匹配到相关结果':' 暂未返回条目'));providers.push({name:e.name,ok:!blocked,count:parsed.length,parsed_count:all.length});rows.push(...parsed.map(x=>({...x,source:e.name,published_at:e.name.includes('News')?x.published_at:null,date_basis:e.name.includes('News')?'来源 RSS 记录时间':'搜索摘要不提供可靠出版日期'})));}
 return {rows,errors,providers,search_query:term};
}
class RateError extends Error{}
async function acquire(env:HubEnv,request:Request){
 const ip=request.headers.get('cf-connecting-ip')||'unknown',key='hub:read:'+await keyFor(ip),at=stamp(),cutoff=new Date(Date.now()-2500).toISOString();
 const r=await env.DB.prepare('INSERT INTO refresh_limits(limit_key,last_requested_at) VALUES(?,?) ON CONFLICT(limit_key) DO UPDATE SET last_requested_at=excluded.last_requested_at WHERE refresh_limits.last_requested_at<?').bind(key,at,cutoff).run();
 if(!r.meta.changes)throw new RateError('查询太快，请稍等 3 秒再试');
}

export function canonicalWorkURL(raw:string){try{const u=new URL(raw);u.hostname=u.hostname.replace(/^(?:www|m|tw)\./,'');return u.origin+u.pathname.replace(/\/$/,'');}catch{return raw;}}
export function parseCompletedNovels(html:string){
 return [...html.matchAll(/<li\b[^>]*class=["'][^"']*book-li[^"']*["'][^>]*>([\s\S]*?)<\/li>/gi)].map(m=>{
  const b=m[1],path=b.match(/href=["'](\/novel\/\d+\.html)["']/)?.[1];if(!path||!/<em\b[^>]*class=["'][^"']*red[^"']*["'][^>]*>\s*(?:完結|完结)/.test(b))return null;
  const title=clean(b.match(/<img\b[^>]*alt=["']([^"']+)["']/)?.[1]||b.match(/class=["']book-title["'][^>]*>([\s\S]*?)<\/h4>/)?.[1]);if(!title)return null;
  return {id:'completed-novel-'+path.match(/\d+/)?.[0],title,url:'https://tw.linovelib.com'+path,type:'novel',source:'linovelib-completed',source_label:'哔哩轻小说 · 完本目录',status:'completed',status_basis:'来源明确标记完结',cover:link(b.match(/data-src=["']([^"']+)["']/)?.[1]||'','https://tw.linovelib.com'),author:clean(b.match(/class=["']book-author["'][^>]*>([\s\S]*?)<\/span>/)?.[1]).replace(/^作者\s*/,''),summary:'',tags:[]};
 }).filter(Boolean).slice(0,40) as Obj[];
}
export function mergeHistory(current:Obj[],prior:Obj[],limit=200){const old=new Map(prior.map(x=>[x.id,x]));const seen=new Set<string>();const rows:Obj[]=[...current.map(x=>({...old.get(x.id),...x,first_seen:old.get(x.id)?.first_seen||x.first_seen||stamp()})),...prior];return rows.filter(x=>{if(seen.has(x.id))return false;seen.add(x.id);return true;}).slice(0,limit);}
async function collectTopics(env:HubEnv){return cached(env,'topics',1800,async()=>{
 const old=await env.PT_UNIVERSE_DATA.get<Obj>('hub/topics','json'),sources:Obj={},rows:Obj[]=[];
 const result=await Promise.allSettled([download('https://bgm.tv/rakuen/topiclist?type=subject'),json('https://www.v2ex.com/api/topics/latest.json')]);
 for(let i=0;i<result.length;i++){const source=i===0?'bangumi':'v2ex',r=result[i];if(r.status==='fulfilled'){const items=i===0?parseTopics(r.value as string):(r.value as Obj[]).filter(x=>x.id&&x.title).map(x=>({id:'v2ex-'+x.id,source:'v2ex',source_label:'V2EX · '+(x.node?.title||'社区'),title:x.title,url:x.url,excerpt:clean(x.content).slice(0,300),replies:x.replies||0,category:x.node?.name||'',published_at:new Date(x.created*1000).toISOString(),activity_text:'',spoiler:false}));if(items.length){rows.push(...items);sources[source]={ok:true,count:items.length,checked_at:stamp()};continue;}}sources[source]={ok:false,error:r.status==='rejected'?String(r.reason):'未解析到条目',checked_at:old?.sources?.[source]?.checked_at||null};rows.push(...(old?.items||[]).filter((x:Obj)=>x.source===source));}
 if(!Object.values(sources).some(x=>x.ok))throw Error('话题来源暂不可用');return {items:mergeHistory(rows,old?.items||[]),sources};
 });}
async function collectDiscovery(env:HubEnv){return cached(env,'discover-v2',7200,async()=>{
 const old=await env.PT_UNIVERSE_DATA.get<Obj>('hub/discover-v2','json');
 const raw=await env.PT_UNIVERSE_DATA.get<Obj>('data/site-updates.json','json');
 let site=raw;if(!site){const r=await fetch('https://raw.githubusercontent.com/XiminHu66/PT-Universe/main/apps/tsugi-checker/data/site-updates.json');if(!r.ok)throw Error('更新来源暂不可用');site=await r.json<Obj>();}
 const updates=(site.items||[]).map((x:Obj)=>({...x,cover:link(x.cover||'',x.url),status:/完结|完結|已完成/.test(String(x.status||'')+' '+String(x.latest||''))?'completed':'unknown',status_basis:/完结|完結|已完成/.test(String(x.status||'')+' '+String(x.latest||''))?'来源明确标记':'未确认',summary:x.summary||'',author:x.author||'',tags:x.tags||[]}));
 // A bounded manga directory enriches completion status; failure never invents it.
 const novelsTask=download('https://tw.linovelib.com/wenku/goodnum_0_5_0_0_0_0_0_1_0.html').then(parseCompletedNovels);novelsTask.catch(()=>{});const rows:Obj[]=[];const sources:Obj={updates:{ok:true,checked_at:site.generated_at,role:'仅用于排除现有更新流重复作品'}};
 try{const html=await download('https://m.manhuagui.com/list/wanjie/');const entries=[...html.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)].map(m=>{const b=m[1],a=b.match(/href=['"](\/comic\/\d+\/?)["'][^>]*(?:title=['"]([^'"]+)['"])?[^>]*>/i);if(!a)return null;const name=clean(b.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i)?.[1]||a[2]||b.match(/title=['"]([^'"]+)['"]/)?.[1]||'');if(!name)return null;const u='https://m.manhuagui.com'+a[1];return {id:'completed-'+u.match(/\d+/)?.[0],title:name,url:u,type:'manga',source:'manhuagui-completed',source_label:'漫画柜 · 完结目录',status:'completed',status_basis:'来源完结目录',cover:link(b.match(/(?:data-src|src)=['"]([^'"]+)['"]/)?.[1]||'',u),author:clean(b.match(/<dt>作\s*者：<\/dt><dd>([\s\S]*?)<\/dd>/)?.[1]||''),latest:clean(b.match(/<dt>更新至：<\/dt><dd>([\s\S]*?)<\/dd>/)?.[1]||''),source_updated_at:clean(b.match(/<dt>更新于：<\/dt><dd>([\s\S]*?)<\/dd>/)?.[1]||''),summary:'',tags:[clean(b.match(/<dt>类\s*别：<\/dt><dd>([\s\S]*?)<\/dd>/)?.[1]||'')].filter(Boolean)};}).filter(Boolean) as Obj[];if(entries.length){rows.push(...entries.slice(0,45));sources.completed={ok:true,count:entries.length,checked_at:stamp()};}else throw Error('完结目录结构暂不支持');}catch(e){
  sources.completed={ok:false,error:String(e),checked_at:old?.sources?.completed?.checked_at||null};let historical=(old?.items||[]).filter((x:Obj)=>x.source==='manhuagui-completed');
  if(!historical.length){try{const snapshot=await json('https://raw.githubusercontent.com/XiminHu66/PT-Universe/main/apps/tsugi-checker/data/hub-discover.json');if(!snapshot.snapshot||!Number.isFinite(Date.parse(snapshot.checked_at)))throw Error('历史快照无有效时间');historical=(snapshot.items||[]).filter((x:Obj)=>x.source==='manhuagui-completed'&&x.status==='completed'&&String(x.url).startsWith('https://m.manhuagui.com/comic/')).slice(0,45).map((x:Obj)=>({...x,cached_source_at:x.cached_source_at||snapshot.sources?.completed?.checked_at||snapshot.checked_at}));if(historical.length)sources.completed={...sources.completed,checked_at:historical[0].cached_source_at,fallback:'verified_snapshot',count:historical.length};}catch{/* retain a clear source failure if the verified snapshot is also unavailable */}}
  rows.push(...historical);
 }
 try{const entries=await novelsTask;if(!entries.length)throw Error('未解析到明确完结小说');rows.push(...entries);sources.novels={ok:true,count:entries.length,checked_at:stamp()};}catch(e){sources.novels={ok:false,error:String(e),checked_at:old?.sources?.novels?.checked_at||null};let historical=(old?.items||[]).filter((x:Obj)=>x.source==='linovelib-completed');if(!historical.length){try{const snapshot=await json('https://raw.githubusercontent.com/XiminHu66/PT-Universe/main/apps/tsugi-checker/data/hub-discover.json');if(snapshot.snapshot&&Number.isFinite(Date.parse(snapshot.checked_at)))historical=(snapshot.items||[]).filter((x:Obj)=>x.source==='linovelib-completed'&&x.status==='completed'&&String(x.url).startsWith('https://tw.linovelib.com/novel/')).slice(0,40).map((x:Obj)=>({...x,cached_source_at:x.cached_source_at||snapshot.sources?.novels?.checked_at||snapshot.checked_at}));}catch{}}rows.push(...historical);}
 if(!rows.length)throw Error('暂无可用发现数据');const updateURLs=new Set(updates.map((x:Obj)=>canonicalWorkURL(x.url))),updateTitles=new Set(updates.map((x:Obj)=>simplified(clean(x.title)).toLowerCase().replace(/[^\p{L}\p{N}]/gu,'')));const independent=rows.filter(x=>!updateURLs.has(canonicalWorkURL(x.url))&&!updateTitles.has(simplified(clean(x.title)).toLowerCase().replace(/[^\p{L}\p{N}]/gu,'')));const excluded=rows.length-independent.length;const dedup=new Map<string,Obj>();for(const r of independent){const u=String(r.url).replace(/\/$/,'');dedup.set(u,{...dedup.get(u),...r});}const previousURL=new Map((old?.items||[]).map((x:Obj)=>[String(x.url).replace(/\/$/,''),x]));const normalized=[...dedup.values()].map(x=>({...x,id:(previousURL.get(String(x.url).replace(/\/$/,'')) as Obj)?.id||x.id}));return {items:mergeHistory(normalized,(old?.items||[]).filter((x:Obj)=>!updateURLs.has(canonicalWorkURL(x.url))&&!updateTitles.has(simplified(clean(x.title)).toLowerCase().replace(/[^\p{L}\p{N}]/gu,''))),320),sources,excluded_updates:excluded,catalog_only:true,date_basis:'first_seen 是本站首次发现，不是作品出版日；初始化批次不代表新连载'};
 });}
async function collectAssets(env:HubEnv){return cached(env,'assets',86400,async()=>{
 const first=await download('https://kenney.nl/assets'),initial=parseAssets(first);if(!initial.length)throw Error('素材目录结构暂不支持');const old=await env.PT_UNIVERSE_DATA.get<Obj>('hub/assets','json'),pages=Math.min(14,Math.max(1,...[...first.matchAll(/assets\/page:(\d+)/g)].map(x=>Number(x[1])))),sources:Obj={1:{ok:true,count:initial.length}},rows:Obj[]=[...initial];
 const results=await Promise.allSettled(Array.from({length:pages-1},(_,i)=>download('https://kenney.nl/assets/page:'+(i+2))));for(let i=0;i<results.length;i++){const r=results[i];if(r.status==='fulfilled'){const parsed=parseAssets(r.value);if(parsed.length){rows.push(...parsed);sources[i+2]={ok:true,count:parsed.length};continue;}}sources[i+2]={ok:false,error:r.status==='rejected'?String(r.reason):'未解析到素材'};}
 // Keep previously fetched packs when one directory page fails.
 if(Object.values(sources).some(x=>!x.ok))rows.push(...(old?.items||[]));return {items:[...new Map(rows.map(x=>[x.id,x])).values()].slice(0,250),source:'Kenney',source_url:'https://kenney.nl/assets',sources,pages};
});}
export async function hubTick(env:HubEnv){await Promise.allSettled([collectTopics(env),collectDiscovery(env),collectAnime1(env),cached(env,'calendar',21600,async()=>({days:(await json(BGM+'/calendar')).map((d:Obj)=>({weekday:d.weekday,items:d.items.map(normalizeSubject)})),source:'Bangumi 放送日历',source_url:'https://bgm.tv/calendar'})),collectAssets(env)]);}
export async function contentHubRoute(request:Request,env:HubEnv):Promise<{body:Obj;status?:number}|null>{
 const u=new URL(request.url);if(!u.pathname.startsWith('/api/hub/'))return null;
 if(request.method!=='GET')return {body:{error:'Method not allowed'},status:405};
 try{
  const route=u.pathname.slice(9);let data:Obj;
  if(route==='calendar')data=await cached(env,'calendar',21600,async()=>({days:(await json(BGM+'/calendar')).map((d:Obj)=>({weekday:d.weekday,items:d.items.map(normalizeSubject)})),source:'Bangumi 放送日历',source_url:'https://bgm.tv/calendar'}));
  else if(route==='anime1')data=await collectAnime1(env);
  else if(route==='topics')data=await collectTopics(env);
  else if(route==='discover')data=await collectDiscovery(env);
  else if(route==='assets')data=await collectAssets(env);
  else if(route==='search'){const q=query(u);data=await cached(env,'search/'+await keyFor(q),3600,async()=>({items:(await json(BGM+'/v0/search/subjects?limit=16',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({keyword:q,filter:{type:[1,2,4],nsfw:false}})})).data.map(normalizeSubject),source:'Bangumi',query:q}));}
  else if(/^subject\/\d+$/.test(route)){const id=route.split('/')[1];data=await cached(env,route,86400,async()=>{const s=normalizeSubject(await json(BGM+'/v0/subjects/'+id));let relations:Obj[]=[],relation_error='';try{relations=(await json(BGM+'/v0/subjects/'+id+'/subjects')).map(normalizeSubject);}catch(e){relation_error=String(e);}return {subject:s,relations,relation_error,source:'Bangumi 条目关系',source_url:s.url};});}
  else if(/^episodes\/\d+$/.test(route)){const id=route.split('/')[1];data=await cached(env,route,21600,async()=>{const r=await json(BGM+'/v0/episodes?subject_id='+id+'&type=0&limit=100');return {items:(r.data||[]).map((x:Obj)=>({id:x.id,sort:x.sort,title:x.name_cn||x.name,airdate:x.airdate||null,url:`https://bgm.tv/ep/${x.id}`,basis:'Bangumi 记录日期；不证明流媒体已上线'})),total:r.total||0,source:'Bangumi 章节记录'};});}
  else if(route==='check/search'){
   const q=query(u),mode=u.searchParams.get('mode')==='product'?'product':'claim';data=await cached(env,'check-v4/'+await keyFor(mode+normalizeQuery(q).toLowerCase()),3600,async()=>{
    await acquire(env,request);const found=await search(q,mode),items:Obj[]=[];
    for(const row of found.rows){const host=new URL(row.url).hostname;items.push({...row,id:await keyFor(row.url),kind:mode==='product'?'product_candidate':'evidence_candidate',host:row.publisher_url?new URL(row.publisher_url).hostname:host,readable:host!=='news.google.com'&&new URL(row.url).protocol==='https:'&&READ_HOSTS.has(host),status:'unverified',retrieved_at:stamp()});}
    const unavailable=!items.length&&found.providers.some(x=>!x.ok);return {query:q,normalized_query:normalizeQuery(q),search_query:found.search_query,providers:found.providers,search_state:items.length?'ready':unavailable?'unavailable':'empty',empty_reason:items.length?'':unavailable?'搜索来源限流或暂不可用，请重新检索；失败不代表说法为假或商品不存在':'暂未匹配到相关来源，试试关键名词、型号或原文链接',mode,items:[...new Map(items.map(x=>[x.url,x])).values()].slice(0,20),errors:found.errors,method:'公开网页与新闻 RSS 候选；不作自动语义核查'};
   },u.searchParams.get('refresh')==='1');
  }else if(route==='check/read'){const raw=u.searchParams.get('url')||'';publicURL(raw);data=await cached(env,'read/'+await keyFor(raw),86400,async()=>{await acquire(env,request);return parseEvidence(await download(raw),raw);});}
  else return {body:{error:'Not found'},status:404};
  return {body:data};
 }catch(e){return {body:{error:e instanceof Error?e.message:String(e)},status:e instanceof RateError?429:400};}
}
