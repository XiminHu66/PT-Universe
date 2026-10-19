// Shared by the staging app and the short-lived same-origin acceptance page.
// Media bodies are navigated directly; they are never fetched into JS memory.
export function createNativeSaver(options) {
 const doc=options.document||document,win=options.window||window;
 const base=new URL(options.baseURL,win.location.href);
 if(base.username||base.password||base.search||base.hash||
    (base.protocol!=='https:'&&!(base.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(base.hostname))))throw Error('下载服务地址无效');
 base.pathname=base.pathname.replace(/\/?$/,'/');
 const endpoint=new URL((options.ticketPath||'download-ticket').replace(/^\//,''),base);
 if(endpoint.origin!==base.origin)throw Error('票据接口必须属于下载服务');
 let pending=false,frame=null,current=null,disposed=false;
 const notify=s=>options.onState?.(s);
 function error(status,retry) {
  const wait=Number(retry),delay=Number.isFinite(wait)&&wait>0?Math.min(3600,Math.ceil(wait)):null;
  const labels={401:'下载授权不可用，请重新连接。',403:'配对或票据已失效，请重新配对或重新请求保存。',404:'临时文件已不可用，请刷新文件列表；必要时重新提交任务。',409:'文件尚未就绪，请刷新任务状态。',429:'下载服务繁忙或已达到票据、额度限制。',503:'下载通道暂不可用，请稍后重新请求保存。'};
  const e=Error((labels[status]||'下载请求失败，请稍后重试。')+(delay?' 请至少等待 '+delay+' 秒。':''));
  e.status=status;e.retryAfter=delay;return e;
 }
 function onMessage(event) {
  const d=event.data;
  if(!current||event.origin!==base.origin||event.source!==frame?.contentWindow||
     !d||d.type!=='mv-native-download-error'||d.attempt!==current.attempt||
     !Number.isInteger(d.status)||d.status<400||d.status>599)return;
  const e=error(d.status,d.retry_after),file=current.file;current=null;
  notify({phase:'error',file,message:e.message,status:e.status,retryAfter:e.retryAfter});
 }
 win.addEventListener('message',onMessage);
 return {
  error,
  async save(file,{signal}={}) {
   if(disposed)throw Error('下载入口已关闭，请重新打开文件列表。');
   if(pending)throw Error('正在请求下载票据，请稍候。');
   if(!file||typeof file.name!=='string'||!file.name||file.name.length>255||/[\x00-\x1f\x7f/\\]/.test(file.name)||
      !Number.isSafeInteger(file.size)||file.size<=0||typeof file.path!=='string'||typeof file.id!=='string')throw Error('文件信息无效，请刷新文件列表。');
   pending=true;notify({phase:'requesting',file,message:'正在请求一次性下载票据…'});
   try {
    let response;
    try {
     response=await (options.fetch||fetch)(endpoint.href,{method:'POST',headers:{...options.headers,'Content-Type':'application/json'},
      credentials:'same-origin',cache:'no-store',redirect:'error',body:JSON.stringify({id:file.id,path:file.path}),
      signal:signal?AbortSignal.any([signal,AbortSignal.timeout(20000)]):AbortSignal.timeout(20000)});
    }catch(e){throw Error(signal?.aborted?'已停止请求下载票据。':'下载服务连接失败或响应超时，请稍后重试。');}
    let data;try{data=await response.json();}catch{throw error(response.status);}
    if(!response.ok||data.error){
     const e=error(response.status,response.headers.get('Retry-After')||data.retry_after);
     if(data.ticket_issued===false&&((response.status===503&&data.code==='channel_unavailable')||(response.status===429&&data.code==='channel_busy'))){e.message=(data.code==='channel_busy'?'另一份文件正在传输。':'出站下载通道未连接或未响应。')+'本次未签发票据；请刷新通道状态后再试。';e.ticketIssued=false;}
     throw e;
    }
    if(!/^[a-zA-Z0-9_-]{32,128}$/.test(data.ticket||''))throw Error('下载票据格式无效，请重新请求保存。');
    if(signal?.aborted)throw Error('已停止请求下载票据。');
    if(disposed)throw Error('下载连接已变化，请重新打开文件列表。');
    if(!frame){frame=doc.createElement('iframe');frame.name='mv-native-'+win.crypto.randomUUID();frame.title='文件下载通道';frame.hidden=true;frame.referrerPolicy='no-referrer';doc.body.append(frame);}
    const attempt=win.crypto.randomUUID().replaceAll('-',''),url=new URL('download',base);
    url.searchParams.set('ticket',data.ticket);url.searchParams.set('attempt',attempt);
    current={attempt,file};
    const anchor=doc.createElement('a');anchor.href=url.href;anchor.target=frame.name;
    // Content-Disposition supplies the filename. A download attribute would
    // bypass iframe rendering of a pre-stream HTTP error in Chrome.
    anchor.referrerPolicy='no-referrer';doc.body.append(anchor);
    try{anchor.click();}finally{anchor.remove();}
    options.onTicket?.(data.ticket);
    notify({phase:'handed-off',file,message:'已交给浏览器保存 '+file.name+'；完成或取消请查看浏览器下载列表。'});
    return {name:file.name,size:file.size,phase:'handed-off'};
   }catch(e){notify({phase:'error',file,message:e.message,status:e.status,retryAfter:e.retryAfter,...(e.ticketIssued===false?{ticketIssued:false}:{})});throw e;}
   finally{pending=false;}
  },
  // Call only when leaving this page/connection; browser-owned downloads have
  // their own cancellation controls, and handoff is not proof of disk saving.
  dispose(){disposed=true;current=null;win.removeEventListener('message',onMessage);}
 };
}
