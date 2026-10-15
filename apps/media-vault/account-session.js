// Account cookie client. Storage contains public retry IDs and hashes only.
export function createAccountConnection(options={}){
 const origin=options.origin||location.origin,fetcher=options.fetch||fetch;
 const now=options.now||Date.now,schedule=options.setTimeout||setTimeout,cancel=options.clearTimeout||clearTimeout;
 let journal=options.storage;
 if(journal===undefined)try{journal=globalThis.sessionStorage||null;}catch{journal=null;}
 const storageKey='mv.account.requests.v1';let entries=[];
 try{const saved=JSON.parse(journal?.getItem(storageKey)||'[]');if(Array.isArray(saved))entries=saved.filter(x=>/^[a-f0-9]{32}$/.test(x.key)&&/^[a-f0-9]{64}$/.test(x.hash)&&/^[a-f0-9]{24}$/.test(x.session)&&(!x.id||/^[a-f0-9]{24}$/.test(x.id))).slice(-20);}catch{}
 const persist=()=>{try{if(!journal)throw Error('Storage unavailable');journal.setItem(storageKey,JSON.stringify(entries));}catch{throw Error('无法保存提交重试编号；请允许此页面的会话存储后再提交。');}};
 let submitting=null;
 let state={status:'unpaired'},epoch=0,timer=null,inflight=null,disposed=false,mutation=Promise.resolve();
 const serialize=fn=>{const result=mutation.then(fn,fn);mutation=result.catch(()=>{});return result;};
 const clearTimer=()=>{if(timer!==null)cancel(timer);timer=null;};
 function emit(next){state=next;options.onState?.(next);}
 function lost(status='expired',message='账号会话不可用，请重新申请配对。'){++epoch;inflight=null;clearTimer();emit({status,message});}
 async function request(path,body,signal){
  const r=await fetcher(origin+path,{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',redirect:'error',
   headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,
   signal:signal?AbortSignal.any([signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000)});
  let data;try{data=await r.json();}catch{data={};}
  if(!r.ok){const e=Error(r.status===404?'账号服务未开放或资源不可用。':r.status===403?(path==='/app-auth/session'?'尚未登录或会话已到期，请申请配对。':'当前会话无权执行此操作，请检查登录与提交权限。'):r.status===429?'请求过于频繁、队列繁忙或额度不足，请稍后重试。':r.status===409?'请求发生冲突，请核对原提交内容。':r.status===400?'任务内容不符合要求，请检查输入。':'账号服务暂不可用，请重试。');e.status=r.status;throw e;}
  return data;
 }
 function arm(){
  clearTimer();if(!['pending','approved'].includes(state.status))return;
  timer=schedule(()=>{timer=null;if(state.expires_at<=now()){++epoch;inflight=null;lost();}else refresh().catch(()=>{});},Math.max(1,Math.min(state.status==='pending'?3000:30000,state.expires_at-now())));
 }
 function validate(data){
  if(!['pending','approved'].includes(data?.status)||!Number.isSafeInteger(data.expires_at)||data.expires_at<=now())throw Object.assign(Error('账号会话已到期。'),{status:403});
  if(!/^[a-f0-9]{24}$/.test(data.session_id||''))throw Object.assign(Error('会话编号无效。'),{status:403});
  if(data.status==='pending'&&!/^[a-f0-9]{32}$/.test(data.pair_code||''))throw Object.assign(Error('配对编号无效。'),{status:403});
  if(data.status==='approved'&&(typeof data.can_submit!=='boolean'||!Number.isInteger(data.jobs_remaining)||data.jobs_remaining<0||data.jobs_remaining>5||!Number.isInteger(data.tickets_remaining)||data.tickets_remaining<0||data.tickets_remaining>100))throw Object.assign(Error('会话权限不可确认。'),{status:403});
  return data;
 }
 async function refresh(){
  if(disposed)throw Error('账号连接已关闭。');
  if(['pairing','disconnecting','logout-failed'].includes(state.status))throw Error('请先完成当前配对或退出操作。');
  if(inflight)return inflight;
  const generation=epoch;
  const work=(async()=>{
   try{const data=validate(await request('/app-auth/session'));
    if(generation!==epoch||disposed)throw Error('会话已变化，请重新操作。');
    if(state.session_id&&state.session_id!==data.session_id)++epoch;
    emit(data);arm();return data;
   }catch(e){if(generation===epoch&&!disposed){if([403,404].includes(e.status))lost(e.status===404?'closed':'expired',e.message);else{emit({...state,message:e.message,unverified:true});arm();}}throw e;}
  })();
  inflight=work;try{return await work;}finally{if(inflight===work)inflight=null;}
 }
 async function endSession(){
  const result=await request('/app-auth/logout',{});if(result.ok!==true)throw Error('服务端退出尚未确认。');
 }
 const channel=options.channel||(typeof window!=='undefined'&&typeof BroadcastChannel!=='undefined'?new BroadcastChannel('mv-account-session'):null);
 if(channel)channel.onmessage=e=>{if(e.data==='logout')void logout(false).catch(()=>{});};
 function logout(broadcast=true){
  if(disposed)return Promise.reject(Error('账号连接已关闭。'));
  if(broadcast)channel?.postMessage('logout');
  const generation=++epoch;inflight=null;clearTimer();entries=[];try{journal?.removeItem(storageKey);}catch{}emit({status:'disconnecting',message:'正在撤销当前浏览器会话…'});
  return serialize(async()=>{
   try{await endSession();if(generation===epoch&&!disposed)emit({status:'unpaired',message:'已退出，当前会话与未使用票据已撤销。'});}
   catch(e){if(generation===epoch&&!disposed)emit({status:'logout-failed',message:'服务端退出未确认，请重试退出；本页已停止使用会话。'});throw e;}
  });
 }
 return {
  refresh,logout,
  pair(){
   if(disposed)return Promise.reject(Error('账号连接已关闭。'));
   const generation=++epoch;inflight=null;clearTimer();emit({status:'pairing',message:'正在申请账号配对…'});
   return serialize(async()=>{
    if(disposed||generation!==epoch)throw Error('会话已变化。');
    try{
     // Serialize cookie-changing requests. Logout waits for an in-flight pair
     // response, so a late Set-Cookie cannot survive a confirmed logout.
     await endSession();if(disposed||generation!==epoch)throw Error('会话已变化。');
     const data=validate(await request('/app-auth/pair',{}));
     if(generation!==epoch||disposed)throw Error('会话已变化。');
     emit(data);arm();return data;
    }catch(e){if(generation===epoch&&!disposed)lost(e.status===404?'closed':'unpaired',e.message);throw e;}
   });
  },
  async read(path,body){
   const u=new URL(path,origin);
   const allowed=!body&&['/health','/jobs','/quota'].includes(path)||!body&&u.pathname==='/novel/catalog'&&u.searchParams.size===1&&u.searchParams.has('url')||!body&&u.pathname==='/jobs/files'&&u.searchParams.size===1&&/^[a-f0-9]{24}$/.test(u.searchParams.get('id')||'')||path==='/jobs/cancel'&&body&&/^[a-f0-9]{24}$/.test(body.id||'');
   if(!allowed||u.origin!==origin)throw Error('账号页面不支持此操作。');
   const d=await refresh();if(d.status!=='approved'||d.unverified)throw Error('请先完成账号配对。');
   const generation=epoch,result=await request('/app-api'+path,body);
   if(generation!==epoch||disposed||state.status!=='approved'||state.unverified||state.expires_at<=now())throw Error('会话已变化，请重新操作。');
   return result;
  },
  submit(spec){
   // Canonical input only: callers cannot inject account, headers or request IDs.
   const clean={};for(const key of ['kind','provider','max_bytes','max_pages','url','format','title','files','indices','text_only','layout','retry_of'])if(spec[key]!==undefined)clean[key]=spec[key];
   const input=JSON.stringify(clean),generation=epoch;
   if(submitting){if(submitting.input===input)return submitting.work;return Promise.reject(Error('请先等待当前提交结束。'));}
   const work=(async()=>{
    const session=await refresh();if(generation!==epoch||disposed||session.status!=='approved'||session.unverified||!session.can_submit)throw Error('当前会话未开放任务提交。');
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(input))),b=>b.toString(16).padStart(2,'0')).join('');
    if(generation!==epoch||disposed)throw Error('会话已变化，请重新操作。');
    let entry=entries.find(x=>x.hash===hash&&x.session===session.session_id);
    if(entries.some(x=>x.session===session.session_id&&!x.id&&x!==entry))throw Error('上一项提交结果尚未确认，请先用原内容重试。');
    if(!entry){
     if(session.jobs_remaining<1)throw Error('本次登录的任务额度已用完。');
     entry={key:crypto.randomUUID().replaceAll('-',''),hash,session:session.session_id};
     entries=[...entries.filter(x=>x.session===session.session_id).slice(-19),entry];
    }
    // Persist BEFORE sending; network loss/timeout/reload retains the same key.
    const firstAttempt=!entry.sent;entry.sent=true;persist();
    let result;try{result=await request('/app-api/jobs',{...clean,request_key:entry.key});}catch(e){if(firstAttempt&&[400,403,404,409,429].includes(e.status)&&generation===epoch&&!disposed){entries=entries.filter(x=>x!==entry);persist();}throw e;}
    if(generation!==epoch||disposed||state.status!=='approved'||state.unverified||state.expires_at<=now())throw Error('会话已变化；请重新登录后查看任务，勿据此判断提交失败。');
    if(!/^[a-f0-9]{24}$/.test(result.id||''))throw Error('提交结果不可确认，请用原内容重试。');
    entry.id=result.id;persist();return result;
   })();
   const active={input,work};submitting=active;work.then(()=>{if(submitting===active)submitting=null;},()=>{if(submitting===active)submitting=null;});return work;
  },
  current(){return state;},
  invalidate(status=403){++epoch;inflight=null;lost(status===404?'closed':'expired');},
  dispose(){disposed=true;++epoch;inflight=null;clearTimer();channel?.close();}
 };
}
