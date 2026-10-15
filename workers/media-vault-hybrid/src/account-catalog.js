import {validUrl} from './job-contract.js';
// Fixed metadata service only. Never forwards a browser cookie, credential,
// arbitrary headers or a media response to a source site.
export async function novelCatalog(source,env,fetcher=fetch){
 if(!validUrl(source,'novel'))throw Object.assign(Error('Unsupported novel source'),{status:400});
 if(!env.RELAY)throw Object.assign(Error('Metadata limiter unavailable'),{status:503});
 const room=env.RELAY.get(env.RELAY.idFromName('media-vault-private'));
 const permit=await room.fetch('https://private/catalog-permit');
 if(permit.status!==204)throw Object.assign(Error('Catalog request rate exceeded'),{status:permit.status===429?429:503});
 const response=await fetcher('https://pt-universe-api.summer07-nanjolno.workers.dev/api/media/novel?'+new URLSearchParams({url:source}),{cache:'no-store',redirect:'error',headers:{Accept:'application/json'},signal:AbortSignal.timeout(15000)});
 if(!response.ok){await response.body?.cancel();throw Object.assign(Error('Source unavailable'),{status:response.status===429?429:503});}
 // Limit even a chunked response before JSON parsing; metadata never becomes
 // a general file proxy and cannot consume unbounded memory.
 const reader=response.body.getReader(),decoder=new TextDecoder();let bytes=0,text='';
 try{for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>5_000_000)throw Error('Catalog too large');text+=decoder.decode(value,{stream:true});}text+=decoder.decode();}finally{await reader.cancel();}
 const data=JSON.parse(text);
 if(data.error||!Array.isArray(data.chapters)||!data.chapters.length||data.chapters.length>100001)throw Error('No complete catalog available');
 return {title:String(data.title||'小说').slice(0,199),total:data.chapters.length,chapters:data.chapters.slice(0,5000).map((c,index)=>({index,title:String(c.title||'第'+(index+1)+'章').slice(0,199)})),truncated:data.chapters.length>5000};
}
