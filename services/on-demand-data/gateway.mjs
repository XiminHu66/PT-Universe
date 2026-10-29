// Only public datasets through the existing signed hub gateway, no arbitrary URL.
export function createOnDemandData({siteOrigin, upstream='http://pt-on-demand-data:8080', transport=fetch}) {
 return async function onDemandData(req,res,url) {
  const prefix='/hub/api/on-demand/';if(!url.pathname.startsWith(prefix))return false;
  const send=(status,value)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(value));};
  if(req.headers.origin!==siteOrigin){send(403,{error:'Origin denied'});return true;}
  const dataset=url.pathname.slice(prefix.length),symbol=url.searchParams.get('symbol')||'';
  if(!['3c','disclosures','stock'].includes(dataset)||(dataset==='stock'?!/^\^?[A-Z][A-Z0-9.=-]{0,14}$/.test(symbol):!!symbol)||[...url.searchParams.keys()].some(k=>!['symbol','force'].includes(k))){send(400,{error:'Invalid public dataset'});return true;}
  if(!['GET','POST'].includes(req.method)){send(405,{error:'GET or POST required'});return true;}
  if(req.headers['transfer-encoding']||Number(req.headers['content-length']||0)>0){send(400,{error:'Body not accepted'});return true;}
  try{
   const query=new URLSearchParams();if(symbol)query.set('symbol',symbol);if(url.searchParams.get('force')==='1')query.set('force','1');
   const r=await transport(upstream+'/'+dataset+'?'+query,{method:req.method,redirect:'error',signal:AbortSignal.timeout(12000)});
   const raw=await r.text();if(Buffer.byteLength(raw)>8*1024*1024)throw Error('response too large');
   send(r.status,JSON.parse(raw));
  }catch{send(502,{error:'按需采集服务暂不可用，保留已有数据'});}
  return true;
 };
}
