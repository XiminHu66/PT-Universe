// Ephemeral Cloudflare Durable Object relay: media bytes are NEVER written to D1/R2/KV.
const decoder=new TextDecoder();
const CHUNK_MAX=256*1024;
const ID=/^[0-9a-f]{24}$/;
export class MediaRelay {
 constructor(ctx,env){this.ctx=ctx;this.env=env;this.transfers=new Map();}
 agents(){return this.ctx.getWebSockets('media-agent').filter(ws=>ws.readyState===1);}
 async fetch(request){
  const u=new URL(request.url);
  if(u.pathname==='/agent-connect'){
   if(request.headers.get('Upgrade')!=='websocket')return new Response('WebSocket required',{status:426});
   const pair=new WebSocketPair(),client=pair[0],server=pair[1];
   this.ctx.acceptWebSocket(server,['media-agent']);
   return new Response(null,{status:101,webSocket:client});
  }
  if(u.pathname==='/stream'){
   const jobId=u.searchParams.get('job'),path=u.searchParams.get('path'),id=u.searchParams.get('transfer');
   const size=Number(u.searchParams.get('size')),name=u.searchParams.get('name')||'download.bin';
   const period=u.searchParams.get('month');
   if(!ID.test(jobId||'')||!ID.test(id||'')||!path||path.length>300||
      !Number.isSafeInteger(size)||size<=0||size>12*1024**3||!/^\d{4}-\d{2}$/.test(period||''))
      return new Response('Invalid stream request',{status:400});
   const agents=this.agents();
   if(agents.length!==1||this.transfers.size)return new Response('Agent unavailable or transfer already running',{status:503});
   const {readable,writable}=new TransformStream();
   const writer=writable.getWriter();
   this.transfers.set(id,{writer,jobId,path,size,name,period,bytes:0,agent:agents[0]});
   try{agents[0].send(JSON.stringify({type:'pull',id,job_id:jobId,path,size}));}
   catch{this.transfers.delete(id);await writer.abort().catch(()=>{});return new Response('Agent unavailable',{status:503});}
   const safeName=name.replace(/[^a-zA-Z0-9._ -]/g,'_').slice(0,130)||'download.bin';
   return new Response(readable,{status:200,headers:{
     'Content-Type':'application/octet-stream',
     'Content-Disposition':'attachment; filename="'+safeName+'"',
     'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff',
     'Content-Length':String(size)}});
  }
  return new Response('Not found',{status:404});
 }
 async settle(id,success){
  const s=this.transfers.get(id);
  if(!s)return;
  this.transfers.delete(id);
  if(success)await s.writer.close().catch(()=>{});
  else await s.writer.abort('Delivery interrupted').catch(()=>{});
  const delivered=Math.min(s.bytes,s.size);
  // Count delivered stream bytes, even for interrupted transfers.
  await this.env.DB.prepare('UPDATE mv_hybrid_transfer_usage SET transferred_bytes=transferred_bytes+?,reserved_bytes=MAX(0,reserved_bytes-?),updated_at=? WHERE month=?')
   .bind(delivered,s.size,Date.now(),s.period).run();
  try{s.agent.send(JSON.stringify(success?{type:'delivered',id,job_id:s.jobId,path:s.path,bytes:delivered}:{type:'delivery-failed',id}));}catch{}
 }
 async webSocketMessage(ws,message){
  if(typeof message==='string'){
   let data;try{data=JSON.parse(message)}catch{return}
   if(!ID.test(data?.id||''))return;
   const s=this.transfers.get(data.id);
   if(!s||s.agent!==ws)return;
   if(data.type==='end')await this.settle(data.id,s.bytes===s.size);
   else if(data.type==='error')await this.settle(data.id,false);
   return;
  }
  const b=message instanceof ArrayBuffer?new Uint8Array(message):new Uint8Array(message.buffer||message);
  if(b.byteLength<=24||b.byteLength>24+CHUNK_MAX)return;
  const id=decoder.decode(b.subarray(0,24));
  const s=this.transfers.get(id);
  if(!ID.test(id)||!s||s.agent!==ws)return;
  if(s.bytes+b.byteLength-24>s.size){await this.settle(id,false);return;}
  try{
    // Respect browser backpressure. Never buffer the full file in Worker RAM.
    await s.writer.write(b.subarray(24));
    s.bytes+=b.byteLength-24;
    ws.send(JSON.stringify({type:'ack',id,bytes:s.bytes}));
  }catch{await this.settle(id,false);}
 }
 async webSocketClose(ws){for(const [id,s] of this.transfers)if(s.agent===ws)await this.settle(id,false);}
 async webSocketError(ws){for(const [id,s] of this.transfers)if(s.agent===ws)await this.settle(id,false);}
}
