import {onDemandTransport} from './knowledge';
export function publicDatasetPath(request:Request){
 const u=new URL(request.url),prefix='/api/on-demand/';if(!u.pathname.startsWith(prefix))return null;
 const dataset=u.pathname.slice(prefix.length),symbol=u.searchParams.get('symbol')||'';
 if(!['3c','disclosures','stock'].includes(dataset)||(dataset==='stock'?!/^\^?[A-Z][A-Z0-9.=-]{0,14}$/.test(symbol):!!symbol)||[...u.searchParams.keys()].some(k=>!['symbol','force'].includes(k)))throw Error('Invalid public dataset');
 const q=new URLSearchParams();if(symbol)q.set('symbol',symbol);if(u.searchParams.get('force')==='1')q.set('force','1');
 return '/hub/api/on-demand/'+dataset+(q.size?'?'+q:'');
}
export async function onDemandRoute(request:Request,env:{PT_UNIVERSE_DATA:KVNamespace},transport=onDemandTransport):Promise<{body:any;status:number}|null>{
 if(!new URL(request.url).pathname.startsWith('/api/on-demand/'))return null;
 if(!['GET','POST'].includes(request.method))return {body:{error:'GET or POST required'},status:405};
 if(request.method==='POST'&&!['https://ximinhu66.github.io','http://localhost:8000','http://127.0.0.1:8000'].includes(request.headers.get('origin')||''))return {body:{error:'Origin denied'},status:403};
 try{
  const path=publicDatasetPath(request)!;
  if(request.headers.has('transfer-encoding')||Number(request.headers.get('content-length')||0)>0)return {body:{error:'Body not accepted'},status:400};
  const r=await transport(env,path,request.method);const raw=await r.text();
  if(raw.length>8*1024*1024)throw Error('Response too large');
  const body=JSON.parse(raw);return {body,status:r.status};
 }catch{return {body:{error:'按需更新暂不可用，保留上次成功数据；请稍后手动重试'},status:502};}
}
