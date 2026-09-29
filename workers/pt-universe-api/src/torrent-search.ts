import { parseTorrentFeed, type Load } from './media-sources';
type Torrent={title:string;url:string;magnet:string;torrent:string;size:string;seeders:number|null;publishedAt:string;source:string;tracker?:string;lastSeen?:string;sizeBytes?:number;sources?:string[]};
const http=(s:any)=>typeof s==='string'&&/^https?:\/\//i.test(s)?s:'';
const magnet=(s:any)=>typeof s==='string'&&/^magnet:\?xt=urn:btih:(?:[a-f0-9]{40}|[a-z2-7]{32})(?:&|$)/i.test(s)?s:'';
export function parseKnaben(data:any):Torrent[]{
 if(!Array.isArray(data.hits))throw new Error('Knaben 返回格式异常');
 return data.hits.map((x:any)=>({title:String(x.title||''),url:http(x.details),magnet:magnet(x.magnetUrl)||(/^[a-f0-9]{40}$/i.test(x.hash||'')?'magnet:?xt=urn:btih:'+x.hash:''),torrent:http(x.link),size:'',sizeBytes:Number(x.bytes)||0,seeders:Number.isFinite(x.seeders)?x.seeders:null,publishedAt:x.date||'',lastSeen:x.lastSeen||'',source:'Knaben',tracker:String(x.tracker||'')})).filter((x:Torrent)=>x.title&&(x.magnet||x.torrent));
}
export function mergeTorrents(items:Torrent[]){
 const found=new Map<string,Torrent>();
 for(const x of items){
  const key=x.magnet.match(/btih:([^&]+)/i)?.[1]?.toLowerCase()||x.torrent;
  if(!key)continue;const old=found.get(key);
  if(old){old.sources=[...new Set([...(old.sources||[old.source]),x.source])];if(x.seeders!==null&&(old.seeders===null||x.seeders>old.seeders))old.seeders=x.seeders;if(!old.torrent)old.torrent=x.torrent;}
  else found.set(key,{...x,sources:[x.source]});
 }
 return [...found.values()].sort((a,b)=>(b.seeders??-1)-(a.seeders??-1)||Date.parse(b.publishedAt)-Date.parse(a.publishedAt));
}
export async function torrentSearch(q:string,load:Load,variant='',selected='all'){
 const query=q.trim().slice(0,100);if(!query)throw new Error('请输入资源名称');
 const queries=[...new Set([query,variant.trim().slice(0,100)].filter(Boolean))];
 const definitions:[string,()=>Promise<Torrent[]>][]=[
  ['Knaben',async()=>{const r=await fetch('https://api.knaben.org/v1',{method:'POST',headers:{'content-type':'application/json',accept:'application/json'},body:JSON.stringify({search_field:'title',search_type:'100%',query,order_by:'seeders',order_direction:'desc',size:80,from:0,hide_unsafe:true,hide_xxx:true}),signal:AbortSignal.timeout(15000)});if(!r.ok)throw new Error('HTTP '+r.status);return parseKnaben(await r.json());}],
  ['Nyaa',async()=>parseTorrentFeed(await load('https://nyaa.si/?page=rss&c=0_0&f=0&q='+encodeURIComponent(query)),'Nyaa')],
  ['动漫花园',async()=>(await Promise.all(queries.map(async term=>parseTorrentFeed(await load('https://share.dmhy.org/topics/rss/rss.xml?keyword='+encodeURIComponent(term)),'动漫花园').map(x=>({...x,seeders:null}))))).flat()],
  ['蜜柑计划',async()=>(await Promise.all(queries.map(async term=>parseTorrentFeed(await load('https://mikanani.me/RSS/Search?searchstr='+encodeURIComponent(term)),'蜜柑计划')))).flat()]
 ];
 if(selected!=='all'&&!definitions.some(([name])=>name===selected))throw new Error('不支持该 BT 来源');
 const results=await Promise.all(definitions.filter(([name])=>selected==='all'||name===selected).map(async([source,run])=>{try{return {source,ok:true,items:mergeTorrents(await run()),error:null};}catch(e){return {source,ok:false,items:[],error:String(e)};}}));
 return {items:mergeTorrents(results.flatMap(x=>x.items)),sources:results.map(({items,...x})=>({...x,count:items.length})),fetchedAt:new Date().toISOString()};
}
