const supported = new Set(['QQQ','NVDA','AMD','GOOGL','SMH']);
export function createKronosGateway({siteOrigin, upstream='http://pt-kronos:8080', transport=fetch}) {
  return async (req, res, url) => {
    if(url.pathname !== '/hub/api/kronos')return false;
    const respond=(status,body)=>{
      res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});
      res.end(JSON.stringify(body));
      return true;
    };
    if(req.headers.origin!==siteOrigin)return respond(403,{error:'Origin denied'});
    if(!['GET','POST'].includes(req.method))return respond(405,{error:'GET or POST required'});
    const [symbol]=url.searchParams.getAll('symbol');
    if([...url.searchParams].length!==1||!supported.has(symbol)||req.headers['transfer-encoding']||Number(req.headers['content-length']||0)>0)
      return respond(400,{error:'Invalid Kronos request'});
    try{
      const reply=await transport(upstream+'/kronos?symbol='+symbol,{method:req.method,redirect:'error',signal:AbortSignal.timeout(6000)});
      const raw=await reply.text();
      if(Buffer.byteLength(raw)>128000)throw Error('Kronos response too large');
      return respond(reply.status,JSON.parse(raw));
    }catch{return respond(503,{error:'Kronos 服务暂不可用'});}
  };
}
