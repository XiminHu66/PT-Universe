import {readFile} from 'node:fs/promises';
export function createPublicGameFeed({siteOrigin,root='/monitor-data/public-feeds'}){
 return async(req,res,url)=>{
  if(url.pathname!=='/hub/api/public-feeds/games')return false;
  const send=(status,value)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'private, no-store'});res.end(JSON.stringify(value));return true;};
  if(req.headers.origin!==siteOrigin)return send(403,{error:'Origin denied'});
  if(req.method!=='GET')return send(405,{error:'Read only'});
  try{
   const raw=await readFile(root+'/game-releases.json','utf8');if(Buffer.byteLength(raw)>2*1024*1024)throw Error('size');
   const d=JSON.parse(raw);if(!d.generated_at||!d.items||!d.sources)throw Error('shape');
   return send(200,d);
  }catch{return send(503,{error:'Game feed not ready'});}
 };
}
