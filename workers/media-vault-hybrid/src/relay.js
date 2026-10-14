// Media remains ephemeral. Durable state contains ONLY ticket digests and counters.
const decoder=new TextDecoder(),CHUNK_MAX=256*1024,ID=/^[0-9a-f]{24}$/;
const CHECKPOINT='transfer-counts',IDLE_MS=120000,RATE_KEY='ticket-permits',RATE_WINDOW=60000,RATE_MAX=12;
export class MediaRelay {
 constructor(ctx,env){
  this.ctx=ctx;this.env=env;this.transfers=new Map();this.starting=false;this.serial=Promise.resolve();
  this.ready=ctx.blockConcurrencyWhile(async()=>{try{await this.recover()}catch(e){await ctx.storage.setAlarm(Date.now()+5000);throw e}});
 }
 agents(){return this.ctx.getWebSockets('media-agent').filter(ws=>ws.readyState===1);}
 exclusive(fn){const p=this.serial.then(fn);this.serial=p.catch(()=>{});return p;}
 async credit(s,bytes,status){
  await this.env.DB.batch([
   this.env.DB.prepare("UPDATE mv_hybrid_transfer_usage SET transferred_bytes=transferred_bytes+?,reserved_bytes=MAX(0,reserved_bytes-?),updated_at=? WHERE month=? AND EXISTS(SELECT 1 FROM mv_hybrid_tickets WHERE digest=? AND status='active')").bind(Math.min(bytes,s.size),s.size,Date.now(),s.period,s.digest),
   this.env.DB.prepare("UPDATE mv_hybrid_tickets SET status=? WHERE digest=? AND status='active'").bind(status,s.digest)
  ]);
 }
 async recover(){
  const saved=await this.ctx.storage.get(CHECKPOINT);
  if(saved){
   // A lost writer cannot resume. An unconfirmed in-flight frame is conservatively
   // charged up to attempted bytes (at most one frame above confirmed bytes).
   await this.credit(saved,saved.outcome?saved.bytes:saved.attempted,saved.outcome||'failed');
   await this.ctx.storage.delete(CHECKPOINT);
  }
  // Redemption belongs to this one object. At boot no live writer exists, so an
  // active ticket without a checkpoint is an orphan from the claim/save boundary.
  // Charge its reserved upper bound rather than understate the transfer budget.
  const orphaned=await this.env.DB.prepare("SELECT digest,bytes AS size,month AS period FROM mv_hybrid_tickets WHERE status='active'").all();
  for(const s of orphaned.results)await this.credit(s,s.size,'failed');
  await this.ctx.storage.deleteAlarm();
 }
 counts(id,s,outcome){return {id,digest:s.digest,period:s.period,size:s.size,bytes:s.bytes,attempted:s.attempted,deadline:s.deadline,...(outcome?{outcome}:{})};}
 async checkpoint(id,s,outcome){await this.ctx.storage.put(CHECKPOINT,this.counts(id,s,outcome));}
 async fetch(request){
  await this.ready;
  const u=new URL(request.url);
  if(u.pathname==='/ticket-permit'){
   return this.exclusive(async()=>{
    const now=Date.now(),saved=await this.ctx.storage.get(RATE_KEY);
    const times=(Array.isArray(saved)?saved:[]).filter(t=>Number.isSafeInteger(t)&&t>now-RATE_WINDOW);
    if(times.length>=RATE_MAX)return new Response('Ticket request rate exceeded',{status:429,headers:{'Retry-After':String(Math.max(1,Math.ceil((times[0]+RATE_WINDOW-now)/1000)))}});
    times.push(now);await this.ctx.storage.put(RATE_KEY,times);
    return new Response(null,{status:204});
   });
  }
  if(u.pathname==='/agent-connect'){
   if(request.headers.get('Upgrade')!=='websocket')return new Response('WebSocket required',{status:426});
   if(this.agents().length)return new Response('Agent already connected',{status:409,headers:{'Retry-After':'5'}});
   const pair=new WebSocketPair(),client=pair[0],server=pair[1];
   this.ctx.acceptWebSocket(server,['media-agent']);
   return new Response(null,{status:101,webSocket:client});
  }
  if(u.pathname==='/stream'){
   const jobId=u.searchParams.get('job'),path=u.searchParams.get('path'),id=u.searchParams.get('transfer');
   const size=Number(u.searchParams.get('size')),name=u.searchParams.get('name')||'download.bin',period=u.searchParams.get('month'),digest=u.searchParams.get('digest');
   if(!ID.test(jobId||'')||!ID.test(id||'')||!path||path.length>300||!Number.isSafeInteger(size)||size<=0||size>12*1024**3||!/^\d{4}-\d{2}$/.test(period||'')||!(/^[0-9a-f]{64}$/).test(digest||''))return new Response('Invalid stream request',{status:400});
   // Claim in the relay, after constructor recovery, so a concurrent bootstrap
   // cannot mistake a freshly redeemed ticket for a lost-process orphan.
   const marked=await this.env.DB.prepare("UPDATE mv_hybrid_tickets SET status='active' WHERE digest=? AND status='new' AND expires_at>?").bind(digest,Date.now()).run();
   if(!marked.meta?.changes)return new Response('Ticket unavailable',{status:403});
   const agents=this.agents();
   if(this.transfers.size||this.starting)return new Response('Transfer already running',{status:429,headers:{'Retry-After':'2'}});
   if(agents.length!==1)return new Response('Agent unavailable',{status:503});
   this.starting=true;
   const {readable,writable}=new FixedLengthStream(size),writer=writable.getWriter();
   const s={writer,jobId,path,size,name,period,digest,bytes:0,attempted:0,deadline:Date.now()+IDLE_MS,agent:agents[0]};
   try{
    // Arm before claiming checkpoint durability; an interrupted start is recoverable.
    await this.ctx.storage.setAlarm(s.deadline);
    await this.checkpoint(id,s);
    this.transfers.set(id,s);
    agents[0].send(JSON.stringify({type:'pull',id,job_id:jobId,path,size}));
   }catch{
    this.transfers.delete(id);await writer.abort().catch(()=>{});
    // If storage or send failed, release immediately via the transport fallback.
    // A surviving checkpoint is harmless because credit is conditional on active.
    return new Response('Agent unavailable',{status:503});
   }finally{this.starting=false;}
   const safeName=name.replace(/[^a-zA-Z0-9._ -]/g,'_').slice(0,130)||'download.bin';
   return new Response(readable,{status:200,headers:{'Content-Type':'application/octet-stream','Content-Disposition':'attachment; filename="'+safeName+'"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Length':String(size)}});
  }
  return new Response('Not found',{status:404});
 }
 async settle(id,success){
  const s=this.transfers.get(id);if(!s)return;if(s.settling)return s.settling;
  s.outcome=s.outcome||(success?'complete':'failed');
  s.settling=this.exclusive(()=>this.settleTransfer(id,s));
  try{await s.settling;}finally{s.settling=null;}
 }
 async settleTransfer(id,s){
  // Persist the terminal decision before D1; a crash/retry cannot change success
  // into failure or double-credit an already committed ledger transaction.
  await this.ctx.storage.setAlarm(Date.now()+5000);
  await this.checkpoint(id,s,s.outcome);
  await this.credit(s,s.bytes,s.outcome);
  await this.ctx.storage.delete(CHECKPOINT);await this.ctx.storage.deleteAlarm();
  if(s.outcome==='complete')await s.writer.close().catch(()=>{});
  else await s.writer.abort('Delivery interrupted').catch(()=>{});
  try{s.agent.send(JSON.stringify(s.outcome==='complete'?{type:'delivered',id,job_id:s.jobId,path:s.path,bytes:s.bytes}:{type:'delivery-failed',id}));}catch{}
  // Keep the agent busy until its terminal message has been sent.
  this.transfers.delete(id);
 }
 async alarm(){
  await this.ready;
  try{
   for(const [id,s] of this.transfers){
    if(s.outcome||s.deadline<=Date.now())await this.settle(id,false);
    else await this.ctx.storage.setAlarm(s.deadline);
   }
   // Failed startup may have persisted counts without a live writer.
   if(!this.transfers.size){const s=await this.ctx.storage.get(CHECKPOINT);if(s){await this.credit(s,s.outcome?s.bytes:s.attempted,s.outcome||'failed');await this.ctx.storage.delete(CHECKPOINT);}}
  }catch{await this.ctx.storage.setAlarm(Date.now()+5000);throw new Error('Transfer settlement temporarily unavailable');}
 }
 async webSocketMessage(ws,message){
  await this.ready;
  if(typeof message==='string'){
   let data;try{data=JSON.parse(message)}catch{return}
   if(!ID.test(data?.id||''))return;const s=this.transfers.get(data.id);if(!s||s.agent!==ws)return;
   if(data.type==='end')await this.settle(data.id,s.bytes===s.size);
   else if(data.type==='error')await this.settle(data.id,false);return;
  }
  const b=message instanceof ArrayBuffer?new Uint8Array(message):new Uint8Array(message.buffer||message);
  if(b.byteLength<=24||b.byteLength>24+CHUNK_MAX)return;
  const id=decoder.decode(b.subarray(0,24)),s=this.transfers.get(id);
  if(!ID.test(id)||!s||s.agent!==ws||s.settling||s.outcome)return;
  // Stop-and-wait protocol: a second frame before ACK is a violation, never
  // a reason to queue more media or overwrite the unconfirmed byte bound.
  if(s.writing){await this.settle(id,false);return;}
  s.writing=true;
  if(s.bytes+b.byteLength-24>s.size){await this.settle(id,false);return;}
  try{
   const allowed=await this.exclusive(async()=>{
    if(this.transfers.get(id)!==s||s.settling||s.outcome)return false;
    s.attempted=s.bytes+b.byteLength-24;s.deadline=Date.now()+IDLE_MS;
    await this.checkpoint(id,s);return true;
   });if(!allowed)return;
   await s.writer.write(b.subarray(24));
   await this.exclusive(async()=>{
    if(this.transfers.get(id)!==s||s.settling||s.outcome)return;
    s.bytes+=b.byteLength-24;await this.checkpoint(id,s);
    ws.send(JSON.stringify({type:'ack',id,bytes:s.bytes}));
   });
  }catch{await this.settle(id,false);}finally{s.writing=false;}
 }
 async webSocketClose(ws){await this.ready;for(const [id,s] of this.transfers)if(s.agent===ws)await this.settle(id,false);}
 async webSocketError(ws){await this.webSocketClose(ws);}
}
