// Deal Lab: owner-scoped, read-only and bounded outbound API explorer.
// All upstream hosts, operations and budgets are hard-coded. There is no generic proxy.
import {verifyMonitorToken} from './monitor';

type LabEnv={DB:D1Database;PT_UNIVERSE_DATA:KVNamespace;SERPAPI_KEY?:string;ITAD_API_KEY?:string};
type Dict=Record<string,unknown>;
type Op={path:string;method?:'GET'|'POST';params:Record<string,'text'|'id'|'number'|'enum'|'uuid'|'ids'|'token'|'price'>;body?:string;description:string};
const docs:Record<string,string>={
 shopsavvy:'https://shopsavvy.com/data/documentation/mcp-server',
 serpapi:'https://serpapi.com/google-shopping-api',
 itad:'https://docs.isthereanydeal.com/',
 cheapshark:'https://apidocs.cheapshark.com/',
 gamerpower:'https://www.gamerpower.com/api-read',
 steam:'https://store.steampowered.com/search/?filter=popularwishlist&ignore_preferences=1'
};
export const OPERATIONS:Record<string,Record<string,Op>>={
 serpapi:{
  search:{path:'/search.json',params:{q:'text',gl:'enum',hl:'enum',shoprs:'token',sort_by:'number',min_price:'price',max_price:'price'},description:'Google Shopping keyword search'},
  product:{path:'/search.json',params:{page_token:'token',more_stores:'number'},description:'Google Immersive Product detail / stores (page_token from search)' }
 },
 itad:{
  search:{path:'/games/search/v1',params:{title:'text',results:'number'},description:'Find games by title'},
  lookup:{path:'/games/lookup/v1',params:{title:'text',appid:'number'},description:'Lookup Steam AppID or exact title'},
  info:{path:'/games/info/v2',params:{id:'uuid'},description:'Game details'},
  prices:{path:'/games/prices/v3',method:'POST',params:{country:'enum'},body:'ids',description:'Retailer offers; game UUID array'},
  overview:{path:'/games/overview/v2',method:'POST',params:{country:'enum'},body:'ids',description:'Current best and historical low'},
  history:{path:'/games/history/v2',params:{id:'uuid',country:'enum',since:'text'},description:'Price change history'},
  deals:{path:'/deals/v2',params:{country:'enum',limit:'number',offset:'number'},description:'Current PC game deals'},
  giveaways:{path:'/giveaways/v1',params:{limit:'number',offset:'number'},description:'Giveaway feed'},
  bundles:{path:'/bundles/v1',params:{country:'enum',limit:'number',offset:'number'},description:'Active bundles'}
 },
 cheapshark:{
  deals:{path:'/api/1.0/deals',params:{title:'text',storeID:'number',steamAppID:'number',pageSize:'number',sortBy:'text',lowerPrice:'number',upperPrice:'number',onSale:'number'},description:'Discounts and merchant offers'},
  games:{path:'/api/1.0/games',params:{title:'text',steamAppID:'number',limit:'number'},description:'Game title / Steam AppID search'},
  game:{path:'/api/1.0/games',params:{id:'id'},description:'Detail + cheapest historical price'},
  deal:{path:'/api/1.0/deals',params:{id:'text'},description:'Deal detail, other stores and historical low'},
  stores:{path:'/api/1.0/stores',params:{},description:'Available stores'}
 },
 gamerpower:{
  giveaways:{path:'/api/giveaways',params:{platform:'enum',type:'enum','sort-by':'enum'},description:'Active giveaways; game/loot/beta'},
  giveaway:{path:'/api/giveaway',params:{id:'number'},description:'Giveaway details'},
  filter:{path:'/api/filter',params:{platform:'text',type:'text','sort-by':'enum'},description:'Multiple platforms / types, joined with +'},
  worth:{path:'/api/worth',params:{platform:'enum',type:'enum'},description:'Estimated total active giveaway value'}
 },
 steam:{leaderboard:{path:'/search/results/',params:{},description:'Official public Steam most-wishlisted ranking (rank only; no counts)'}}
};
const READ_ONLY_MCP=new Set(['product_lookup','product_lookup_batch','product_search','product_offers','product_offers_retailer','product_price_history','content_best_picks','content_tldr_review','content_qa_answers','content_buying_guide','universal_search']);
export const budgets:Record<string,{day:number;minute:number;hour:number;month:number;cooldown:number;ttl:number}>={
 shopsavvy:{day:120,minute:4,hour:30,month:2000,cooldown:12,ttl:21600},
 serpapi:{day:12,minute:1,hour:30,month:175,cooldown:60,ttl:21600},
 itad:{day:90,minute:5,hour:60,month:1800,cooldown:10,ttl:10800},
 cheapshark:{day:120,minute:5,hour:40,month:2500,cooldown:10,ttl:10800},
 gamerpower:{day:80,minute:4,hour:30,month:1600,cooldown:15,ttl:7200},
 steam:{day:8,minute:1,hour:3,month:100,cooldown:300,ttl:86400}
};
export const POLICIES:Record<string,{free:string;terms:string;note:string}>={
 shopsavvy:{free:'匿名：每 IP 10 次工具调用/分钟、100 次/小时',terms:'https://shopsavvy.com/data/documentation/mcp-tools',note:'共享出口可能与其他客户端共用配额。仅个人按需探索；缓存用于降低请求量，不再分发完整目录。'},
 serpapi:{free:'免费套餐 250 次/月、50 次/小时',terms:'https://serpapi.com/pricing',note:'本工具滚动31天最多175次；其他应用用量无法获知，账户须保持免费套餐。'},
 itad:{free:'已验证邮箱默认1000请求/5分钟；以开发者后台为准',terms:'https://docs.isthereanydeal.com/',note:'个人研究使用；署名、保留原始报价和购买链接；禁止竞争性服务。'},
 cheapshark:{free:'无需Key；未公布固定数值限流，遵守429 Retry-After',terms:'https://apidocs.cheapshark.com/',note:'用户主动搜索；购买链接必须经过 CheapShark redirect；不镜像完整目录。'},
 gamerpower:{free:'无需Key；不超过10请求/秒',terms:'https://www.gamerpower.com/api-read',note:'必须署名 GamerPower。Loot 可能包含 DLC，永久权益及任务条件必须查看原文。'},
 steam:{free:'公开商店搜索页，无正式排行榜API或稳定性承诺',terms:'https://store.steampowered.com/subscriber_agreement/',note:'个人低频读取官方公开搜索排序；24小时缓存。无SteamDB抓取、人数或增长估算；访问受限即停止。'}
};
export function retrySeconds(value:unknown,fallback=0){const n=Number(value);if(value!==null&&value!==''&&value!==undefined&&Number.isFinite(n)&&n>=0)return Math.ceil(n);const t=Date.parse(String(value));return Number.isFinite(t)?Math.max(0,Math.ceil((t-Date.now())/1000)):fallback;}
function redact(value:unknown,env:LabEnv):unknown{
 const secrets=[env.SERPAPI_KEY,env.ITAD_API_KEY].filter(Boolean) as string[];
 if(typeof value==='string'){let s=value;for(const key of secrets)s=s.replaceAll(key,'[REDACTED]').replaceAll(encodeURIComponent(key),'[REDACTED]');return s;}
 if(Array.isArray(value))return value.map(v=>redact(v,env));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([k])=>!['api_key','key','authorization','ITAD-API-Key'].includes(k)).map(([k,v])=>[k,redact(v,env)]));return value;
}
const h={'referrer-policy':'no-referrer','cache-control':'private,no-store','x-content-type-options':'nosniff'};
const out=(body:unknown,status=200)=>Response.json(body,{status,headers:h});
const asString=(v:unknown,max=180)=>typeof v==='string'?v.trim().slice(0,max):'';
const fail=(error:string,status=400,more:Dict={})=>Response.json({ok:false,error,...more},{status,headers:{...h,...(status===429&&more.retryAfter?{'retry-after':String(more.retryAfter)}:{})}});
const json=(s:string)=>{try{return JSON.parse(s)}catch{return null}};
const now=()=>Date.now();
const hash=async(v:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v)))).map(x=>x.toString(16).padStart(2,'0')).join('');
const validUUID=(s:string)=>/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(s);
function validate(provider:string,operation:string,input:unknown){
 const item=OPERATIONS[provider]?.[operation];if(!item)throw Error('不支持的 API 操作');
 const src=(input&&typeof input==='object'&&!Array.isArray(input)?input:{}) as Dict;
 const result:Record<string,string>={};
 for(const k of Object.keys(src))if(!Object.hasOwn(item.params,k)&&k!==item.body)throw Error('不支持的参数：'+k);
 for(const [key,kind] of Object.entries(item.params)){
  if(src[key]===undefined||src[key]===null||src[key]==='')continue;
  const max=kind==='token'?2400:180;
  if(String(src[key]).length>max)throw Error(key+' 参数过长');
  const v=asString(String(src[key]),max);
  if(!v)continue;
  if(kind==='number'&&(!/^\d{1,9}$/.test(v)||+v>10000000))throw Error(key+' 必须是有效非负整数');
  if(kind==='price'&&(!/^\d{1,6}(\.\d{1,2})?$/.test(v)||+v>100000))throw Error(key+' 必须为有效价格');
  if(kind==='uuid'&&!validUUID(v))throw Error(key+' 必须是 ITAD UUID');
  if(kind==='id'&&!/^[\w-]{1,100}$/.test(v))throw Error(key+' 格式错误');
  if(kind==='enum'&&!/^[\w,-]{1,50}$/.test(v))throw Error(key+' 不允许特殊字符');
  result[key]=v;
 }
 if(item.body==='ids'){
  const ids=Array.isArray(src.ids)?src.ids:asString(src.ids,1000).split(/[\s,]+/).filter(Boolean);
  if(ids.length<1||ids.length>5||ids.some(x=>typeof x!=='string'||!validUUID(x)))throw Error('需要 1–5 个有效 ITAD UUID');
  return {params:result,body:ids};
 }
 if(provider==='serpapi'&&operation==='search'&&!result.q)throw Error('请输入商品关键词');
 if(provider==='serpapi'&&operation==='product'&&!result.page_token)throw Error('需要搜索结果返回的真实 immersive_product_page_token');
 if(provider==='itad'&&operation==='search'&&!result.title)throw Error('请输入游戏名');
 if(provider==='cheapshark'&&operation==='game'&&!result.id)throw Error('需要 CheapShark 游戏 ID');
 if(provider==='gamerpower'&&operation==='giveaway'&&!result.id)throw Error('需要 giveaway ID');
 if(provider==='serpapi'&&operation==='search'){if(result.gl&&result.gl!=='us')throw Error('本工具商品搜索只开放美国市场');result.gl='us';result.hl=result.hl||'en';}
 if(provider==='itad'&&item.params.country){result.country=result.country||'US';if(!/^[A-Z]{2}$/.test(result.country))throw Error('country 必须为两位大写地区代码');}
 const limits:Record<string,number>={limit:provider==='itad'?50:40,results:40,pageSize:40,start:80,offset:200,more_stores:1,sort_by:2,onSale:1,lowerPrice:1000,upperPrice:1000};
 for(const [k,v] of Object.entries(result))if(limits[k]!==undefined&&(+v>limits[k]||['limit','results','pageSize','sort_by'].includes(k)&&+v<1))throw Error(k+' 超过本工具安全上限 '+limits[k]);
 if(provider==='itad'&&['info','history'].includes(operation)&&!result.id)throw Error('需要 ITAD UUID');
 if(provider==='gamerpower'){const enums:Record<string,string[]>={platform:['pc','steam','epic-games-store','gog','ps4','ps5','xbox-one','xbox-series-xs','switch','android','ios','drm-free','itchio'],type:['game','loot','beta'],'sort-by':['date','value','popularity']};for(const [k,values] of Object.entries(enums))if(result[k]&&!result[k].split(operation==='filter'?'+':'|').every(v=>values.includes(v)))throw Error(k+' 选项不受支持');}
 if(provider==='itad'&&operation==='lookup'&&!result.title&&!result.appid)throw Error('需要游戏名或 Steam AppID');
 if(provider==='cheapshark'&&operation==='deal'&&!result.id)throw Error('需要 CheapShark Deal ID');
 return {params:result,body:null};
}
export function sanitizeMcpArgs(raw:unknown,schema:any){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('MCP 参数必须为 JSON 对象');
 if(!schema||schema.type!=='object'||!schema.properties)throw Error('MCP 未返回可验证的工具输入 Schema');
 if(Object.keys(raw).length>15||JSON.stringify(raw).length>3000)throw Error('MCP 参数过大');
 function check(value:any,d:any,depth=0):boolean{
  if(depth>6||!d||typeof d!=='object'||d.$ref)return false;
  if(d.type&&!['object','array','string','number','integer','boolean','null'].includes(d.type))return false;
  if(d.type==='null'&&value!==null)return false;
  if(d.pattern||d.format||d.not||d.$dynamicRef)return false; // Fail closed on an unsupported future schema.
  if(d.const!==undefined&&JSON.stringify(d.const)!==JSON.stringify(value))return false;
  if(d.anyOf&&!d.anyOf.some((x:any)=>check(value,x,depth+1)))return false;
  if(d.oneOf&&d.oneOf.filter((x:any)=>check(value,x,depth+1)).length!==1)return false;
  if(d.allOf&&!d.allOf.every((x:any)=>check(value,x,depth+1)))return false;
  if(d.required&&(!value||typeof value!=='object'||!d.required.every((k:string)=>Object.hasOwn(value,k))))return false;
  if(d.enum&&!d.enum.includes(value))return false;
  if(d.type==='string'&&(typeof value!=='string'||value.length>250||value.length<(d.minLength||0)||value.length>(d.maxLength||250)))return false;
  if(d.type==='number'&&(typeof value!=='number'||!Number.isFinite(value)))return false;
  if(d.type==='integer'&&!Number.isInteger(value))return false;
  if((d.type==='number'||d.type==='integer')&&(Math.abs(value)>1000||value<(d.minimum??-1000)||value>(d.maximum??1000)))return false;
  if(d.type==='boolean'&&typeof value!=='boolean')return false;
  if(d.type==='array'&&(!Array.isArray(value)||value.length>5||!value.every((x:any)=>check(x,d.items,depth+1))))return false;
  if(d.type==='object'){
   if(!value||typeof value!=='object'||Array.isArray(value))return false;
   for(const k of Object.keys(value))if(['__proto__','prototype','constructor'].includes(k)||!Object.hasOwn(d.properties||{},k)||!check(value[k],d.properties[k],depth+1))return false;
  }
  return true;
 }
 if(!check(raw,schema))throw Error('MCP 参数不符合真实 Tool Schema（类型、必填项或范围错误）');
 const v=raw as Dict;
 if(typeof v.identifiers==='string'&&v.identifiers.split(',').filter(Boolean).length>5)throw Error('批量查询最多5个标识');
 if(v.limit!==undefined&&(!Number.isInteger(v.limit)||Number(v.limit)<1||Number(v.limit)>40))throw Error('本工具 MCP limit 上限为 40');
 if(v.offset!==undefined&&(!Number.isInteger(v.offset)||Number(v.offset)<0||Number(v.offset)>200))throw Error('本工具 MCP offset 上限为 200');
 return v;
}
async function fetchLimited(url:string,init:RequestInit={},timeout=17000){
 const r=await fetch(url,{...init,redirect:'manual',signal:AbortSignal.timeout(timeout)});
 if(r.status>=300&&r.status<400)throw Error('上游重定向被阻止');
 if(Number(r.headers.get('content-length'))>850000){await r.body?.cancel();throw Error('上游响应超出 850 KB 安全限制');}
 const reader=r.body?.getReader();let size=0;const chunks:Uint8Array[]=[];
 if(reader)try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>850000){await reader.cancel();throw Error('上游响应超出 850 KB 安全限制');}chunks.push(value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}const content=new TextDecoder().decode(bytes);
 return {response:r,text:content};
}
async function mcpRequest(method:string,params:unknown,session:string|null=null){
 const headers:Record<string,string>={'content-type':'application/json','accept':'application/json, text/event-stream','mcp-protocol-version':'2025-06-18'};
 if(session)headers['mcp-session-id']=session;
 const packet={jsonrpc:'2.0',id:crypto.randomUUID(),method,params};
 const {response,text}=await fetchLimited('https://api.shopsavvy.com/mcp',{method:'POST',headers,body:JSON.stringify(packet)});
 if(!response.ok)throw Object.assign(new Error('ShopSavvy MCP HTTP '+response.status),{httpStatus:response.status,retryAfter:response.headers.get('retry-after')});
 let value:any;
 if((response.headers.get('content-type')||'').includes('text/event-stream')){
  const events=text.split(/\r?\n\r?\n/).map(part=>part.split(/\r?\n/).filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trim()).join('')).filter(Boolean);
  value=events.map(json).find(event=>event?.id===packet.id)||events.map(json).find(event=>event?.result||event?.error);
 }else value=json(text);
 if(!value||value.jsonrpc!=='2.0'||value.id!==packet.id||value.error)throw Error(asString(value?.error?.message,500)||'MCP 协议响应无效');
 return {value:value.result,session:response.headers.get('mcp-session-id')||session,status:response.status};
}
async function mcpConnect(){
 const init=await mcpRequest('initialize',{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'PT-Universe Deal Lab',version:'1.0'}});
 if(init.value?.protocolVersion!=='2025-06-18')throw Error('MCP 协议版本协商失败');
 // Initialized notification is an MCP protocol notification, not an arbitrary REST request.
 const notification=await fetchLimited('https://api.shopsavvy.com/mcp',{method:'POST',headers:{'content-type':'application/json','accept':'application/json, text/event-stream','mcp-protocol-version':'2025-06-18',...(init.session?{'mcp-session-id':init.session}:{})},body:JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})},7000);if(!notification.response.ok)throw Error('MCP initialized notification 失败');
 return init.session;
}
async function mcpExecute(operation:string,args:unknown,env:LabEnv){
 const key='deal-lab/mcp-tools-v2';
 let catalog=json(await env.PT_UNIVERSE_DATA.get(key)||'');
 if(operation==='tools'&&Array.isArray(catalog?.tools))return {tools:catalog.tools.filter((t:any)=>READ_ONLY_MCP.has(t.name)&&t.annotations?.readOnlyHint!==false&&t.annotations?.destructiveHint!==true),protocol:'MCP Streamable HTTP',source:docs.shopsavvy};
 const session=await mcpConnect();
 if(!catalog||!Array.isArray(catalog.tools)){
  catalog=(await mcpRequest('tools/list',{},session)).value;
  if(catalog?.nextCursor)throw Error('MCP 工具目录需要分页，停止使用不完整目录');
  if(catalog?.tools)await env.PT_UNIVERSE_DATA.put(key,JSON.stringify(catalog),{expirationTtl:86400});
 }
 const tools=(catalog?.tools||[]).filter((tool:any)=>READ_ONLY_MCP.has(tool?.name)&&tool.annotations?.readOnlyHint!==false&&tool.annotations?.destructiveHint!==true);
 if(operation==='tools')return {tools,protocol:'MCP Streamable HTTP',source:docs.shopsavvy};
 const tool=tools.find((t:any)=>t.name===operation);
 if(!tool)throw Error('MCP 只允许服务端已公布的只读工具');
 const checked=sanitizeMcpArgs(args,tool.inputSchema);
 const result=await mcpRequest('tools/call',{name:operation,arguments:checked},session);
 if((result.value as any)?.isError)throw Error('MCP 工具报告失败：'+JSON.stringify(result.value).slice(0,350));
 return {tool:operation,toolSchema:tool.inputSchema,toolDescription:tool.description,result:result.value};
}
function cleanHTML(s:string){return s.replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim();}
export function parseSteam(html:string){
 const rows:Array<{rank:number;appid:number;title:string;image:string;release:string;url:string}>=[];const re=/<a\b[^>]*class="[^"]*\bsearch_result_row\b[^"]*"[^>]*>[\s\S]*?<\/a>/gi;
 for(const hit of html.matchAll(re)){
  const body=hit[0];const id=body.match(/\bdata-ds-appid="(\d{1,9})"/)?.[1]||body.match(/\/app\/(\d{1,9})/)?.[1];
  const title=body.match(/<span[^>]*class="[^"]*\btitle\b[^"]*"[^>]*>([\s\S]*?)<\/span>/i)?.[1];
  if(!id||!title||rows.some(r=>r.appid===Number(id)))continue;
  const src=body.match(/<img[^>]+src="(https:\/\/[^"]+)"/i)?.[1]?.replace(/&amp;/g,'&')||'';
  const release=body.match(/<div[^>]*class="[^"]*search_released[^"]*"[^>]*>([\s\S]*?)<\/div>/i)?.[1]||'';
  rows.push({rank:rows.length+1,appid:Number(id),title:cleanHTML(title),image:src,release:cleanHTML(release),url:'https://store.steampowered.com/app/'+id+'/'});
 }
 return rows.slice(0,50);
}
export async function fetchDealSource(provider:string,operation:string,args:Dict,env:LabEnv){
 if(provider==='shopsavvy')return {data:await mcpExecute(operation,args,env),httpStatus:200};
 if(provider==='steam'){
  const {response,text}=await fetchLimited('https://store.steampowered.com/search/?filter=popularwishlist&ignore_preferences=1&cc=us&l=english',{headers:{'accept':'text/html','user-agent':'PT-Universe-Deal-Lab/1.0 (personal research)'}},18000);
  if(!response.ok)throw Object.assign(Error('Steam HTTP '+response.status),{httpStatus:response.status,retryAfter:response.headers.get('retry-after')});
  const items=parseSteam(text);
  if(items.length<5)throw Error('Steam 公开页面格式发生变化或反爬限制，停止展示未验证的排名');
  let previous:Record<number,number>={},snapshotStored=false;
  try{
   const stamp=new Date().toISOString();
   const prev=await env.DB.prepare('SELECT appid,rank FROM deal_lab_steam_rank WHERE day=(SELECT MAX(day) FROM deal_lab_steam_rank)').all<{appid:number;rank:number}>();
   previous=Object.fromEntries((prev.results||[]).map(row=>[row.appid,row.rank]));
   const stmt=env.DB.prepare('INSERT OR REPLACE INTO deal_lab_steam_rank(day,appid,rank,title) VALUES(?,?,?,?)');
   await env.DB.batch(items.map(item=>stmt.bind(stamp,item.appid,item.rank,item.title)));
   snapshotStored=true;
   await env.DB.prepare('DELETE FROM deal_lab_steam_rank WHERE day<?').bind(new Date(Date.now()-90*86400000).toISOString()).run();
  }catch{/* snapshots are optional; never misrepresent unavailable history */}
  return {httpStatus:response.status,data:{items:items.map(item=>({...item,previousRank:previous[item.appid]||null,change:previous[item.appid]?previous[item.appid]-Number(item.rank):null,isNew:Object.keys(previous).length>0&&!previous[item.appid]})),snapshotStored,comparisonAvailable:Object.keys(previous).length>0,metric:'Steam official public ranking, not wishlist counts',source:docs.steam}};
 }
 const def=OPERATIONS[provider]?.[operation];if(!def)throw Error('未知端点');
 const validated=validate(provider,operation,args);
 const bases:Record<string,string>={serpapi:'https://serpapi.com',itad:'https://api.isthereanydeal.com',cheapshark:'https://www.cheapshark.com',gamerpower:'https://www.gamerpower.com'};
 const u=new URL(def.path,bases[provider]);
 for(const [k,v] of Object.entries(validated.params))u.searchParams.set(k,v);
 if(provider==='serpapi'){
  u.searchParams.set('engine',operation==='product'?'google_immersive_product':'google_shopping');
  u.searchParams.set('api_key',env.SERPAPI_KEY||'');
  u.searchParams.set('no_cache','false');
 }
 const headers:Record<string,string>={'accept':'application/json','user-agent':'PT-Universe-Deal-Lab/1.0'};
 if(provider==='itad')headers['ITAD-API-Key']=env.ITAD_API_KEY||'';
 if(def.method==='POST')headers['content-type']='application/json';
 const {response,text}=await fetchLimited(u.toString(),{method:def.method||'GET',headers,body:def.method==='POST'?JSON.stringify(validated.body):undefined});
 if(response.status===429)throw Object.assign(Error(provider+' 上游限流 (429)'),{httpStatus:429,retryAfter:response.headers.get('retry-after')});
 if(!response.ok&&!(provider==='gamerpower'&&response.status===201))throw Object.assign(Error(provider+' 上游 HTTP '+response.status),{httpStatus:response.status});
 const parsed=json(text);
 const data=provider==='gamerpower'&&response.status===201&&Number(parsed?.status)===0?[]:parsed;
 if(data===null)throw Error('上游未返回合法 JSON');
 if(data?.error||data?.errors||data?.search_metadata?.status==='Error')throw Error('上游报告查询失败：'+JSON.stringify(data.error||data.errors||data.search_metadata.status).slice(0,200));
 return {data,httpStatus:response.status};
}
async function bootstrap(env:LabEnv){
 await env.DB.prepare('CREATE TABLE IF NOT EXISTS deal_lab_usage (id TEXT PRIMARY KEY, provider TEXT NOT NULL, created_at INTEGER NOT NULL, status TEXT NOT NULL)').run();
 await env.DB.prepare('CREATE INDEX IF NOT EXISTS deal_lab_usage_idx ON deal_lab_usage(provider,created_at)').run();
 await env.DB.prepare('CREATE TABLE IF NOT EXISTS deal_lab_steam_rank(day TEXT NOT NULL,appid INTEGER NOT NULL,rank INTEGER NOT NULL,title TEXT NOT NULL,PRIMARY KEY(day,appid))').run();
}
async function metrics(env:LabEnv,provider:string){
 const t=now(),b=budgets[provider];
 const r=await env.DB.prepare('SELECT COUNT(*) AS total, SUM(CASE WHEN created_at>=? THEN 1 ELSE 0 END) AS today, SUM(CASE WHEN created_at>=? THEN 1 ELSE 0 END) AS hour, SUM(CASE WHEN created_at>=? THEN 1 ELSE 0 END) AS minute,MAX(created_at) AS latest FROM deal_lab_usage WHERE provider=? AND created_at>=?')
 .bind(t-t%86400000,t-3600000,t-60000,provider,t-31*86400000).first<any>();
 return {month:Number(r?.total||0),day:Number(r?.today||0),hour:Number(r?.hour||0),minute:Number(r?.minute||0),lastCall:r?.latest?new Date(r.latest).toISOString():null,budget:b};
}
async function reserve(env:LabEnv,provider:string){
 const t=now(),b=budgets[provider];
 // One atomic INSERT...SELECT: concurrent requests cannot bypass hard caps.
 const id=crypto.randomUUID();
 const result=await env.DB.prepare("INSERT INTO deal_lab_usage(id,provider,created_at,status) SELECT ?,?,?,? WHERE (SELECT COUNT(*) FROM deal_lab_usage WHERE provider=? AND created_at>=?)<? AND (SELECT COUNT(*) FROM deal_lab_usage WHERE provider=? AND created_at>=?)<? AND (SELECT COUNT(*) FROM deal_lab_usage WHERE provider=? AND created_at>=?)<? AND (SELECT COUNT(*) FROM deal_lab_usage WHERE provider=? AND created_at>=?)<? AND NOT EXISTS(SELECT 1 FROM deal_lab_usage WHERE provider=? AND created_at>?)")
 .bind(id,provider,t,'reserved',provider,t-31*86400000,b.month,provider,t-t%86400000,b.day,provider,t-3600000,b.hour,provider,t-60000,b.minute,provider,t-b.cooldown*1000).run();
 return result.meta.changes===1?id:null;
}
async function budgetRetry(env:LabEnv,provider:string,usage:any){
 const t=now(),b=budgets[provider];let wait=Math.max(0,Date.parse(usage.lastCall||'')+b.cooldown*1000-t)||0;
 if(usage.day>=b.day)wait=Math.max(wait,86400000-t%86400000);
 for(const [field,window,limit] of [['month',31*86400000,b.month],['hour',3600000,b.hour],['minute',60000,b.minute]] as const){
  if(usage[field]>=limit){const row=await env.DB.prepare('SELECT MIN(created_at) AS earliest FROM deal_lab_usage WHERE provider=? AND created_at>=?').bind(provider,t-window).first<any>();if(row?.earliest)wait=Math.max(wait,Number(row.earliest)+window-t);}
 }
 return Math.max(1,Math.ceil(wait/1000));
}
export async function dealLabRoute(request:Request,env:LabEnv,publicKey?:JsonWebKey):Promise<Response|null>{
 const path=new URL(request.url).pathname;
 if(!path.startsWith('/api/deal-lab/'))return null;
 if(request.headers.get('origin')&&request.headers.get('origin')!=='https://ximinhu66.github.io'&&!/^http:\/\/(localhost|127\.0\.0\.1):8000$/.test(request.headers.get('origin')||''))return fail('Origin denied',403);
 if(path==='/api/deal-lab/status'&&request.method==='GET'){
  const owner=!!await verifyMonitorToken((request.headers.get('authorization')||'').replace(/^Bearer /i,''),Date.now(),publicKey);
  // A public status response never triggers external API calls.
  let usage:Dict={};
  if(owner)try{await bootstrap(env);usage=Object.fromEntries(await Promise.all(Object.keys(budgets).map(async p=>[p,await metrics(env,p)])))}catch{}
  const health=owner?Object.fromEntries(await Promise.all(Object.keys(budgets).map(async p=>[p,json(await env.PT_UNIVERSE_DATA.get('deal-lab/health/'+p)||'')]))):{};
  return out({revision:'deal-lab-20261029-v2',usageWindow:'rolling31days',ok:true,authorized:owner,sources:Object.fromEntries(Object.keys(budgets).map(p=>[p,{doc:docs[p],keyRequired:p==='serpapi'||p==='itad',configured:p==='serpapi'?!!env.SERPAPI_KEY:p==='itad'?!!env.ITAD_API_KEY:true,budget:budgets[p],usage:owner?usage[p]:null,policy:POLICIES[p],health:health[p]||null}])),operations:OPERATIONS,mcpReadOnlyTools:[...READ_ONLY_MCP],notice:'Usage numbers are Deal Lab internal calls, not official provider balances.'});
 }
 if(!await verifyMonitorToken((request.headers.get('authorization')||'').replace(/^Bearer /i,''),Date.now(),publicKey))return fail('请先使用现有监控中心完成私有工具中心授权',401,{code:'connect_required'});
 if(request.method!=='POST'||!['/api/deal-lab/query','/api/deal-lab/clear'].includes(path))return fail('Unsupported action',405);
 const raw=await request.text();if(raw.length>5000)return fail('请求体超过安全限制',413);
 const body=json(raw) as any;if(!body||typeof body!=='object')return fail('参数不是 JSON',400);
 const provider=asString(body.provider,24),operation=asString(body.operation,70),force=body.force===true;
 if(!Object.hasOwn(budgets,provider))return fail('不支持的数据源');
 if(provider==='shopsavvy'&&operation!=='tools'&&!READ_ONLY_MCP.has(operation))return fail('只允许 ShopSavvy 的只读 MCP 工具',403);
 if(provider!=='shopsavvy'&&!OPERATIONS[provider]?.[operation])return fail('未知 API Endpoint',400);
 if((provider==='serpapi'&&!env.SERPAPI_KEY)||(provider==='itad'&&!env.ITAD_API_KEY))return fail('待配置 Cloudflare Secret：'+(provider==='serpapi'?'SERPAPI_KEY':'ITAD_API_KEY'),503,{code:'key_missing'});
 let args:Dict={};
 if(body.args&&typeof body.args==='object'&&!Array.isArray(body.args))args=body.args;
 if(JSON.stringify(args).length>3500)return fail('参数超过安全限制',413);
 try{
  let normalized:unknown;try{normalized=provider==='shopsavvy'?args:validate(provider,operation,args);}catch(e:any){return fail(asString(e.message,300),400);}
  const stable=(v:any):any=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
  const cacheKey='deal-lab/cache-v2/'+await hash(JSON.stringify([provider,operation,stable(normalized)]));
  const cached=json(await env.PT_UNIVERSE_DATA.get(cacheKey)||'') as any;
  if(path.endsWith('/clear')){if(cached)await env.PT_UNIVERSE_DATA.put(cacheKey,JSON.stringify({...cached,freshUntil:0}),{expirationTtl:14*86400});return out({ok:true,cleared:true,lastGoodRetained:!!cached});}
  const t=now();
  if(cached&&!force&&cached.freshUntil>t)return out({...cached,ok:true,cache:'hit'});
  const cooldownUntil=Number(await env.PT_UNIVERSE_DATA.get('deal-lab/backoff/'+provider)||0);
  if(cooldownUntil>t)return fail('上游限流冷却中',429,{retryAfter:Math.ceil((cooldownUntil-t)/1000),lastGood:cached||null});
  await bootstrap(env); // fail closed if D1 is not available
  const reservation=await reserve(env,provider);
  if(!reservation){const usage=await metrics(env,provider);return fail('Deal Lab 服务端额度或冷却已达到保护阈值',429,{usage,retryAfter:await budgetRetry(env,provider,usage),lastGood:cached||null});}
  const start=now();
  try{
   const upstream=await fetchDealSource(provider,operation,args,env);
   const data=redact(upstream.data,env);
   await env.DB.prepare('UPDATE deal_lab_usage SET status=? WHERE id=?').bind('success',reservation).run();
   const packet={provider,operation,data,region:provider==='itad'?String(args.country||'US'):['serpapi','cheapshark','steam'].includes(provider)?'US':null,currency:provider==='cheapshark'?'USD':null,source:docs[provider],fetchedAt:new Date().toISOString(),durationMs:now()-start,httpStatus:upstream.httpStatus,cache:'miss',freshUntil:now()+budgets[provider].ttl*1000};
   await env.PT_UNIVERSE_DATA.put(cacheKey,JSON.stringify(packet),{expirationTtl:14*86400});
   await env.PT_UNIVERSE_DATA.put('deal-lab/health/'+provider,JSON.stringify({state:'success',lastSuccess:packet.fetchedAt,httpStatus:upstream.httpStatus}),{expirationTtl:90*86400});
   return out({...packet,ok:true});
  }catch(e:any){
   await env.DB.prepare('UPDATE deal_lab_usage SET status=? WHERE id=?').bind('failed',reservation).run();
   const status=Number(e?.httpStatus)||502;
   const retry=retrySeconds(e?.retryAfter,status===429?1800:0);
   if(status===429)await env.PT_UNIVERSE_DATA.put('deal-lab/backoff/'+provider,String(now()+Math.max(retry,60)*1000),{expirationTtl:Math.max(retry,60)});
   const error=redact(asString(e?.message,500)||'上游请求失败',env) as string;
   const previous=json(await env.PT_UNIVERSE_DATA.get('deal-lab/health/'+provider)||'');
   await env.PT_UNIVERSE_DATA.put('deal-lab/health/'+provider,JSON.stringify({...previous,state:status===429?'rate_limited':'failed',lastAttempt:new Date().toISOString(),httpStatus:status,error}),{expirationTtl:90*86400});
   return fail(error,status>=400&&status<=599?status:502,{retryAfter:retry||null,lastGood:cached||null});
  }
 }catch(e:any){return fail(redact(asString(e?.message,500)||'数据服务不可用（已安全停止上游请求）',env) as string,503);}
}
