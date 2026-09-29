import { readBiliChapter, decodeText } from './novel-reader';
import { animePlayback, animeStream, musicTracks, musicFile, torrentSearch } from './media-sources';
// On-demand metadata and reading; Anime1 uses short-lived playback tickets.
const novels = new Set(['www.wenku8.net','wenku8.net','www.bilinovel.com','www.bilinovel.net','www.linovelib.com','w.linovelib.com']);
const countries = new Set(['us','jp','cn','tw','hk','kr','gb']);
const genres = new Set(['0','14','21','18','17','27','51','2']);
const clean = (s:string) => decodeText(s).replace(/\s+/g,' ').trim();
const stamp = () => new Date().toISOString();
export function mediaURL(raw:string, kind='public') {
 const u = new URL(raw);
 if(u.protocol!=='https:'||u.username||u.password||u.port||u.href.length>2048)throw new Error('请输入有效 HTTPS 链接');
 if(kind==='novel'&&!novels.has(u.hostname))throw new Error('目前支持 wenku8、bilinovel、linovelib 链接');
 if(kind==='anime'&&u.hostname!=='anime1.me')throw new Error('请输入 anime1.me 页面链接');
 if(kind==='public'&&!/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/i.test(u.hostname))throw new Error('不支持本地或 IP 地址');
 return u;
}
async function publicHost(host:string){
 // Resolve both families before accepting arbitrary public HTML URLs. Recheck redirects.
 for(const type of ['A','AAAA']){
  const r=await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=${type}`,{headers:{accept:'application/dns-json'},signal:AbortSignal.timeout(7000)});
  if(!r.ok)throw new Error('域名验证失败');
  const data:any=await r.json();
  for(const a of data.Answer||[]){
   if(a.type===1){const p=a.data.split('.').map(Number);if([0,10,127].includes(p[0])||(p[0]===169&&p[1]===254)||(p[0]===172&&p[1]>=16&&p[1]<=31)||(p[0]===192&&p[1]===168)||(p[0]===100&&p[1]>=64&&p[1]<=127)||p[0]>=224)throw new Error('不允许访问私有网络');}
   if(a.type===28&&(!a.data.startsWith('2')&&!a.data.startsWith('3')))throw new Error('不允许访问非公网 IPv6');
  }
 }
}
async function source(raw:string,kind='fixed',depth=0):Promise<Response>{
 const u=mediaURL(raw,kind);
 if(kind==='public')await publicHost(u.hostname);
 const r=await fetch(u,{redirect:'manual',signal:AbortSignal.timeout(18000),headers:{'user-agent':'PT-Universe MediaVault/1.0','accept':'text/html,application/json,application/xml;q=0.9,*/*;q=0.5'}});
 if(r.status>=300&&r.status<400){if(depth>=3)throw new Error('来源重定向过多');const next=new URL(r.headers.get('location')||'',u);return source(next.href,kind,depth+1);}
 if(!r.ok)throw new Error(`来源返回 HTTP ${r.status}；未获取内容，请稍后重试或在原站查看`);
 return r;
}
async function smallText(r:Response,encoding='utf-8'){
 const reader=r.body?.getReader();if(!reader)throw new Error('来源为空');
 const chunks:Uint8Array[]=[];let size=0;
 while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>3_000_000){await reader.cancel();throw new Error('页面过大，请使用下载引擎');}chunks.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}return new TextDecoder(encoding).decode(bytes);
}
async function html(raw:string,kind='fixed'){
 const r=await source(raw,kind);return smallText(r,raw.includes('wenku8.net')?'gb18030':'utf-8');
}
async function select(markup:string,selector:string,attribute?:string){
 const rows:{text:string;value:string}[]=[];let active:{text:string;value:string}|undefined;
 await new HTMLRewriter().on(selector,{element(e){active={text:'',value:attribute?e.getAttribute(attribute)||'':''};rows.push(active);},text(t){if(active)active.text+=t.text;}}).transform(new Response(markup)).text();
 return rows.map(r=>({...r,text:clean(r.text)}));
}
async function links(markup:string,selector:string,base:string){return (await select(markup,selector,'href')).map(r=>({title:r.text,url:new URL(r.value,base).href})).filter(r=>r.title&&r.url.startsWith('https://'));}
export async function charts(country:string,genre:string){
 if(!countries.has(country)||!genres.has(genre))throw new Error('不支持该国家或曲风');
 if(['cn','kr'].includes(country)){
  const url=`https://rss.marketingtools.apple.com/api/v2/${country}/music/most-played/100/songs.json`;
  const d:any=JSON.parse(await smallText(await source(url)));
  const rows=(d.feed?.results||[]).map((x:any,i:number)=>({...x,rank:i+1})).filter((x:any)=>genre==='0'||x.genres?.some((g:any)=>g.genreId===genre));
  return {kind:'charts',country,genre,source:'Apple Music 热播榜'+(genre==='0'?'':' · 总榜内曲风筛选'),sourceURL:url,updatedAt:d.feed.updated,fetchedAt:stamp(),items:rows.map((x:any)=>({id:x.id,rank:x.rank,title:x.name,artist:x.artistName,artwork:x.artworkUrl100,url:x.url,genre:x.genres?.map((g:any)=>g.name).join(' / '),preview:null}))};
 }
 const url=`https://itunes.apple.com/${country}/rss/topsongs/limit=50/${genre==='0'?'':`genre=${genre}/`}json`;
 const d:any=JSON.parse(await smallText(await source(url)));
 const entries=d.feed?.entry||[];
 if(!entries.length)throw new Error('该地区/曲风没有可用榜单');
 return {kind:'charts',country,genre,source:'iTunes Top Songs · 商店销量榜',sourceURL:url,updatedAt:d.feed.updated?.label||stamp(),fetchedAt:stamp(),items:entries.map((x:any,i:number)=>({id:x.id?.attributes?.['im:id'],rank:i+1,title:x['im:name']?.label,artist:x['im:artist']?.label,artwork:x['im:image']?.at(-1)?.label,url:x.id?.label,genre:x.category?.attributes?.label,preview:(Array.isArray(x.link)?x.link:[x.link].filter(Boolean)).find((l:any)=>l.attributes?.type==='audio/x-m4a')?.attributes?.href}))};
}
async function archiveSearch(q:string,kind:string){
 const safe=q.replace(/[^\p{L}\p{N}\s.'-]/gu,' ').trim().slice(0,120);
 if(!safe)throw new Error('请输入歌曲、艺术家或关键词');
 const query=kind==='flac'?`mediatype:audio AND format:Flac AND (${safe.split(/\s+/).map(x=>'"'+x+'"').join(' AND ')})`:`mediatype:movies AND (${safe.split(/\s+/).map(x=>'"'+x+'"').join(' AND ')})`;
 const u=new URL('https://archive.org/advancedsearch.php');u.search=new URLSearchParams({q:query,output:'json',rows:'24','fl[]':'identifier,title,creator,description,licenseurl',sort:'downloads desc'}).toString();
 const d:any=JSON.parse(await smallText(await source(u.href)));
 return {items:(d.response?.docs||[]).map((x:any)=>({id:x.identifier,title:x.title,artist:Array.isArray(x.creator)?x.creator.join(', '):x.creator||'',url:`https://archive.org/details/${encodeURIComponent(x.identifier)}`,artwork:`https://archive.org/services/img/${encodeURIComponent(x.identifier)}`,license:x.licenseurl||null})),source:'Internet Archive',fetchedAt:stamp()};
}
async function archiveFiles(id:string){
 if(!/^[\w.-]{1,150}$/.test(id))throw new Error('无效资源 ID');
 const d:any=JSON.parse(await smallText(await source('https://archive.org/metadata/'+id)));
 return {title:d.metadata?.title,license:d.metadata?.licenseurl||null,files:(d.files||[]).filter((x:any)=>/\.(flac|mp3|mp4|webm|mkv|srt|vtt|torrent)$/i.test(x.name)&&x.private!=='true').slice(0,300).map((x:any)=>({name:x.name,size:Number(x.size)||0,format:x.format,url:`https://archive.org/download/${id}/${x.name.split('/').map(encodeURIComponent).join('/')}`}))};
}
async function novel(raw:string,chapter=false){
 const u=mediaURL(raw,'novel');
 if(chapter&&!u.hostname.includes('wenku8'))return readBiliChapter(u.href,url=>html(url,'novel'));
 let markup=await html(u.href,'novel');
 if(/just a moment|cf-chl-|人机验证/i.test(markup))throw new Error('来源要求浏览器验证，请在原站查看；不会绕过验证');
 if(chapter){
  markup=await new HTMLRewriter().on('#contentdp,script,style',{element(e){e.remove();}}).on('br',{element(e){e.replace('\n');}}).transform(new Response(markup)).text();
  const body=await select(markup,'#content');const title=(await select(markup,'#title'))[0]?.text;
  if(!body[0]?.text)throw new Error('未识别到正文，可能需要登录或站点结构已变化');
  // select() normalizes whitespace for metadata; preserve paragraph text separately.
  let text='';await new HTMLRewriter().on('#content',{text(t){text+=t.text;}}).transform(new Response(markup)).text();
  return {title:title||'章节',text:text.trim(),url:u.href,fetchedAt:stamp()};
 }
 const wenku=u.hostname.includes('wenku8');
 const title=(await select(markup,wenku?'#content span b, #title':'.book-title'))[0]?.text||(await select(markup,'title'))[0]?.text||'轻小说';
 let catalog=u.href;
 if(wenku&&!u.pathname.includes('/novel/')){catalog=(await links(markup,'legend + div > a',u.href)).find(x=>x.url.includes('/novel/'))?.url||'';}
 if(!wenku){const id=u.pathname.match(/\/(?:novel|download)\/(\d+)/)?.[1];if(!id)throw new Error('无法识别小说编号');catalog=`${u.origin}/novel/${id}/catalog`;}
 if(!catalog)throw new Error('未找到目录，来源可能要求登录');
 if(catalog!==u.href)markup=await html(catalog,'novel');
 const chapters=(await links(markup,wenku?'.ccss a':'.volume-chapters li.jsChapter a',catalog)).filter(x=>/\.(?:html|htm)(?:$|\?)/.test(x.url));
 if(!chapters.length)throw new Error('目录为空；请在原站确认链接，或连接小说引擎');
 return {title,url:u.href,chapters,fetchedAt:stamp(),source:wenku?'轻小说文库':'哔哩轻小说',reader:true};
}
async function novelUpdates(){
 const sources=await Promise.all([...['https://www.wenku8.net/modules/article/toplist.php?sort=lastupdate','https://www.bilinovel.com/']].map(async url=>{try{const m=await html(url,'novel');const items=(await links(m,'a',url)).filter(x=>/\/(book\/\d+\.htm|novel\/\d+\.html)$/.test(x.url));return {url,ok:!!items.length,items:[...new Map(items.map(x=>[x.url,x])).values()].slice(0,30),fetchedAt:stamp(),error:items.length?null:'未识别到更新列表'};}catch(e){return {url,ok:false,items:[],error:String(e),fetchedAt:stamp()};}}));
 return {sources,fetchedAt:stamp()};
}
async function anime(q:string){
 const raw='https://anime1.me/'+(q?'?s='+encodeURIComponent(q.slice(0,100)):'');const markup=await html(raw,'anime');
 // The homepage is a JS-populated catalogue; recent episode links live in the sidebar.
 // Search pages contain actual article headings, so do not mix unrelated sidebar results in.
 const items=await links(markup,q?'.entry-title a':'.widget_recent_entries a',raw);
 if(!items.length)throw new Error('Anime1 当前未返回可用列表；可使用原站搜索或解析单集链接');
 return {items:items.slice(0,30),source:'Anime1',fetchedAt:stamp()};
}
async function video(raw:string){
 const u=mediaURL(raw);const direct=u.pathname.match(/\.(mp4|webm|m4a|mp3|flac|m3u8|mpd|vtt|srt)$/i);
 if(direct)return {title:decodeURIComponent(u.pathname.split('/').pop()||'媒体文件'),formats:[{url:u.href,format:direct[1].toLowerCase(),label:direct[1].toUpperCase(),direct:true}],fetchedAt:stamp()};
 const markup=await html(raw,'public');
 const found=[...await select(markup,'video[src],audio[src],source[src]','src'),...await select(markup,'meta[property="og:video"],meta[property="og:video:url"],meta[property="og:video:secure_url"]','content')];
 const urls=[...new Set(found.map(x=>{try{return mediaURL(new URL(x.value,raw).href).href;}catch{return '';}}).filter(Boolean))];
 const title=(await select(markup,'title'))[0]?.text||u.hostname;
 if(!urls.length)throw new Error('页面没有公开媒体直链；动态视频或 Anime1 播放接口需要连接下载引擎后解析');
 return {title,formats:urls.map(url=>({url,format:url.split('?')[0].split('.').pop()?.toLowerCase(),label:'公开媒体',direct:true})),fetchedAt:stamp()};
}
export async function mediaRoute(request:Request,env?:{PT_UNIVERSE_DATA:KVNamespace}):Promise<any|null>{
 const u=new URL(request.url);if(!u.pathname.startsWith('/api/media/'))return null;
 if(request.method!=='GET')throw new Error('只支持 GET');
 const route=u.pathname.slice('/api/media/'.length),p=u.searchParams;
 if(route==='health')return {ok:true,version:2,engineRequired:['torrent TCP/UDP','generic yt-dlp'],time:stamp()};
 if(route==='stream'){if(!env)throw new Error('缺少播放存储');return animeStream(request,env.PT_UNIVERSE_DATA);}
 if(route==='video'&&new URL(p.get('url')||'https://invalid.example').hostname==='anime1.me'){if(!env)throw new Error('缺少播放存储');return animePlayback(p.get('url')||'',html,env.PT_UNIVERSE_DATA,u.origin);}
 const key=new Request(u.href),cache=await caches.open('media-vault-v2');
 const cached=await cache.match(key);if(cached)return cached.json();
 let data:any;
 if(route==='charts')data=await charts(p.get('country')||'jp',p.get('genre')||'0');
 else if(route==='music/search')data=await archiveSearch(p.get('q')||'','flac');
 else if(route==='music/tracks')data=await musicTracks(p.get('q')||'',html);
 else if(route==='music/file')data=await musicFile(p.get('id')||'',html,env?.PT_UNIVERSE_DATA,u.origin);
 else if(route==='torrent/search')data=await torrentSearch(p.get('q')||'',html);
 else if(route==='archive/files')data=await archiveFiles(p.get('id')||'');
 else if(route==='novel')data=await novel(p.get('url')||'');
 else if(route==='chapter')data=await novel(p.get('url')||'',true);
 else if(route==='novel/updates')data=await novelUpdates();
 else if(route==='anime')data=await anime(p.get('q')||'');
 else if(route==='video')data=await video(p.get('url')||'');
 else throw new Error('未知媒体接口');
 const failed=route==='novel/updates'&&data.sources.some((s:any)=>!s.ok);
 await cache.put(key,new Response(JSON.stringify(data),{headers:{'content-type':'application/json','cache-control':`public,max-age=${route==='music/file'?60:failed?300:route==='charts'?3600:route==='chapter'?86400:900}`}}));
 return data;
}
