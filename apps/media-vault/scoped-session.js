// Temporary same-origin adapter. No long-lived token, storage or Owner API.
export function createScopedConnection(options={}){
 const origin=options.origin||location.origin,fetcher=options.fetch||fetch;
 const now=options.now||Date.now,schedule=options.setTimeout||setTimeout,cancel=options.clearTimeout||clearTimeout;
 let state={status:'unpaired'},epoch=0,timer=null,inflight=null,disposed=false,mutation=Promise.resolve();
 const serialize=fn=>{const result=mutation.then(fn,fn);mutation=result.catch(()=>{});return result;};
 const clearTimer=()=>{if(timer!==null)cancel(timer);timer=null;};
 function emit(next){state=next;options.onState?.(next);}
 function lost(status='expired',message='临时会话不可用，请重新申请配对。'){clearTimer();emit({status,message});}
 async function request(path,body,signal){
  const r=await fetcher(origin+path,{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',redirect:'error',
   headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,
   signal:signal?AbortSignal.any([signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000)});
  let data;try{data=await r.json();}catch{data={};}
  if(!r.ok){const e=Error(r.status===404?'限时联调窗口已关闭。':r.status===403?'临时会话已失效，请重新配对。':r.status===429?'配对请求繁忙，请稍后重试。':'临时会话服务暂不可用，请重试。');e.status=r.status;throw e;}
  return data;
 }
 function arm(){
  clearTimer();if(!['pending','approved'].includes(state.status))return;
  timer=schedule(()=>{timer=null;if(state.expires_at<=now()){++epoch;inflight=null;lost();}else refresh().catch(()=>{});},Math.max(1,Math.min(state.status==='pending'?3000:30000,state.expires_at-now())));
 }
 function validate(data){
  if(!['pending','approved'].includes(data?.status)||!Number.isSafeInteger(data.expires_at)||data.expires_at<=now())throw Object.assign(Error('临时会话已到期。'),{status:403});
  if(data.status==='pending'&&!/^[a-f0-9]{16}$/.test(data.pair_code||''))throw Object.assign(Error('配对编号无效。'),{status:403});
  if(data.status==='approved'&&(!Array.isArray(data.files)||data.files.length!==3||new Set(data.files.map(f=>f.id)).size!==3||data.files.some(f=>!(/^[a-f0-9]{24}$/).test(f.id)||!(/\.(epub|cbz|mp4)$/i).test(f.name)||!Number.isSafeInteger(f.size)||f.size<=0||f.size>10*1024*1024||typeof f.path!=='string'||f.path.includes('..'))))throw Object.assign(Error('指定测试文件已不可用，请重新核对。'),{status:403});
  return data;
 }
 async function refresh(){
  if(disposed)throw Error('临时连接已关闭。');
  if(['pairing','disconnecting','logout-failed'].includes(state.status))throw Error('请先完成当前配对或退出操作。');
  if(inflight)return inflight;
  const generation=epoch;
  const work=(async()=>{
   try{const data=validate(await request('/acceptance/session'));
    if(generation!==epoch||disposed)throw Error('会话已变化，请重新操作。');
    emit(data);arm();return data;
   }catch(e){if(generation===epoch&&!disposed){if([403,404].includes(e.status))lost(e.status===404?'closed':'expired',e.message);else{emit({...state,message:e.message,unverified:true});arm();}}throw e;}
  })();
  inflight=work;try{return await work;}finally{if(inflight===work)inflight=null;}
 }
 async function endSession(){
  try{await request('/acceptance/logout',{});}catch(e){if(e.status!==403)throw e;}
 }
 function logout(){
  const generation=++epoch;inflight=null;clearTimer();emit({status:'disconnecting',message:'正在撤销当前浏览器会话…'});
  return serialize(async()=>{
   try{await endSession();if(generation===epoch&&!disposed)emit({status:'unpaired',message:'已退出，当前会话与未使用票据已撤销。'});}
   catch(e){if(generation===epoch&&!disposed)emit({status:'logout-failed',message:'服务端退出未确认，请重试退出；本页已停止使用会话。'});throw e;}
  });
 }
 return {
  refresh,logout,
  pair(){
   const generation=++epoch;inflight=null;clearTimer();emit({status:'pairing',message:'正在申请临时配对…'});
   return serialize(async()=>{
    if(disposed||generation!==epoch)throw Error('会话已变化。');
    try{
     // Serialize cookie-changing requests. Logout waits for an in-flight pair
     // response, so a late Set-Cookie cannot survive a confirmed logout.
     await endSession();if(disposed||generation!==epoch)throw Error('会话已变化。');
     const data=validate(await request('/acceptance/pair',{}));
     if(generation!==epoch||disposed)throw Error('会话已变化。');
     emit(data);arm();return data;
    }catch(e){if(generation===epoch&&!disposed)lost(e.status===404?'closed':'unpaired',e.message);throw e;}
   });
  },
  async read(path,body){
   if(body||!['/health','/jobs','/quota'].includes(path)&&!path.startsWith('/jobs/files?'))throw Object.assign(Error('限时会话仅允许查看和保存三个已批准文件，不开放任务提交或管理。'),{status:403});
   const d=await refresh();if(d.status!=='approved'||d.unverified)throw Object.assign(Error('等待 Owner 批准当前浏览器配对。'),{status:403});
   if(path==='/health')return {ok:true,mode:'scoped-acceptance',streaming:d.streaming};
   if(path==='/quota')return d.quota;
   if(path==='/jobs')return {jobs:d.files.map(f=>({id:f.id,title:f.name,kind:f.name.endsWith('.epub')?'novel':f.name.endsWith('.cbz')?'manga':'video',status:'complete',completed:f.size,total:f.size,scope:'temporary'}))};
   const u=new URL(path,origin),id=u.searchParams.get('id'),files=d.files.filter(f=>f.id===id);
   if(u.pathname!=='/jobs/files'||u.searchParams.size!==1||!files.length)throw Object.assign(Error('文件不在当前授权范围内。'),{status:403});
   return {files};
  },
  current(){return state;},
  invalidate(status=403){++epoch;inflight=null;lost(status===404?'closed':'expired');},
  dispose(){disposed=true;++epoch;inflight=null;clearTimer();}
 };
}
