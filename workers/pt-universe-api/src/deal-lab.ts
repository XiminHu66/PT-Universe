// Deal Lab: owner-scoped, read-only and bounded outbound API explorer.
// All upstream hosts, operations and budgets are hard-coded. There is no generic proxy.
import {verifyMonitorToken} from './monitor';
import {recordRankPage,readRankTrends} from './deal-rank';

type LabEnv={DB:D1Database;PT_UNIVERSE_DATA:KVNamespace;ITAD_API_KEY?:string;SERPAPI_KEY?:string};
type Dict=Record<string,unknown>;
type Op={path:string;method?:'GET'|'POST';params:Record<string,'text'|'id'|'number'|'enum'|'uuid'|'ids'|'token'|'price'>;body?:string;description:string};
const docs:Record<string,string>={
 serpapi:'https://serpapi.com/google-shopping-api',
 itad:'https://docs.isthereanydeal.com/',
 cheapshark:'https://apidocs.cheapshark.com/',
 gamerpower:'https://www.gamerpower.com/api-read',
 steamstore:'https://store.steampowered.com/',fx:'https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html',
 steam:'https://store.steampowered.com/search/?filter=popularwishlist&ignore_preferences=1'
};
export const OPERATIONS:Record<string,Record<string,Op>>={
 serpapi:{search:{path:'/search.json',params:{q:'text',sort_by:'number'},description:'美国 Google Shopping 搜索，USD；不自动分页'},product:{path:'/search.json',params:{page_token:'token'},description:'所选规格详情和跨商家报价'},account:{path:'/account.json',params:{},description:'只读免费套餐与官方余额（白名单字段）'}},
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
 steam:{leaderboard:{path:'/search/results/',params:{page:'number'},description:'全部热门愿望单；每页100项，保留绝对名次'},trends:{path:'local',params:{days:'number'},description:'近30天实际观测排名，不含愿望单人数'}},
 steamstore:{search:{path:'/api/storesearch/',params:{term:'text'},description:'Steam 游戏名称搜索'},price:{path:'/api/appdetails',params:{appid:'number',country:'enum'},description:'指定地区 Steam 真实报价，含CN国区'}},
 fx:{latest:{path:'/stats/eurofxref/eurofxref-daily.xml',params:{},description:'ECB 官方参考汇率'}}
};
for(const [p,ops] of Object.entries({itad:['search','lookup','prices'],cheapshark:['games','game','deals','stores'],gamerpower:['giveaways','filter']}))for(const k of Object.keys(OPERATIONS[p]))if(!ops.includes(k))delete OPERATIONS[p][k];
export const budgets:Record<string,{day:number;minute:number;hour:number;month:number;cooldown:number;ttl:number}>={
 serpapi:{day:20,minute:6,hour:20,month:175,cooldown:5,ttl:3600},
 itad:{day:90,minute:5,hour:60,month:1800,cooldown:10,ttl:10800},
 cheapshark:{day:120,minute:8,hour:40,month:2500,cooldown:2,ttl:10800},
 gamerpower:{day:80,minute:4,hour:30,month:1600,cooldown:15,ttl:7200},
 steam:{day:160,minute:40,hour:120,month:2600,cooldown:1,ttl:86400},
 steamstore:{day:160,minute:12,hour:60,month:2500,cooldown:1,ttl:3600},
 fx:{day:2,minute:1,hour:1,month:40,cooldown:60,ttl:86400}
};
export const POLICIES:Record<string,{free:string;terms:string;note:string}>={
 serpapi:{free:'Free：250次/月、50次/小时；缓存命中不扣官方搜索额度',terms:'https://serpapi.com/pricing',note:'仅允许免费套餐；本工具滚动31天175次上限，保留官方余额75次。Google抓取时间不是商家核价时间。'},

 itad:{free:'已验证邮箱默认1000请求/5分钟；以开发者后台为准',terms:'https://docs.isthereanydeal.com/',note:'个人研究使用；署名、保留原始报价和购买链接；禁止竞争性服务。'},
 cheapshark:{free:'无需Key；未公布固定数值限流，遵守429 Retry-After',terms:'https://apidocs.cheapshark.com/',note:'用户主动搜索；购买链接必须经过 CheapShark redirect；不镜像完整目录。'},
 gamerpower:{free:'无需Key；不超过10请求/秒',terms:'https://www.gamerpower.com/api-read',note:'必须署名 GamerPower。Loot 可能包含 DLC，永久权益及任务条件必须查看原文。'},
 steamstore:{free:'无需Key；按需读取各地区原币报价',terms:'https://store.steampowered.com/subscriber_agreement/',note:'不保证跨地区可购买或可激活；未提供价格不等于免费。'},
 fx:{free:'ECB 公开参考汇率，每日缓存',terms:'https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html',note:'仅用于同币种参考比较，不是结算汇率。'},
 steam:{free:'公开商店搜索页，无正式排行榜API或稳定性承诺',terms:'https://store.steampowered.com/subscriber_agreement/',note:'个人低频读取官方公开搜索排序；24小时缓存。无SteamDB抓取、人数或增长估算；访问受限即停止。'}
};
export function retrySeconds(value:unknown,fallback=0){const n=Number(value);if(value!==null&&value!==''&&value!==undefined&&Number.isFinite(n)&&n>=0)return Math.ceil(n);const t=Date.parse(String(value));return Number.isFinite(t)?Math.max(0,Math.ceil((t-Date.now())/1000)):fallback;}
function redact(value:unknown,env:LabEnv):unknown{
 const secrets=[env.ITAD_API_KEY,env.SERPAPI_KEY].filter(Boolean) as string[];
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
 if(provider==='serpapi'){if(operation==='search'&&!result.q)throw Error('请输入商品名称');if(operation==='product'&&!result.page_token)throw Error('需要来源返回的商品详情令牌');if(result.sort_by&&!['1','2'].includes(result.sort_by))throw Error('不支持的排序');}
 if(provider==='itad'&&operation==='search'&&!result.title)throw Error('请输入游戏名');
 if(provider==='cheapshark'&&operation==='game'&&!result.id)throw Error('需要 CheapShark 游戏 ID');
 if(provider==='gamerpower'&&operation==='giveaway'&&!result.id)throw Error('需要 giveaway ID');

 if(provider==='itad'&&item.params.country){result.country=result.country||'US';if(!/^[A-Z]{2}$/.test(result.country))throw Error('country 必须为两位大写地区代码');}
 const limits:Record<string,number>={limit:provider==='itad'?50:40,results:40,pageSize:40,start:80,offset:200,more_stores:1,sort_by:2,onSale:1,lowerPrice:1000,upperPrice:1000};
 if(provider==='steam'&&operation==='leaderboard'){result.page=result.page||'0';if(+result.page>149)throw Error('单次最多访问150页；超过时停止，不伪称全量完成');}
 if(provider==='steam'&&operation==='trends'){result.days=result.days||'30';if(!['7','30'].includes(result.days))throw Error('趋势窗口仅支持7或30天');}
 if(provider==='steamstore'&&operation==='search'&&!result.term)throw Error('请输入游戏名称');
 if(provider==='steamstore'&&operation==='price'){if(!result.appid)throw Error('需要Steam AppID');result.country=result.country||'CN';if(!['CN','US','HK','JP','GB','DE','BR','CA','AU','KR','TR','IN'].includes(result.country))throw Error('不支持的地区');}
 for(const [k,v] of Object.entries(result))if(limits[k]!==undefined&&(+v>limits[k]||['limit','results','pageSize','sort_by'].includes(k)&&+v<1))throw Error(k+' 超过本工具安全上限 '+limits[k]);
 if(provider==='itad'&&['info','history'].includes(operation)&&!result.id)throw Error('需要 ITAD UUID');
 if(provider==='gamerpower'){if(result.type&&result.type!=='game')throw Error('只保留完整游戏领取');result.type='game';if(operation!=='giveaway'&&!result.platform)throw Error('仅支持 Steam / Epic 领取');if(result.platform&&!result.platform.split(operation==='filter'?'+':'|').every(x=>['steam','epic-games-store'].includes(x)))throw Error('仅支持 Steam / Epic 领取');const enums:Record<string,string[]>={platform:['pc','steam','epic-games-store','gog','ps4','ps5','xbox-one','xbox-series-xs','switch','android','ios','drm-free','itchio'],type:['game','loot','beta'],'sort-by':['date','value','popularity']};for(const [k,values] of Object.entries(enums))if(result[k]&&!result[k].split(operation==='filter'?'+':'|').every(v=>values.includes(v)))throw Error(k+' 选项不受支持');}
 if(provider==='itad'&&operation==='lookup'&&!result.title&&!result.appid)throw Error('需要游戏名或 Steam AppID');
 if(provider==='cheapshark'&&operation==='deal'&&!result.id)throw Error('需要 CheapShark Deal ID');
 return {params:result,body:null};
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
function cleanHTML(s:string){return s.replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim();}
export function parseSteam(html:string,offset=0,limit=100){
 const rows:Array<{rank:number;appid:number;title:string;image:string;release:string;url:string}>=[];const re=/<a\b[^>]*class="[^"]*\bsearch_result_row\b[^"]*"[^>]*>[\s\S]*?<\/a>/gi;
 let position=offset;for(const hit of html.matchAll(re)){position++;
  const body=hit[0];const id=body.match(/\bdata-ds-appid="(\d{1,9})"/)?.[1]||body.match(/\/app\/(\d{1,9})/)?.[1];
  const title=body.match(/<span[^>]*class="[^"]*\btitle\b[^"]*"[^>]*>([\s\S]*?)<\/span>/i)?.[1];
  if(!id||!title||rows.some(r=>r.appid===Number(id)))continue;
  const src=body.match(/<img[^>]+src="(https:\/\/[^"]+)"/i)?.[1]?.replace(/&amp;/g,'&')||'';
  const release=body.match(/<div[^>]*class="[^"]*search_released[^"]*"[^>]*>([\s\S]*?)<\/div>/i)?.[1]||'';
  rows.push({rank:position,appid:Number(id),title:cleanHTML(title),image:src,release:cleanHTML(release),url:'https://store.steampowered.com/app/'+id+'/'});
 }
 return rows.slice(0,limit);
}
export async function fetchDealSource(provider:string,operation:string,args:Dict,env:LabEnv){
 if(provider==='serpapi'){
  const {__fresh,...cleanArgs}=args;const v=validate(provider,operation,cleanArgs),u=new URL('https://serpapi.com/search.json');u.searchParams.set('api_key',env.SERPAPI_KEY||'');
  u.searchParams.set('engine',operation==='search'?'google_shopping':'google_immersive_product');
  if(operation==='search'){u.searchParams.set('q',v.params.q);u.searchParams.set('gl','us');u.searchParams.set('hl','en');u.searchParams.set('location','Seattle, Washington, United States');if(v.params.sort_by)u.searchParams.set('sort_by',v.params.sort_by);}
  else{u.searchParams.set('page_token',v.params.page_token);u.searchParams.set('more_stores','true');}
  if(args.__fresh===true)u.searchParams.set('no_cache','true');
  const {response,text}=await fetchLimited(u.toString(),{headers:{accept:'application/json'}},55000);
  if(!response.ok)throw Object.assign(Error('SerpApi HTTP '+response.status),{httpStatus:response.status,retryAfter:response.headers.get('retry-after')});
  const data=json(text);if(!data||data.error||data.search_metadata?.status!=='Success')throw Error('SerpApi 未返回成功结果：'+String(data?.error||'响应格式变化').slice(0,180));
  if(operation==='product'&&!data.product_results)throw Error('未返回商品详情；令牌可能已失效，请重新搜索');
  return {data,httpStatus:response.status};
 }
 if(provider==='steam'){
  if(operation==='trends')return {data:await readRankTrends(env,Number(args.days||30)),httpStatus:200};
  const page=Number(args.page||0),u=new URL('https://store.steampowered.com/search/results/');
  for(const [k,v] of Object.entries({filter:'popularwishlist',ignore_preferences:'1',cc:'us',l:'english',start:String(page*100),count:'100',infinite:'1'}))u.searchParams.set(k,v);
  const {response,text}=await fetchLimited(u.toString(),{headers:{accept:'application/json','user-agent':'PT-Universe-Deal-Lab/2.0 (personal on-demand research)'}},18000);
  if(!response.ok)throw Object.assign(Error('Steam HTTP '+response.status),{httpStatus:response.status,retryAfter:response.headers.get('retry-after')});
  const payload=json(text),total=Number(payload?.total_count);
  if(payload?.success!==1||!Number.isInteger(total)||total<1||total>15000||typeof payload.results_html!=='string')throw Error('Steam 榜单数据格式变化，已停止读取');
  if(page*100>=total)throw Error('已超出榜单页数');
  const items=parseSteam(payload.results_html,page*100,100);if(items.length<1)throw Error('Steam 未返回有效游戏条目，不能记为成功空页');
  let history:any={items,snapshotStored:false};try{history=await recordRankPage(env,items,page,total);}catch{}
  return {httpStatus:response.status,data:{...history,page,pageSize:100,total,totalPages:Math.ceil(total/100),hasMore:(page+1)*100<total,metric:'Steam official public ranking, not wishlist counts',source:docs.steam}};
 }
 if(provider==='steamstore'){
  const country=String(args.country||'CN'),appid=String(args.appid||'');
  const u=new URL(operation==='search'?'https://store.steampowered.com/api/storesearch/':'https://store.steampowered.com/api/appdetails');
  u.searchParams.set('cc',country.toLowerCase());u.searchParams.set('l',country==='CN'?'schinese':'english');
  if(operation==='search')u.searchParams.set('term',String(args.term));else{u.searchParams.set('appids',appid);u.searchParams.set('filters','basic,price_overview,packages,package_groups');}
  const {response,text}=await fetchLimited(u.toString(),{headers:{accept:'application/json','user-agent':'PT-Universe-Deal-Lab/2.0'}});
  if(!response.ok)throw Object.assign(Error('Steam Store HTTP '+response.status),{httpStatus:response.status,retryAfter:response.headers.get('retry-after')});
  const payload=json(text);if(!payload||typeof payload!=='object')throw Error('Steam 未返回合法数据');
  if(operation==='search'){if(!Array.isArray(payload.items))throw Error('Steam 搜索格式变化');return {data:payload,httpStatus:response.status};}
  const game=payload[appid];if(!game||typeof game.success!=='boolean'||game.success&&Number(game.data?.steam_appid)!==Number(appid))throw Error('Steam 商品数据格式变化或AppID不匹配');
  return {data:{appid:Number(appid),country,available:game.success,game:game.success?game.data:null,source:u.toString()},httpStatus:response.status};
 }
 if(provider==='fx'){
  const {response,text}=await fetchLimited('https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml');
  if(!response.ok)throw Object.assign(Error('ECB HTTP '+response.status),{httpStatus:response.status,retryAfter:response.headers.get('retry-after')});
  const date=text.match(/time=['"](\d{4}-\d{2}-\d{2})['"]/)?.[1];const rates:Record<string,number>={EUR:1};
  for(const m of text.matchAll(/currency=['"]([A-Z]{3})['"]\s+rate=['"]([0-9.]+)['"]/g)){const rate=Number(m[2]);if(Number.isFinite(rate)&&rate>0)rates[m[1]]=rate;}
  if(!date||!rates.CNY||!rates.USD)throw Error('ECB 汇率格式变化，停止换算');
  return {data:{date,base:'EUR',rates,source:docs.fx},httpStatus:response.status};
 }
 const def=OPERATIONS[provider]?.[operation];if(!def)throw Error('未知端点');
 const validated=validate(provider,operation,args);
 const bases:Record<string,string>={itad:'https://api.isthereanydeal.com',cheapshark:'https://www.cheapshark.com',gamerpower:'https://www.gamerpower.com'};
 const u=new URL(def.path,bases[provider]);
 for(const [k,v] of Object.entries(validated.params))u.searchParams.set(k,v);
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
async function serpAccount(env:LabEnv){
 const fingerprint=(await hash(env.SERPAPI_KEY||'')).slice(0,24),key='deal-lab/serp-account/'+fingerprint;
 const cached=json(await env.PT_UNIVERSE_DATA.get(key)||'');if(cached?.validUntil>now())return cached;
 const u=new URL('https://serpapi.com/account.json');u.searchParams.set('api_key',env.SERPAPI_KEY||'');
 const {response,text}=await fetchLimited(u.toString(),{headers:{accept:'application/json'}},12000);
 if(!response.ok)throw Object.assign(Error('SerpApi 套餐验证 HTTP '+response.status),{httpStatus:response.status,retryAfter:response.headers.get('retry-after')});
 const a=json(text);if(!a||a.error||!Number.isFinite(a.plan_searches_left)||!Number.isFinite(a.searches_per_month))throw Error('SerpApi 套餐验证失败，已停止搜索');
 const data={planName:String(a.plan_name||''),freePlanVerified:Number(a.plan_monthly_price)===0&&/free/i.test(String(a.plan_name||a.plan_id||''))&&String(a.account_status).toLowerCase()==='active',searchesLeft:Number(a.plan_searches_left),monthlyLimit:Number(a.searches_per_month),hourlyLimit:Number(a.account_rate_limit_per_hour)||null,renewalDate:typeof a.plan_renewal_date==='string'?a.plan_renewal_date:null,checkedAt:new Date().toISOString(),validUntil:now()+300000};
 await env.PT_UNIVERSE_DATA.put(key,JSON.stringify(data),{expirationTtl:300});return data;
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
  return out({revision:'deal-lab-serpapi-v4',usageWindow:'rolling31days',ok:true,authorized:owner,sources:Object.fromEntries(Object.keys(budgets).map(p=>[p,{doc:docs[p],keyRequired:['itad','serpapi'].includes(p),configured:p==='itad'?!!env.ITAD_API_KEY:p==='serpapi'?!!env.SERPAPI_KEY:true,budget:budgets[p],usage:owner?usage[p]:null,policy:POLICIES[p],health:health[p]||null}])),operations:OPERATIONS,notice:'Usage numbers are Deal Lab internal calls, not official provider balances.'});
 }
 if(!await verifyMonitorToken((request.headers.get('authorization')||'').replace(/^Bearer /i,''),Date.now(),publicKey))return fail('请先使用现有监控中心完成私有工具中心授权',401,{code:'connect_required'});
 if(request.method!=='POST'||!['/api/deal-lab/query','/api/deal-lab/clear'].includes(path))return fail('Unsupported action',405);
 const raw=await request.text();if(raw.length>5000)return fail('请求体超过安全限制',413);
 const body=json(raw) as any;if(!body||typeof body!=='object')return fail('参数不是 JSON',400);
 const provider=asString(body.provider,24),operation=asString(body.operation,70),force=body.force===true;
 if(provider==='shopsavvy')return fail('ShopSavvy 已由 SerpApi 替换',410,{code:'provider_retired'});
 if(!Object.hasOwn(budgets,provider))return fail('不支持的数据源');
 if(!OPERATIONS[provider]?.[operation])return fail('未知 API Endpoint',400);
 if(provider==='serpapi'&&!env.SERPAPI_KEY)return fail('待配置 Cloudflare Secret：SERPAPI_KEY',503,{code:'key_missing'});
 if(provider==='itad'&&!env.ITAD_API_KEY)return fail('待配置 Cloudflare Secret：ITAD_API_KEY',503,{code:'key_missing'});
 let args:Dict={};
 if(body.args&&typeof body.args==='object'&&!Array.isArray(body.args))args=body.args;
 if(JSON.stringify(args).length>3500)return fail('参数超过安全限制',413);
 try{
  let normalized:unknown;try{normalized=validate(provider,operation,args);}catch(e:any){return fail(asString(e.message,300),400);}
  if(provider==='serpapi'&&operation==='account')return out({ok:true,provider,operation,data:await serpAccount(env),cache:'account',httpStatus:200});
  const stable=(v:any):any=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
  const cacheKey=(provider==='serpapi'?'deal-lab/serp-v4/':'deal-lab/poc-v3/')+await hash(JSON.stringify([provider,operation,stable(normalized)]));
  const cached=json(await env.PT_UNIVERSE_DATA.get(cacheKey)||'') as any;
  if(provider==='steam'&&operation==='trends')return out({ok:true,provider,operation,data:await readRankTrends(env,Number(args.days||30)),cache:'local',httpStatus:200,fetchedAt:new Date().toISOString(),source:docs.steam});
  if(path.endsWith('/clear')){if(cached)await env.PT_UNIVERSE_DATA.put(cacheKey,JSON.stringify({...cached,freshUntil:0}),{expirationTtl:14*86400});return out({ok:true,cleared:true,lastGoodRetained:!!cached});}
  const t=now();
  if(cached&&!force&&cached.freshUntil>t&&(provider!=='steam'||operation!=='leaderboard'||cached.data?.day===new Date(t).toISOString().slice(0,10)))return out({...cached,ok:true,cache:'hit'});
  const cooldownUntil=Number(await env.PT_UNIVERSE_DATA.get('deal-lab/backoff/'+provider)||0);
  if(cooldownUntil>t)return fail('上游限流冷却中',429,{retryAfter:Math.ceil((cooldownUntil-t)/1000),lastGood:cached||null});
  await bootstrap(env); // fail closed if D1 is not available
  const reservation=await reserve(env,provider);
  if(!reservation){const usage=await metrics(env,provider);return fail('Deal Lab 服务端额度或冷却已达到保护阈值',429,{usage,retryAfter:await budgetRetry(env,provider,usage),lastGood:cached||null});}
  const start=now();
  try{
   if(provider==='serpapi'){const a=await serpAccount(env);if(!a.freePlanVerified)throw Object.assign(Error('安全停止：仅允许已验证的 SerpApi Free 套餐'),{httpStatus:403});if(a.searchesLeft<=75)throw Object.assign(Error('安全停止：SerpApi 官方剩余额度已进入75次保留区'),{httpStatus:429,retryAfter:3600});}
   const upstream=await fetchDealSource(provider,operation,provider==='serpapi'?{...args,__fresh:force}:args,env);
   const data=redact(upstream.data,env);
   await env.DB.prepare('UPDATE deal_lab_usage SET status=? WHERE id=?').bind('success',reservation).run();
   const packet={provider,operation,data,region:provider==='steamstore'?String(args.country||'CN'):provider==='itad'?String(args.country||'US'):['cheapshark','steam'].includes(provider)?'US':null,currency:provider==='cheapshark'?'USD':null,source:docs[provider],fetchedAt:new Date().toISOString(),durationMs:now()-start,httpStatus:upstream.httpStatus,cache:'miss',freshUntil:now()+budgets[provider].ttl*1000};
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
