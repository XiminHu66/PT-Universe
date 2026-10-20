// Media remains ephemeral. Durable state contains ONLY ticket digests and counters.
const decoder=new TextDecoder(),CHUNK_MAX=256*1024,ID=/^[0-9a-f]{24}$/;
const CHECKPOINT='transfer-counts',AGENT_LEASE_MS=60000,PROBE_MS=3000,START_MS=15000,IDLE_MS=120000,RATE_KEY='ticket-permits',RATE_WINDOW=60000,RATE_MAX=12;
export class MediaRelay {
 constructor(ctx,env){
  this.ctx=ctx;this.env=env;this.transfers=new Map();this.admissions=new Set();this.starting=false;this.serial=Promise.resolve();this.probes=new Map();this.githubCalls=new Map();
  this.ready=ctx.blockConcurrencyWhile(async()=>{try{await this.recover()}catch(e){await ctx.storage.setAlarm(Date.now()+5000);throw e}});
 }
 attachment(ws){try{return ws.deserializeAttachment()||{}}catch{return {}}}
 retire(ws){
  const a=this.attachment(ws);try{ws.serializeAttachment({...a,retired:true})}catch{}
  try{ws.close(1012,'Agent heartbeat expired')}catch{}
  for(const [id,p] of this.probes)if(p.ws===ws){clearTimeout(p.timer);this.probes.delete(id);p.finish('offline');}
  for(const [id,p] of this.githubCalls)if(p.ws===ws){clearTimeout(p.timer);this.githubCalls.delete(id);p.finish(new Response('Private login relay unavailable',{status:503}));}
 }
 agents(){return this.ctx.getWebSockets('media-agent').filter(ws=>{
  const a=this.attachment(ws),fresh=ws.readyState===1&&!a.retired&&Number.isSafeInteger(a.seen)&&Date.now()-a.seen<=AGENT_LEASE_MS;
  if(!fresh)this.retire(ws);return fresh;
 });}
 async channel(probe=false){
  const agents=this.agents();if(agents.length!==1)return 'offline';
  if(this.transfers.size||this.starting||this.githubCalls.size||this.probes.size>=4)return 'busy';
  if(!probe)return 'ready';
  const ws=agents[0],id=crypto.randomUUID().replaceAll('-','').slice(0,24);
  return new Promise(resolve=>{
   const p={ws,finish:resolve,timer:setTimeout(()=>{this.probes.delete(id);this.retire(ws);resolve('offline');},PROBE_MS)};
   this.probes.set(id,p);
   try{ws.send(JSON.stringify({type:'probe',id}));}catch{clearTimeout(p.timer);this.probes.delete(id);this.retire(ws);resolve('offline');}
  });
 }
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
  if(u.pathname==='/github-login'){
   if(request.method!=='POST')return new Response(null,{status:405});
   const text=await request.text();if(text.length>3500)return new Response(null,{status:413});
   let data;try{data=JSON.parse(text);}catch{return new Response(null,{status:400});}
   if(!['probe','manifest','token','user'].includes(data?.operation)||!data.payload||typeof data.payload!=='object'||Array.isArray(data.payload)||Object.keys(data).some(k=>!['operation','payload'].includes(k)))return new Response(null,{status:400});
   const agents=this.agents();if(agents.length!==1)return new Response(null,{status:503});
   if(this.githubCalls.size)return new Response(null,{status:429});
   const allowed=await this.exclusive(async()=>{
    const now=Date.now(),prior=await this.ctx.storage.get('github-login-permits'),times=(Array.isArray(prior)?prior:[]).filter(t=>Number.isSafeInteger(t)&&t>now-60000);
    if(times.length>=20)return false;times.push(now);await this.ctx.storage.put('github-login-permits',times);return true;
   });
   if(!allowed||this.githubCalls.size)return new Response(null,{status:429});
   const ws=agents[0],id=crypto.randomUUID().replaceAll('-','').slice(0,24);
   return new Promise(resolve=>{
    const pending={ws,finish:resolve,timer:setTimeout(()=>{this.githubCalls.delete(id);resolve(new Response(null,{status:504}));},16000)};
    this.githubCalls.set(id,pending);
    try{ws.send(JSON.stringify({type:'github-request',id,...data}));}catch{clearTimeout(pending.timer);this.githubCalls.delete(id);resolve(new Response(null,{status:503}));}
   });
  }
  if(u.pathname==='/agent-ready'){const channel=await this.channel(true);return new Response(channel==='ready'?null:channel,{status:channel==='ready'?204:channel==='busy'?429:503,headers:{'Retry-After':'3'}});}
  if(u.pathname==='/ticket-permit'||u.pathname==='/catalog-permit'){
   return this.exclusive(async()=>{
    const catalog=u.pathname==='/catalog-permit',key=catalog?'catalog-permits':RATE_KEY,max=catalog?6:RATE_MAX;
    const now=Date.now(),saved=await this.ctx.storage.get(key);
    const times=(Array.isArray(saved)?saved:[]).filter(t=>Number.isSafeInteger(t)&&t>now-RATE_WINDOW);
    if(times.length>=max)return new Response('Request rate exceeded',{status:429,headers:{'Retry-After':String(Math.max(1,Math.ceil((times[0]+RATE_WINDOW-now)/1000)))}});
    times.push(now);await this.ctx.storage.put(key,times);
    return new Response(null,{status:204});
   });
  }
  if(u.pathname==='/agent-connect'){
   if(request.headers.get('Upgrade')!=='websocket')return new Response('WebSocket required',{status:426});
   if(this.agents().length){
    // An OPEN wrapper can outlive a dead network connection. Probe it before
    // refusing the authenticated replacement; never replace a healthy writer.
    const existing=await this.channel(true);
    if(existing!=='offline'||this.agents().length)return new Response('Agent already connected',{status:409,headers:{'Retry-After':'5'}});
   }
   const pair=new WebSocketPair(),client=pair[0],server=pair[1];
   server.serializeAttachment({seen:Date.now(),retired:false});
   this.ctx.acceptWebSocket(server,['media-agent']);
   return new Response(null,{status:101,webSocket:client});
  }
  if(u.pathname==='/stream'){
   const jobId=u.searchParams.get('job'),path=u.searchParams.get('path'),id=u.searchParams.get('transfer');
   const size=Number(u.searchParams.get('size')),name=u.searchParams.get('name')||'download.bin',period=u.searchParams.get('month'),digest=u.searchParams.get('digest');
   if(!ID.test(jobId||'')||!ID.test(id||'')||!path||path.length>300||!Number.isSafeInteger(size)||size<=0||size>12*1024**3||!/^\d{4}-\d{2}$/.test(period||'')||!(/^[0-9a-f]{64}$/).test(digest||''))return new Response('Invalid stream request',{status:400});
   // Protect one ticket before the asynchronous socket probe. A duplicate
   // must get 403, never a busy response that releases the first redemption's
   // reservation in the transport fallback. Other tickets remain independent.
   if(this.admissions.has(digest)||[...this.transfers.values()].some(s=>s.digest===digest))return new Response('Ticket unavailable',{status:403});
   this.admissions.add(digest);
   try{
   const live=await this.channel(true);
   if(live!=='ready')return new Response(live==='busy'?'Transfer already running':'Agent unavailable',{status:live==='busy'?429:503,headers:{'Retry-After':'3'}});
   // Claim in the relay, after constructor recovery, so a concurrent bootstrap
   // cannot mistake a freshly redeemed ticket for a lost-process orphan.
   const marked=await this.env.DB.prepare("UPDATE mv_hybrid_tickets SET status='active' WHERE digest=? AND status='new' AND expires_at>? AND EXISTS(SELECT 1 FROM mv_hybrid_jobs WHERE id=mv_hybrid_tickets.job_id AND status='complete')").bind(digest,Date.now()).run();
   if(!marked.meta?.changes)return new Response('Ticket unavailable',{status:403});
   const agents=this.agents();
   if(this.transfers.size||this.starting)return new Response('Transfer already running',{status:429,headers:{'Retry-After':'2'}});
   if(agents.length!==1)return new Response('Agent unavailable',{status:503});
   this.starting=true;
   const {readable,writable}=new FixedLengthStream(size),writer=writable.getWriter();
   const s={writer,jobId,path,size,name,period,digest,bytes:0,attempted:0,deadline:Date.now()+START_MS,agent:agents[0]};
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
   }finally{this.admissions.delete(digest);}
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
  const attachment=this.attachment(ws);
  if(attachment.retired||ws.readyState!==1)return;
  // A heartbeat proves the exact retained socket is responsive after idle or
  // hibernation; an expired socket cannot revive after a replacement is accepted.
  if(!Number.isSafeInteger(attachment.seen)||Date.now()-attachment.seen>AGENT_LEASE_MS){this.retire(ws);return;}
  ws.serializeAttachment({...attachment,seen:Date.now()});
  if(message==='mv-ping'){ws.send('mv-pong');return;}
  if(typeof message==='string'){
   if(message.length>16000)return;
   let data;try{data=JSON.parse(message)}catch{return}
   if(!ID.test(data?.id||''))return;
   if(data.type==='github-response'){
    const p=this.githubCalls.get(data.id);if(!p||p.ws!==ws)return;
    if(!Number.isInteger(data.status)||data.status<200||data.status>599||[204,205,304].includes(data.status)||!data.data||typeof data.data!=='object'||Array.isArray(data.data))return;
    clearTimeout(p.timer);this.githubCalls.delete(data.id);
    p.finish(new Response(JSON.stringify(data.data),{status:data.status,headers:{'Content-Type':'application/json','Cache-Control':'no-store',...(data.rate_limited===true?{'X-RateLimit-Remaining':'0'}:{})}}));return;
   }
   if(data.type==='probe-ok'||data.type==='probe-busy'){
    const p=this.probes.get(data.id);if(p?.ws===ws){clearTimeout(p.timer);this.probes.delete(data.id);p.finish(data.type==='probe-ok'?'ready':'busy');}return;
   }
   const s=this.transfers.get(data.id);if(!s||s.agent!==ws)return;
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
    s.attempted=s.bytes+b.byteLength-24;s.deadline=Date.now()+(s.bytes===0?START_MS:IDLE_MS);
    await this.checkpoint(id,s);return true;
   });if(!allowed)return;
   await s.writer.write(b.subarray(24));
   await this.exclusive(async()=>{
    if(this.transfers.get(id)!==s||s.settling||s.outcome)return;
    s.bytes+=b.byteLength-24;s.deadline=Date.now()+IDLE_MS;await this.checkpoint(id,s);
    ws.send(JSON.stringify({type:'ack',id,bytes:s.bytes}));
   });
  }catch{await this.settle(id,false);}finally{s.writing=false;}
 }
 async webSocketClose(ws){await this.ready;this.retire(ws);for(const [id,s] of this.transfers)if(s.agent===ws)await this.settle(id,false);}
 async webSocketError(ws){await this.webSocketClose(ws);}
}
