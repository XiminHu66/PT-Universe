import {validUrl} from './job-contract.js';
// A catalog is metadata, never a general proxy. Do not propagate upstream text,
// URLs, headers, cookies or exception messages into the account response.
export const CATALOG_TIMEOUT_MS=12000; // Leave room inside the client's 15s request.
const codes=new Set(['catalog_source_invalid','catalog_limiter_unavailable','catalog_rate_limited','catalog_upstream_http','catalog_network','catalog_timeout','catalog_too_large','catalog_invalid_response']);
const failure=(code,status=code==='catalog_source_invalid'?400:code==='catalog_rate_limited'?429:503)=>Object.assign(Error(code),{code,status});
export function catalogFailure(error){
 const code=codes.has(error?.code)?error.code:'catalog_unavailable';
 const status=code==='catalog_source_invalid'?400:code==='catalog_rate_limited'?429:503;
 return {status,body:{error:'Catalog unavailable; verify source access and retry later',code}};
}
async function lookup(source,env,fetcher,signal){
 if(!env.RELAY)throw failure('catalog_limiter_unavailable');
 let permit;
 try{const room=env.RELAY.get(env.RELAY.idFromName('media-vault-private'));permit=await room.fetch('https://private/catalog-permit');}
 catch{throw failure('catalog_limiter_unavailable');}
 if(permit.status!==204){void permit.body?.cancel().catch(()=>{});throw failure(permit.status===429?'catalog_rate_limited':'catalog_limiter_unavailable');}
 signal.throwIfAborted();
 let response;
 try{response=await fetcher('https://pt-universe-api.summer07-nanjolno.workers.dev/api/media/novel?'+new URLSearchParams({url:source}),{cache:'no-store',redirect:'manual',headers:{Accept:'application/json'},signal});}
 catch{throw failure(signal.aborted?'catalog_timeout':'catalog_network');}
 if(!response.ok){void response.body?.cancel().catch(()=>{});throw failure(response.status===429?'catalog_rate_limited':'catalog_upstream_http');}
 const reader=response.body?.getReader();if(!reader)throw failure('catalog_invalid_response');
 const cancel=()=>{void reader.cancel().catch(()=>{});};signal.addEventListener('abort',cancel,{once:true});
 const decoder=new TextDecoder();let bytes=0,text='';
 try{
  for(;;){signal.throwIfAborted();const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>5_000_000)throw failure('catalog_too_large');text+=decoder.decode(value,{stream:true});}
  signal.throwIfAborted();text+=decoder.decode();
 }catch(error){if(error?.code==='catalog_too_large')throw error;throw failure(signal.aborted?'catalog_timeout':'catalog_network');}
 finally{signal.removeEventListener('abort',cancel);cancel();}
 let data;try{data=JSON.parse(text);}catch{throw failure('catalog_invalid_response');}
 if(!data||data.error||!Array.isArray(data.chapters)||!data.chapters.length||data.chapters.length>100001||data.chapters.some(c=>!c||typeof c!=='object'||Array.isArray(c)))throw failure('catalog_invalid_response');
 return {title:String(data.title||'小说').slice(0,199),total:data.chapters.length,chapters:data.chapters.slice(0,5000).map((c,index)=>({index,title:String(c.title||'第'+(index+1)+'章').slice(0,199)})),truncated:data.chapters.length>5000};
}
export async function novelCatalog(source,env,fetcher=fetch){
 if(!validUrl(source,'novel'))throw failure('catalog_source_invalid',400);
 const controller=new AbortController();let timer;
 // Deadline covers limiter, response headers AND body, including a stalled stream.
 const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{reject(failure('catalog_timeout'));controller.abort();},CATALOG_TIMEOUT_MS);});
 try{return await Promise.race([lookup(source,env,fetcher,controller.signal),deadline]);}
 finally{clearTimeout(timer);controller.abort();}
}
