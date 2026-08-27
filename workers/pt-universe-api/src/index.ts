import { launch, type Browser, type Page } from '@cloudflare/playwright';

type RefreshScope='all'|'news'|'sites'|'music'|'games';
type RefreshMessage={requestId:string;scope:RefreshScope;source:'manual'|'scheduled';limitKeys?:string[]};
type Json=Record<string,unknown>;

const DATA_FILES=['site-updates.json','acg-news.json','music.json','game-releases.json','feed.json','state.json','game-state.json'];
const RAW='https://raw.githubusercontent.com/XiminHu66/PT-Universe/main/apps/tsugi-checker/data/';
const allowedOrigins=new Set(['https://ximinhu66.github.io','http://localhost:8000','http://127.0.0.1:8000']);
const jsonHeaders={'content-type':'application/json; charset=utf-8','cache-control':'no-store'};

function cors(request:Request){
  const origin=request.headers.get('origin')||'';
  return {'access-control-allow-origin':allowedOrigins.has(origin)?origin:'https://ximinhu66.github.io','access-control-allow-methods':'GET,POST,PUT,OPTIONS','access-control-allow-headers':'authorization,content-type','access-control-max-age':'86400','vary':'Origin'};
}
function reply(request:Request,value:unknown,status=200,extra:HeadersInit={}){return new Response(JSON.stringify(value),{status,headers:{...jsonHeaders,...cors(request),...extra}})}
function error(request:Request,message:string,status=400){return reply(request,{error:message},status)}
function now(){return new Date().toISOString()}
function text(value:unknown){return String(value??'').replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#(?:39|x27);/g,"'").replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim()}
function absolute(value:string,base:string){try{return new URL(value,base).href}catch{return value}}
function safeJson<T>(value:string|null,fallback:T):T{try{return value?JSON.parse(value) as T:fallback}catch{return fallback}}
async function timedFetch(input:RequestInfo|URL,init:RequestInit={},timeout=20_000){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);try{return await fetch(input,{...init,signal:controller.signal})}finally{clearTimeout(timer)}}
async function withDeadline<T>(promise:Promise<T>,timeout:number,label:string):Promise<T>{let timer:ReturnType<typeof setTimeout>|undefined;try{return await Promise.race([promise,new Promise<T>((_,reject)=>{timer=setTimeout(()=>reject(new Error(`${label} 超过 ${Math.round(timeout/1000)} 秒`)),timeout)})])}finally{if(timer)clearTimeout(timer)}}
async function closeFast(target:{close:()=>Promise<unknown>}){try{await withDeadline(target.close(),4_000,'Browser 关闭')}catch{/* Cloudflare 会在事件结束后回收失联会话。 */}}
function tunePage(page:Page){page.setDefaultTimeout(8_000);page.setDefaultNavigationTimeout(20_000);return page}
async function sha256(value:string){const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)));return [...bytes].map(x=>x.toString(16).padStart(2,'0')).join('')}
function timingSafe(a:string,b:string){if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0}

async function getData(env:Env,name:string){
  const cached=await env.PT_UNIVERSE_DATA.get(`data/${name}`);
  if(cached)return cached;
  const response=await fetch(RAW+name,{headers:{'user-agent':'PT-Universe/1.0'}});
  if(!response.ok)throw new Error(`数据 ${name} 不可用`);
  return response.text();
}
async function putData(env:Env,name:string,value:unknown){await env.PT_UNIVERSE_DATA.put(`data/${name}`,JSON.stringify(value),{metadata:{updatedAt:now()}})}
async function previous<T>(env:Env,name:string,fallback:T):Promise<T>{return safeJson(await getData(env,name).catch(()=>null),fallback)}

async function authenticate(request:Request,env:Env,id:string){
  const token=(request.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
  if(!token)return false;
  const row=await env.DB.prepare('SELECT token_hash FROM sync_accounts WHERE sync_id = ?').bind(id).first<{token_hash:string}>();
  return !!row&&timingSafe(row.token_hash,await sha256(token));
}
async function syncRoute(request:Request,env:Env,url:URL){
  if(url.pathname==='/api/sync/register'&&request.method==='POST'){
    const body=await request.json<{id?:string;token?:string}>();
    if(!body.id||!body.token||!/^[-0-9a-f]{36}$/i.test(body.id)||body.token.length<32)return error(request,'无效的同步凭据');
    await env.DB.prepare('INSERT INTO sync_accounts(sync_id,token_hash,created_at) VALUES(?,?,?)').bind(body.id,await sha256(body.token),now()).run();
    return reply(request,{ok:true},201);
  }
  const match=url.pathname.match(/^\/api\/sync\/([^/]+)\/([^/]+)$/);
  if(!match)return null;
  const id=decodeURIComponent(match[1]),scope=decodeURIComponent(match[2]);
  if(!/^[\w-]{1,40}$/.test(scope)||!await authenticate(request,env,id))return error(request,'同步凭据无效',401);
  if(request.method==='GET'){
    const row=await env.DB.prepare('SELECT ciphertext,revision,updated_at FROM sync_blobs WHERE sync_id=? AND scope=?').bind(id,scope).first<{ciphertext:string;revision:number;updated_at:string}>();
    return reply(request,row?{ciphertext:row.ciphertext,revision:row.revision,updatedAt:row.updated_at}:{ciphertext:null,revision:0,updatedAt:null});
  }
  if(request.method==='PUT'){
    const body=await request.json<{ciphertext?:string;baseRevision?:number}>();
    if(!body.ciphertext||body.ciphertext.length>2_000_000)return error(request,'同步数据为空或超过 2 MB');
    const prior=await env.DB.prepare('SELECT revision FROM sync_blobs WHERE sync_id=? AND scope=?').bind(id,scope).first<{revision:number}>();
    const revision=(prior?.revision||0)+1,updatedAt=now();
    await env.DB.prepare(`INSERT INTO sync_blobs(sync_id,scope,ciphertext,revision,updated_at) VALUES(?,?,?,?,?)
      ON CONFLICT(sync_id,scope) DO UPDATE SET ciphertext=excluded.ciphertext,revision=excluded.revision,updated_at=excluded.updated_at`).bind(id,scope,body.ciphertext,revision,updatedAt).run();
    return reply(request,{revision,updatedAt});
  }
  return error(request,'Method not allowed',405);
}

async function enqueue(request:Request,env:Env,scope:RefreshScope,source:'manual'|'scheduled'){
  const requestId=crypto.randomUUID(),stamp=now(),limitKeys:string[]=[];
  if(source==='manual'){
    const key=`${scope}:${request.headers.get('cf-connecting-ip')||'unknown'}`;
    const row=await env.DB.prepare('SELECT last_requested_at FROM refresh_limits WHERE limit_key=?').bind(key).first<{last_requested_at:string}>();
    const cooldown=scope==='all'?12*3600_000:10*60_000;
    if(row&&Date.now()-Date.parse(row.last_requested_at)<cooldown)return error(request,`刷新冷却中，请稍后再试`,429);
    if(scope==='all'||scope==='sites'||scope==='music'){
      const usage=await env.DB.prepare("SELECT COALESCE(SUM(duration_ms),0) AS total FROM refresh_runs WHERE scope IN ('all','sites','music') AND status='success' AND completed_at >= datetime('now','-1 day')").first<{total:number}>();
      if(Number(usage?.total||0)>=240_000)return error(request,'今日 Browser 安全预算已用完，请等待自动刷新',429);
      const browserKey='browser:global',browserRow=await env.DB.prepare('SELECT last_requested_at FROM refresh_limits WHERE limit_key=?').bind(browserKey).first<{last_requested_at:string}>();
      if(browserRow&&Date.now()-Date.parse(browserRow.last_requested_at)<30_000)return error(request,'Browser 会话冷却中，请 30 秒后重试',429);
      await env.DB.prepare('INSERT INTO refresh_limits(limit_key,last_requested_at) VALUES(?,?) ON CONFLICT(limit_key) DO UPDATE SET last_requested_at=excluded.last_requested_at').bind(browserKey,stamp).run();limitKeys.push(browserKey);
    }
    await env.DB.prepare('INSERT INTO refresh_limits(limit_key,last_requested_at) VALUES(?,?) ON CONFLICT(limit_key) DO UPDATE SET last_requested_at=excluded.last_requested_at').bind(key,stamp).run();limitKeys.push(key);
  }
  await env.DB.prepare('INSERT INTO refresh_runs(request_id,scope,source,status) VALUES(?,?,?,?)').bind(requestId,scope,source,'queued').run();
  await env.REFRESH_QUEUE.send({requestId,scope,source,limitKeys} satisfies RefreshMessage);
  return reply(request,{requestId,scope,status:'queued'},202);
}

async function proxyRoute(request:Request,url:URL){
  const common={'user-agent':'PT-Universe/1.0 (+https://github.com/XiminHu66/PT-Universe)','accept':'application/json,text/plain,*/*'};
  let target:URL|undefined;
  if(url.pathname==='/api/weather'){
    const lat=Number(url.searchParams.get('lat')),lon=Number(url.searchParams.get('lon'));
    if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)return error(request,'无效坐标');
    target=new URL('https://api.open-meteo.com/v1/forecast');
    target.search=new URLSearchParams({latitude:String(lat),longitude:String(lon),current:'temperature_2m,apparent_temperature,relative_humidity_2m,is_day,precipitation,rain,weather_code,cloud_cover,wind_speed_10m',hourly:'temperature_2m,precipitation_probability,weather_code',daily:'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max,sunrise,sunset',timezone:'auto',forecast_days:'7',temperature_unit:url.searchParams.get('unit')==='fahrenheit'?'fahrenheit':'celsius',wind_speed_unit:'mph'}).toString();
  }else if(url.pathname==='/api/geocode'){
    const q=(url.searchParams.get('q')||'').slice(0,160);if(!q)return error(request,'缺少地址');
    target=new URL('https://nominatim.openstreetmap.org/search');target.search=new URLSearchParams({q,format:'jsonv2',limit:'5'}).toString();
  }else if(url.pathname==='/api/route'){
    const from=url.searchParams.get('from')||'',to=url.searchParams.get('to')||'';
    if(!/^-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?$/.test(from)||!/^-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?$/.test(to))return error(request,'路线坐标无效');
    target=new URL(`https://router.project-osrm.org/route/v1/driving/${from};${to}`);target.search='overview=false&steps=false&alternatives=true';
  }else if(url.pathname==='/api/live/wallstreet'){
    target=new URL('https://api-one-wscn.awtmt.com/apiv1/content/lives');target.search='channel=global-channel&client=pc&limit=24';
  }
  if(!target)return null;
  const upstream=await fetch(target,{headers:common,cf:{cacheEverything:true,cacheTtl:300}});
  return new Response(upstream.body,{status:upstream.status,headers:{'content-type':upstream.headers.get('content-type')||'application/json',...cors(request),'cache-control':'public,max-age=120'}});
}

function parseRss(xml:string,source:{id:string;label:string;category:string;url:string}){
  const blocks=xml.match(/<(?:item|entry)\b[\s\S]*?<\/(?:item|entry)>/gi)||[];
  return blocks.slice(0,24).map((block,index)=>{
    const pick=(tag:string)=>text((block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`,'i'))||[])[1]);
    const link=pick('link')||((block.match(/<link[^>]+href=["']([^"']+)/i)||[])[1]||'');
    const date=pick('pubDate')||pick('published')||pick('updated');
    return {id:`${source.id}-${Date.parse(date)||index}`,source:source.id,source_label:source.label,category:source.category,title:pick('title'),summary:pick('description')||pick('summary'),url:absolute(link,source.url),published_at:new Date(date||Date.now()).toISOString()};
  }).filter(x=>x.title&&x.url);
}
async function refreshNews(env:Env){
  const sources=[
    {id:'gnn',label:'巴哈姆特 GNN',category:'繁中 ACG',url:'https://gnn.gamer.com.tw/rss.xml'},
    {id:'gcores',label:'机核 GCORES',category:'中文游戏文化',url:'https://www.gcores.com/rss'},
    {id:'yystv',label:'游研社',category:'中文游戏文化',url:'https://www.yystv.cn/rss/feed'},
    {id:'gamelook',label:'GameLook 游戏大观',category:'中文游戏产业',url:'http://www.gamelook.com.cn/feed'}
  ];
  const items:unknown[]=[],states:Record<string,Json>={};
  for(const source of sources){try{const r=await timedFetch(source.url,{headers:{'user-agent':'PT-Universe/1.0'}},15_000);if(!r.ok)throw new Error(String(r.status));const rows=parseRss(await r.text(),source);items.push(...rows);states[source.id]={label:source.label,ok:true,count:rows.length}}catch(e){states[source.id]={label:source.label,ok:false,count:0,error:String(e)}}}
  if(!items.length)throw new Error('全部新闻源失败');
  const value={generated_at:now(),items:items.sort((a:any,b:any)=>Date.parse(b.published_at)-Date.parse(a.published_at)),sources:states};await putData(env,'acg-news.json',value);return {count:items.length,sources:states};
}

async function withBrowser<T>(env:Env,fn:(browser:Browser)=>Promise<T>){
  let browser:Browser|undefined,lastError:unknown;
  for(let attempt=0;attempt<3&&!browser;attempt++)try{browser=await launch(env.BROWSER)}catch(e){lastError=e;if(!String(e).includes('429')||attempt===2)throw e;await new Promise(resolve=>setTimeout(resolve,22_000))}
  if(!browser)throw lastError;
  try{return await fn(browser)}finally{await closeFast(browser)}
}
async function scrapeLinks(browser:Browser,url:string,source:string,label:string,type:string,limit:number,patterns:string[]){
  const page=tunePage(await browser.newPage());try{
    await page.goto(url,{waitUntil:'domcontentloaded',timeout:20_000});
    const rows=await page.locator('a[href]').evaluateAll((els,args)=>els.map((el:any)=>({title:(el.textContent||el.getAttribute('title')||'').trim(),url:el.href,cover:el.querySelector('img')?.src||''})).filter((x:any)=>x.title&&args.patterns.some((p:string)=>x.url.includes(p))).slice(0,args.limit),{patterns,limit});
    return rows.map((x:any,index:number)=>({id:`${source}-${btoa(unescape(encodeURIComponent(x.url))).slice(-24)}`,type,source,source_label:label,title:text(x.title),latest:'',updated_text:'Cloudflare 实时抓取',url:x.url,cover:x.cover,latest_url:x.url,chapter_count:null,fetched_at:now(),order:index}));
  }finally{await closeFast(page)}
}
async function refreshSites(env:Env,sharedBrowser?:Browser){
  const old=await previous<any>(env,'site-updates.json',{items:[]});
  const scrape=async(browser:Browser)=>{
    const sources=[
      {id:'manhuagui',label:'漫画柜',type:'manga',url:'https://m.manhuagui.com/update/',limit:60,patterns:['/comic/']},
      {id:'linovelib',label:'BiliNovel / Linovelib',type:'novel',url:'https://tw.linovelib.com/wenku/',limit:60,patterns:['/novel/','/book/']},
      {id:'copymanga',label:'拷贝漫画 · CopyManga',type:'manga',url:'https://www.mangacopy.com/',limit:48,patterns:['/comic/','/h5/details/comic/']}
    ];
    const items:any[]=[],states:Record<string,Json>={};
    for(const s of sources){try{let rows=await scrapeLinks(browser,s.url,s.id,s.label,s.type,s.limit,s.patterns);if(!rows.length)rows=(old.items||[]).filter((x:any)=>x.source===s.id).slice(0,s.limit);items.push(...rows);states[s.id]={label:s.label,ok:rows.length>0,count:rows.length}}catch(e){const fallback=(old.items||[]).filter((x:any)=>x.source===s.id).slice(0,s.limit);items.push(...fallback);states[s.id]={label:s.label,ok:false,count:fallback.length,error:String(e),fallback:true}}}
    return {generated_at:now(),items,sources:states};
  };
  const result=sharedBrowser?await scrape(sharedBrowser):await withBrowser(env,scrape);
  if(!result.items.length)throw new Error('全部漫画/小说源失败');await putData(env,'site-updates.json',result);return {count:result.items.length,sources:result.sources};
}

async function lookupCover(title:string){try{const r=await timedFetch(`https://itunes.apple.com/search?term=${encodeURIComponent(title)}&country=JP&media=music&limit=1`,{headers:{'user-agent':'PT-Universe/1.0','accept':'application/json'}},6_000);const j=await r.json<any>();return j.results?.[0]?.artworkUrl100?.replace('100x100','300x300')||''}catch{return ''}}
async function refreshMusic(env:Env,sharedBrowser?:Browser){
  const old=await previous<any>(env,'music.json',{});
  const scrape=async(browser:Browser)=>{
    const page=tunePage(await browser.newPage()),sources:Record<string,Json>={};let weekly:any[]=[],recent:any[]=[];
    try{await page.goto('https://www.billboard-japan.com/charts/detail?a=hot100',{waitUntil:'domcontentloaded',timeout:20_000});weekly=await page.locator('td.name_td').evaluateAll(els=>els.slice(0,30).map((el:any,index:number)=>({rank:index+1,title:(el.querySelector('p.musuc_title')?.textContent||'').trim(),artist:(el.querySelector('p.artist_name')?.textContent||'').trim()})).filter((x:any)=>x.title));sources.billboard_japan={label:'Billboard JAPAN Hot 100',ok:true,count:weekly.length}}catch(e){weekly=old.weekly_chart||[];sources.billboard_japan={label:'Billboard JAPAN Hot 100',ok:false,count:weekly.length,error:String(e),fallback:true}}
    try{await page.goto('https://kworb.net/youtube/insights/jp.html',{waitUntil:'domcontentloaded',timeout:20_000});recent=await page.locator('#weeklytable tbody tr').evaluateAll(els=>els.map((el:any,index:number)=>{const c=[...el.querySelectorAll('td')].map((x:any)=>x.textContent.trim()),track=c[2]||'',cut=track.indexOf(' - '),artist=cut>0?track.slice(0,cut).trim():'YouTube Japan',title=cut>0?track.slice(cut+3).trim():track.trim(),weeks=Number(c[3])||0,movement=c[1]||'';return {rank:Number(c[0])||index+1,rank_change:movement,is_new:movement.toUpperCase()==='NEW'||weeks===1,title,artist,weeks,peak:Number(c[4])||null,streams:c[6]||'',streams_change:c[7]||'',url:`https://www.youtube.com/results?search_query=${encodeURIComponent(track)}`,youtube_music_url:`https://music.youtube.com/search?q=${encodeURIComponent(`${title} ${artist}`)}`,source:'youtube_japan_recent',source_label:'YouTube Japan Weekly · 8 周内'}}).filter((x:any)=>x.title&&x.weeks>0&&x.weeks<=8).slice(0,30));if(!recent.length)throw new Error('近期榜无 8 周内歌曲');sources.youtube_japan_recent={label:'YouTube Japan Weekly via Kworb',ok:true,count:recent.length}}catch(e){recent=(old.recent_chart||old.recent_songs||[]).filter((x:any)=>Number(x.weeks||99)<=8).slice(0,30);sources.youtube_japan_recent={label:'YouTube Japan Weekly via Kworb',ok:false,count:recent.length,error:String(e),fallback:true}}finally{await closeFast(page)}
    for(const song of recent.slice(0,12))if(!song.artwork)song.artwork=await lookupCover(`${song.title} ${song.artist}`);
    return {...old,generated_at:now(),chart_date:new Date().toISOString().slice(0,10),recent_chart:recent,recent_songs:recent,weekly_chart:weekly,sources};
  };
  const result=sharedBrowser?await scrape(sharedBrowser):await withBrowser(env,scrape);
  if(!result.recent_chart?.length&&!result.weekly_chart?.length)throw new Error('音乐榜单抓取失败');await putData(env,'music.json',result);return {recent:result.recent_chart.length,weekly:result.weekly_chart.length,sources:result.sources};
}

function parseSteam(html:string){
  return [...html.matchAll(/<a[^>]+data-ds-appid="(\d+)"[\s\S]*?<span class="title">([\s\S]*?)<\/span>[\s\S]*?<div class="col search_released responsive_secondrow">([\s\S]*?)<\/div>/gi)].map(m=>({id:`steam-${m[1]}`,appid:m[1],title:text(m[2]),release_date:text(m[3]),platform:'PC',source:'Steam',url:`https://store.steampowered.com/app/${m[1]}/`}));
}
function isoDate(raw:string){const parsed=Date.parse(raw);return Number.isNaN(parsed)?'':new Date(parsed).toISOString().slice(0,10)}
async function scrapeGames(browser:Browser,old:any,sources:Record<string,Json>){
  const page=tunePage(await browser.newPage()),mobile:any[]=[];let consoleRows:any[]=[];
  const mobileSources=[
    {id:'appstore',label:'App Store 日本 · 新着精选',store:'iOS / iPadOS',region:'JP',url:'https://apps.apple.com/jp/iphone/room/1435822938',patterns:['/jp/app/'],platforms:['iOS']},
    {id:'googleplay',label:'Google Play 日本 · 新作ゲーム',store:'Google Play',region:'JP',url:'https://play.google.com/store/apps/collection/promotion_3000791_new_releases_games?hl=ja&gl=jp',patterns:['/store/apps/details'],platforms:['Android']},
    {id:'taptap_cn_new',label:'TapTap 中国 · 新游',store:'TapTap',region:'CN',url:'https://www.taptap.cn/top/download/new',patterns:['/app/'],platforms:['Android','iOS']},
    {id:'taptap_cn_upcoming',label:'TapTap 中国 · 预约',store:'TapTap',region:'CN',url:'https://www.taptap.cn/upcoming',patterns:['/app/'],platforms:['Android','iOS']}
  ];
  try{
    for(const source of mobileSources){try{await page.goto(source.url,{waitUntil:'domcontentloaded',timeout:20_000});const rows=await page.locator('a[href]').evaluateAll((els,args)=>{const seen=new Set<string>();return els.map((el:any)=>({title:(el.getAttribute('aria-label')||el.querySelector('[title]')?.getAttribute('title')||el.textContent||'').trim(),url:el.href,cover:el.querySelector('img')?.src||''})).filter((x:any)=>x.title&&args.patterns.some((p:string)=>x.url.includes(p))&&!seen.has(x.url)&&seen.add(x.url)).slice(0,16)},{patterns:source.patterns});const prior=(old.items?.mobile||[]).filter((x:any)=>x.source===source.id);const normalized=rows.map((x:any,index:number)=>{const match=prior.find((y:any)=>y.url===x.url);return {...match,id:match?.id||`${source.id}-${index}-${btoa(x.url).slice(-12)}`,category:'mobile',source:source.id,source_label:source.label,store:source.store,title:text(x.title),url:x.url,cover:x.cover||match?.cover||'',platforms:source.platforms,release_date:match?.release_date||'',region:source.region,featured:true,popularity_label:source.id.includes('upcoming')?'预约榜':'新着精选',first_seen:match?.first_seen||new Date().toISOString().slice(0,10)}});mobile.push(...(normalized.length?normalized:prior));sources[source.id]={label:source.label,ok:normalized.length>0,count:normalized.length||prior.length,fallback:!normalized.length}}catch(e){const prior=(old.items?.mobile||[]).filter((x:any)=>x.source===source.id);mobile.push(...prior);sources[source.id]={label:source.label,ok:false,count:prior.length,error:String(e),fallback:true}}}
    try{await page.goto('https://www.famitsu.com/schedule',{waitUntil:'domcontentloaded',timeout:20_000});const rows=await page.locator('a[href]').evaluateAll(els=>{const seen=new Set<string>();return els.map((el:any)=>{const box=el.closest('li,article,section,div'),context=(box?.textContent||el.textContent||'').replace(/\s+/g,' ').trim(),match=context.match(/(20\d{2})年(\d{1,2})月(\d{1,2})日/);return {title:(el.textContent||el.getAttribute('title')||'').trim(),url:el.href,cover:el.querySelector('img')?.src||'',date:match?`${match[1]}-${String(match[2]).padStart(2,'0')}-${String(match[3]).padStart(2,'0')}`:'',context}}).filter((x:any)=>x.title&&x.url.includes('/game/title/')&&!seen.has(x.url)&&seen.add(x.url)).slice(0,200)});const prior=old.items?.console||[];consoleRows=rows.filter((x:any)=>x.date).map((x:any,index:number)=>{const match=prior.find((y:any)=>y.url===x.url),platforms=['Switch 2','Switch','PS5','PS4','Xbox Series X|S'].filter(p=>x.context.includes(p));return {...match,id:match?.id||`famitsu-${index}-${btoa(x.url).slice(-12)}`,category:'console',source:'famitsu',source_label:'Famitsu 日本游戏发行日',store:'发行日历',title:text(x.title),url:x.url,cover:x.cover||match?.cover||'',platforms:platforms.length?platforms:(match?.platforms||[]),release_date:x.date,release_text:`${x.date} 発売`}});if(consoleRows.length<12)consoleRows=prior;sources.famitsu={label:'Famitsu 日本游戏发行日',ok:rows.length>=12,count:consoleRows.length,fallback:rows.length<12}}catch(e){consoleRows=old.items?.console||[];sources.famitsu={label:'Famitsu 日本游戏发行日',ok:false,count:consoleRows.length,error:String(e),fallback:true}}
  }finally{await closeFast(page)}
  return {mobile,consoleRows};
}
async function refreshGames(env:Env){
  const old=await previous<any>(env,'game-releases.json',{items:{mobile:[],pc:[],console:[]},sources:{}}),items={mobile:old.items?.mobile||[],pc:old.items?.pc||[],console:old.items?.console||[]};
  const sources:Record<string,Json>={...(old.sources||{}),snapshot:{label:'游戏快照（QF 暂缓）',ok:true,count:items.mobile.length+items.pc.length+items.console.length,fallback:true}};
  const value={...old,date_jst:new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Tokyo'}),generated_at:now(),items,sources};
  await putData(env,'game-releases.json',value);return {pc:items.pc.length,mobile:items.mobile.length,console:items.console.length,sources};
}

async function runRefresh(env:Env,scope:RefreshScope){
  const result:Json={};
  if(scope==='all'){
    result.news=await refreshNews(env);
    await withBrowser(env,async browser=>{result.sites=await refreshSites(env,browser);result.music=await refreshMusic(env,browser)});
    result.games=await refreshGames(env);
  }else if(scope==='news')result.news=await refreshNews(env);
  else if(scope==='sites')result.sites=await refreshSites(env);
  else if(scope==='music')result.music=await refreshMusic(env);
  else if(scope==='games')result.games=await refreshGames(env);
  const state={generated_at:now(),scope,result};await putData(env,'state.json',state);return result;
}

async function status(env:Env){
  await env.DB.prepare("UPDATE refresh_runs SET status='failed',completed_at=?,error='Refresh session exceeded six minutes and was reclaimed' WHERE status='running' AND datetime(started_at) < datetime('now','-6 minutes')").bind(now()).run();
  const rows=await env.DB.prepare('SELECT request_id,scope,source,status,started_at,completed_at,duration_ms,error,result_json FROM refresh_runs ORDER BY rowid DESC LIMIT 20').all();
  const files:Json[]=[];for(const name of DATA_FILES){const entry=await env.PT_UNIVERSE_DATA.getWithMetadata(`data/${name}`);files.push({name,available:entry.value!==null,metadata:entry.metadata})}
  return {service:'pt-universe-api',time:now(),files,runs:rows.results};
}

export default {
  async fetch(request:Request,env:Env):Promise<Response>{
    const url=new URL(request.url);
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors(request)});
    try{
      if(url.pathname==='/api/health')return reply(request,{ok:true,time:now(),storage:'KV + D1',rssOrbit:'external'});
      if(url.pathname==='/api/status')return reply(request,await status(env));
      if(url.pathname==='/api/analytics'&&request.method==='POST'){
        const body=await request.json<{path?:string}>();const path=String(body.path||'').slice(0,180);
        if(!path.startsWith('/PT-Universe'))return error(request,'无效路径');
        const day=new Date().toISOString().slice(0,10);
        await env.DB.prepare('INSERT INTO analytics_daily(day,path,views) VALUES(?,?,1) ON CONFLICT(day,path) DO UPDATE SET views=views+1').bind(day,path).run();
        return new Response(null,{status:204,headers:cors(request)});
      }
      const sync=await syncRoute(request,env,url);if(sync)return sync;
      const proxy=await proxyRoute(request,url);if(proxy)return proxy;
      const data=url.pathname.match(/^\/api\/data\/([^/]+\.json)$/);
      if(data&&DATA_FILES.includes(data[1]))return new Response(await getData(env,data[1]),{headers:{'content-type':'application/json; charset=utf-8','cache-control':'public,max-age=300,stale-while-revalidate=86400',...cors(request)}});
      const refresh=url.pathname.match(/^\/api\/refresh\/(all|news|sites|music|games)$/);
      if(refresh&&request.method==='POST')return enqueue(request,env,refresh[1] as RefreshScope,'manual');
      const run=url.pathname.match(/^\/api\/refresh\/status\/([\w-]+)$/);
      if(run){const row=await env.DB.prepare('SELECT * FROM refresh_runs WHERE request_id=?').bind(run[1]).first();return row?reply(request,row):error(request,'刷新任务不存在',404)}
      return error(request,'Not found',404);
    }catch(e){console.error('request_failed',{path:url.pathname,error:String(e)});return error(request,e instanceof Error?e.message:String(e),500)}
  },
  async scheduled(_controller:ScheduledController,env:Env,ctx:ExecutionContext){
    ctx.waitUntil((async()=>{
      const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(new Date());
      const pick=(type:string)=>parts.find(x=>x.type===type)?.value||'',hour=Number(pick('hour'));
      if(hour!==9&&hour!==10)return;
      const day=`${pick('year')}-${pick('month')}-${pick('day')}`,key=`scheduled:${day}`;
      const lock=await env.DB.prepare('INSERT OR IGNORE INTO refresh_limits(limit_key,last_requested_at) VALUES(?,?)').bind(key,now()).run();
      if(!lock.meta.changes)return;
      const requestId=crypto.randomUUID();await env.DB.prepare('INSERT INTO refresh_runs(request_id,scope,source,status) VALUES(?,?,?,?)').bind(requestId,'all','scheduled','queued').run();await env.REFRESH_QUEUE.send({requestId,scope:'all',source:'scheduled'} satisfies RefreshMessage);
    })());
  },
  async queue(batch:MessageBatch<RefreshMessage>,env:Env){
    for(const message of batch.messages){const {requestId,scope,limitKeys=[]}=message.body,start=Date.now(),deadline=scope==='all'?225_000:scope==='games'?150_000:scope==='sites'?90_000:scope==='music'?75_000:60_000;try{await env.DB.prepare('UPDATE refresh_runs SET status=?,started_at=? WHERE request_id=?').bind('running',now(),requestId).run();const result=await withDeadline(runRefresh(env,scope),deadline,`${scope} 刷新`);await env.DB.prepare('UPDATE refresh_runs SET status=?,completed_at=?,duration_ms=?,result_json=? WHERE request_id=?').bind('success',now(),Date.now()-start,JSON.stringify(result),requestId).run();message.ack()}catch(e){console.error('refresh_failed',{requestId,scope,error:String(e)});await env.DB.prepare('UPDATE refresh_runs SET status=?,completed_at=?,duration_ms=?,error=? WHERE request_id=?').bind('failed',now(),Date.now()-start,String(e),requestId).run();for(const key of limitKeys)await env.DB.prepare('DELETE FROM refresh_limits WHERE limit_key=?').bind(key).run();message.ack()}}
  }
} satisfies ExportedHandler<Env,RefreshMessage>;
