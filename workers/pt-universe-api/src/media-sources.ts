import { decodeText } from './novel-reader';
export type Load=(url:string,kind?:string)=>Promise<string>;
const clean=(s:string)=>decodeText(s.replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ').trim();

export async function ektoplazmSearch(q:string,load:Load){
 const query=q.trim().slice(0,100);if(!query)throw new Error('请输入专辑或艺术家');
 const page=await load('https://ektoplazm.com/?s='+encodeURIComponent(query));
 const albums=[...page.matchAll(/<h[12][^>]*>\s*<a[^>]*href=["'](https:\/\/ektoplazm\.com\/free-music\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/g)].slice(0,8);
 const rows=await Promise.all(albums.map(async m=>{try{const body=await load(m[1]);const url=body.match(/href=["'](https:\/\/ektoplazm\.com\/files\/[^"']*FLAC\.zip)["']/i)?.[1];return url?{title:clean(m[2]),artist:'Ektoplazm',album:'FLAC 专辑压缩包',url:m[1],downloadURL:decodeText(url),format:'FLAC ZIP',lossless:true}:null;}catch{return null;}}));
 return {source:'Ektoplazm · 艺术家公开发行',items:rows.filter(Boolean),fetchedAt:new Date().toISOString()};
}
const tag=(s:string,name:string)=>clean((s.match(new RegExp('<'+name+'(?:\\s[^>]*)?>([\\s\\S]*?)</'+name+'>','i'))?.[1]||'').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1'));
export function parseTorrentFeed(xml:string,source:string){
 return [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/g)].slice(0,35).map(m=>{
  const s=m[1],hash=tag(s,'nyaa:infoHash');const enclosure=s.match(/<enclosure[^>]*url=["']([^"']+)/)?.[1]||'';
  const magnet=(decodeText(s).match(/magnet:\?[^<"\s]+/)?.[0]||'').replace(/\]\]>.*$/,'')||(hash?'magnet:?xt=urn:btih:'+hash:'');
  return {title:tag(s,'title'),url:tag(s,'guid')||tag(s,'link'),magnet,torrent:enclosure||tag(s,'link'),size:tag(s,'nyaa:size'),seeders:Number(tag(s,'nyaa:seeders'))||0,publishedAt:tag(s,'pubDate'),source};
 }).filter(x=>x.title&&(x.magnet||/^https?:/.test(x.torrent)));
}
export async function torrentSearch(q:string,load:Load){
 const query=q.trim().slice(0,100);if(!query)throw new Error('请输入资源名称');
 const feeds=[['Nyaa','https://nyaa.si/?page=rss&c=0_0&f=0&q='+encodeURIComponent(query)],['动漫花园','https://share.dmhy.org/topics/rss/rss.xml?keyword='+encodeURIComponent(query)]];
 const results=await Promise.all(feeds.map(async([name,url])=>{try{return {source:name,ok:true,items:parseTorrentFeed(await load(url),name)};}catch(e){return {source:name,ok:false,error:String(e),items:[]};}}));
 const items=results.flatMap(s=>s.items),seen=new Set<string>();
 return {items:items.filter(x=>{const key=x.magnet?.match(/btih:([^&]+)/i)?.[1]?.toLowerCase()||x.torrent;if(seen.has(key))return false;seen.add(key);return true;}).sort((a,b)=>b.seeders-a.seeders),sources:results.map(({items,...s})=>({...s,count:items.length})),fetchedAt:new Date().toISOString()};
}

export function isAnimeMedia(raw:string){try{const u=new URL(raw);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&/(^|\.)anime1\.me$/.test(u.hostname)&&/\.mp4$/i.test(u.pathname);}catch{return false;}}
export async function animePlayback(raw:string,load:Load,kv:KVNamespace,base:string){
 const u=new URL(raw);if(u.origin!=='https://anime1.me'||!/^\/\d+\/?$/.test(u.pathname))throw new Error('请输入 Anime1 单集链接');
 const markup=await load(u.href,'anime');const apiReq=decodeText(markup.match(/data-apireq=["']([^"']+)/)?.[1]||'');
 if(!apiReq)throw new Error('该页面没有可解析的视频，可能需要站点验证');
 const r=await fetch('https://v.anime1.me/api',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:'d='+apiReq,signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw new Error('Anime1 播放接口返回 '+r.status);
 const d:any=await r.json();const src=d.s?.[0]?.src;const url=src?new URL(src,'https://anime1.me/').href:'';
 if(!isAnimeMedia(url))throw new Error('Anime1 没有提供有效 MP4 播放地址');
 const cookies=r.headers.getSetCookie().map(c=>c.split(';')[0]).filter(c=>/^(e|h|p)=/.test(c)).join('; ');
 const ticket=crypto.randomUUID();const title=tag(markup,'title').replace(/\s*[–-]\s*Anime1.*$/,'');
 await kv.put('media/play/'+ticket,JSON.stringify({url,cookies,title}),{expirationTtl:3600});
 const stream=base+'/api/media/stream?ticket='+ticket;
 return {title,formats:[{url:stream,downloadURL:stream+'&download=1',format:'mp4',label:'MP4 · 源站中文字幕',direct:true}],fetchedAt:new Date().toISOString()};
}
export async function animeStream(request:Request,kv:KVNamespace){
 const u=new URL(request.url),ticket=u.searchParams.get('ticket')||'';if(!/^[a-f0-9-]{36}$/.test(ticket))throw new Error('播放凭据无效');
 const saved=await kv.get<{url:string;cookies:string;title:string;kind?:string}>('media/play/'+ticket,'json');
 if(!saved)throw new Error('播放链接已过期，请重新解析');
 const archive=saved.kind==='archive',audio=archive,su=new URL(saved.url);
 if(archive?su.protocol!=='https:'||su.hostname!=='archive.org':!isAnimeMedia(saved.url))throw new Error('来源无效');
 const headers:Record<string,string>={cookie:saved.cookies};const range=request.headers.get('range');if(range&&/^bytes=\d*-\d*$/.test(range))headers.range=range;
 let r=await fetch(saved.url,{headers,redirect:'manual',signal:AbortSignal.timeout(20000)});
 for(let i=0;archive&&r.status>=300&&r.status<400&&i<4;i++){const next=new URL(r.headers.get('location')||'',r.url||saved.url);if(next.protocol!=='https:'||!/(^|\.)archive\.org$/.test(next.hostname))throw new Error('下载重定向来源无效');await r.body?.cancel();r=await fetch(next,{headers,redirect:'manual',signal:AbortSignal.timeout(20000)});}
 if(![200,206,416].includes(r.status)){await r.body?.cancel();throw new Error('视频来源返回 '+r.status+'，请重新解析');}
 const out=new Headers({'content-type':audio?'audio/flac':'video/mp4','cache-control':'private,no-store','access-control-allow-origin':'https://ximinhu66.github.io','access-control-expose-headers':'Content-Length,Content-Range,Accept-Ranges','x-content-type-options':'nosniff'});
 for(const h of ['content-length','content-range','accept-ranges']){const v=r.headers.get(h);if(v)out.set(h,v);}
 if(u.searchParams.has('download'))out.set('content-disposition',"attachment; filename*=UTF-8''"+encodeURIComponent(saved.title.replace(/[\r\n]/g,'')+(audio?'.flac':'.mp4')));
 return new Response(r.body,{status:r.status,headers:out});
}
