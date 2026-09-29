import { decodeText } from './novel-reader';
export type Load=(url:string,kind?:string)=>Promise<string>;
const clean=(s:string)=>decodeText(s.replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ').trim();

// Legacy Kuwo responds with single-quoted strings. Convert string tokens, not code.
export function legacyJSON(s:string):any {
 try{return JSON.parse(s);}catch{}
 const converted=s.replace(/'((?:\\.|[^'\\])*)'/g,(_,v)=>JSON.stringify(v.replace(/\\'/g,"'").replace(/\\"/g,'"')));
 return JSON.parse(converted);
}
export async function musicTracks(q:string,load:Load){
 const query=q.trim().slice(0,100);if(!query)throw new Error('请输入歌曲或歌手');
 const p=new URLSearchParams({all:query,ft:'music',client:'kt',pn:'0',rn:'30',rformat:'json',encoding:'utf8',vipver:'1'});
 const d=legacyJSON(await load('https://search.kuwo.cn/r.s?'+p));
 return {source:'酷我公开音源',items:(d.abslist||[]).map((x:any)=>({id:String(x.MUSICRID||'').replace('MUSIC_',''),title:clean(x.SONGNAME||x.NAME||''),artist:clean(x.ARTIST||''),album:clean(x.ALBUM||''),duration:Number(x.DURATION)||0,lossless:/flac|ALFLAC|AL/gi.test(x.MINFO||x.FORMATS||''),artwork:x.hts_MVPIC?.replace(/^http:/,'https:')||'',url:'https://www.kuwo.cn/play_detail/'+String(x.MUSICRID||'').replace('MUSIC_','')})).filter((x:any)=>/^\d+$/.test(x.id)),fetchedAt:new Date().toISOString()};
}
export async function musicFile(id:string,load:Load,kv?:KVNamespace,base=''){
 if(!/^\d{1,15}$/.test(id))throw new Error('歌曲编号无效');
 const p=new URLSearchParams({f:'web',source:'kwplayercar_ar_6.0.0.9_B_jiakong_vh.apk',from:'PC',type:'convert_url_with_sign',br:'flac',rid:id});
 const d=JSON.parse(await load('https://mobi.kuwo.cn/mobi.s?'+p));const url=d.data?.url;
 if(!url)throw new Error('来源没有提供这首歌的 FLAC 下载权限或当前不可用；不会用 MP3 代替');
 const u=new URL(url);if(u.protocol==='http:')u.protocol='https:';
 if(u.protocol!=='https:'||!/(^|\.)(kuwo\.cn|kwcdn\.kuwo\.cn)$/.test(u.hostname))throw new Error('音源地址不在可信来源内');
 if(!/flac/i.test(d.data?.format||u.pathname))throw new Error('来源返回的不是 FLAC，已拒绝伪无损下载');
 const verify=await fetch(u.href,{headers:{range:'bytes=0-4095'},redirect:'manual',signal:AbortSignal.timeout(15000)});
 if(!verify.ok)throw new Error('FLAC 文件无法访问：HTTP '+verify.status);
 const reader=verify.body?.getReader();const chunk=await reader?.read();await reader?.cancel();
 const magic=chunk?.value?new TextDecoder().decode(chunk.value.slice(0,4)):'';
 if(magic!=='fLaC')throw new Error('文件签名不是原始 FLAC，已停止下载');
 if(!kv)throw new Error('缺少媒体存储');
 const ticket=crypto.randomUUID();await kv.put('media/play/'+ticket,JSON.stringify({url:u.href,cookies:'',title:id,kind:'flac'}),{expirationTtl:3600});
 const stream=base+'/api/media/stream?ticket='+ticket;
 return {url:stream,downloadURL:stream+'&download=1',format:'FLAC',verified:true,source:'酷我公开音源',expires:true};
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
 const audio=saved.kind==='flac',su=new URL(saved.url);
 if(audio?su.protocol!=='https:'||!/(^|\.)kuwo\.cn$/.test(su.hostname):!isAnimeMedia(saved.url))throw new Error('来源无效');
 const headers:Record<string,string>={cookie:saved.cookies};const range=request.headers.get('range');if(range&&/^bytes=\d*-\d*$/.test(range))headers.range=range;
 const r=await fetch(saved.url,{headers,redirect:'manual',signal:AbortSignal.timeout(20000)});
 if(![200,206,416].includes(r.status)){await r.body?.cancel();throw new Error('视频来源返回 '+r.status+'，请重新解析');}
 const out=new Headers({'content-type':audio?'audio/flac':'video/mp4','cache-control':'private,no-store','access-control-allow-origin':'https://ximinhu66.github.io','access-control-expose-headers':'Content-Length,Content-Range,Accept-Ranges','x-content-type-options':'nosniff'});
 for(const h of ['content-length','content-range','accept-ranges']){const v=r.headers.get(h);if(v)out.set(h,v);}
 if(u.searchParams.has('download'))out.set('content-disposition',"attachment; filename*=UTF-8''"+encodeURIComponent(saved.title.replace(/[\r\n]/g,'')+(audio?'.flac':'.mp4')));
 return new Response(r.body,{status:r.status,headers:out});
}
