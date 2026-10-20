import {createAccountConnection} from './account-session.js';
import {mountPikPak} from './pikpak-account.js';
export const VPS_ORIGIN='https://pt-media-hybrid.summer07-nanjolno.workers.dev';
function tokenStore(){
 let db;
 async function open(){if(db)return db;db=await new Promise((resolve,reject)=>{const r=indexedDB.open('media-vault-device',1);r.onupgradeneeded=()=>r.result.createObjectStore('connection');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});return db;}
 async function access(mode,value){const base=await open();return new Promise((resolve,reject)=>{const tx=base.transaction('connection',mode),store=tx.objectStore('connection'),r=mode==='readonly'?store.get('device'):value?store.put(value,'device'):store.delete('device');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
 return {get:()=>access('readonly'),set:value=>access('readwrite',value)};
}
export function mountIntegratedDownloads(options={}){
 const win=options.window||window,doc=options.document||document,$=id=>doc.getElementById(id),base=options.serviceURL||VPS_ORIGIN,request=options.fetch||fetch,store=options.tokenStore||tokenStore();
 let token=null,state={status:'unpaired'},pending=null,popup=null,channel=null,watch=null,disposed=false,receiving=false,polling=false,deadline=0,pikpak;
 const note=(text,bad=false)=>{const el=$('vpsConnectionMessage');el.textContent=text;el.classList.toggle('error',bad);options.note?.(text,bad);};
 async function bridge(url,init={}){
  const path=new URL(url,win.location.href).pathname;
  const destination=path==='/app-auth/session'?'/session':path==='/app-auth/logout'?'/logout':path.startsWith('/app-api/')?path.slice('/app-api'.length):path.startsWith('/vault-api/')?path.slice('/vault-api'.length):null;
  if(!destination)throw Error('请使用 Media Vault 内的连接按钮。');
  return request(base+'/vault-api'+destination+new URL(url,win.location.href).search,{...init,credentials:'omit',headers:{...init.headers,Authorization:'Bearer '+(token?.token||'')},cache:'no-store',redirect:'error'});
 }
 function render(next){state=next;pikpak?.render(next);const connected=next.status==='approved'&&!next.unverified;
  $('vpsConnectStatus').textContent=connected?'● VPS 已连接':'连接 VPS';$('vpsConnectNow').textContent=connected?'重新登录':'使用 GitHub 登录';$('vpsDeviceStatus').textContent=connected?'已连接 · 此设备有效至 '+new Date(next.expires_at).toLocaleDateString('zh-CN'):'首次连接后可记住本设备，下载无需逐项授权。';
  $('vpsForget').disabled=!token;$('pikpakTaskSubmit').disabled=!connected||!$('pikpakProfile').options.length;
  options.onState?.(next);
 }
 const client=createAccountConnection({...options.connection,origin:base,fetch:bridge,storage:options.storage||win.sessionStorage,onState:render});
 async function refreshAccounts(){if(state.status!=='approved'||state.unverified)return;await pikpak.refresh();$('pikpakTaskSubmit').disabled=!$('pikpakProfile').options.length;}
 pikpak=mountPikPak({client,$,note:options.note||note,current:()=>state,reload:async()=>{await refreshAccounts();await options.onTasksChanged?.();}});
 function resetApproval(){$('vpsConnectNow').hidden=false;$('vpsRemember').disabled=false;}
 function finish(error){if(error&&channel){const proof=channel;channel=null;void receipt('cancel',proof).catch(()=>{});}resetApproval();if(watch!==null){win.clearInterval(watch);watch=null;}const task=pending;pending=null;if(error)task?.reject(error);else task?.resolve(client);}
 function closeDialog(){if($('vpsConnection').open)$('vpsConnection').close();}
 async function receipt(action,proof=channel){if(!proof)return;return request(base+'/media-vault-login/'+action,{method:'POST',credentials:'omit',headers:{Authorization:'Bearer '+proof},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)});}
 async function acceptGrant(data,proof){
  if(channel!==proof||receiving||!/^[a-f0-9]{64}$/.test(data.token||'')||!Number.isSafeInteger(data.expires_at)||data.expires_at<=Date.now()||data.expires_at>Date.now()+31*86400000)return;
  receiving=true;token={token:data.token,expires_at:data.expires_at};
  try{if($('vpsRemember').checked)await store.set(token);else await store.set(null);}catch{note('本次已连接；浏览器不允许记住设备。');}
  try{await client.refresh();if(disposed||channel!==proof){await request(base+'/vault-api/logout',{method:'POST',credentials:'omit',headers:{Authorization:'Bearer '+token.token,'Content-Type':'application/json'},body:'{}',cache:'no-store',redirect:'error'}).catch(()=>{});token=null;await store.set(null).catch(()=>{});render({status:'unpaired'});return;}await receipt('ack',proof).catch(()=>{});channel=null;closeDialog();finish();await refreshAccounts();await options.onTasksChanged?.();}catch(e){note(e.message,true);if([403,404].includes(e.status)){token=null;await store.set(null).catch(()=>{});finish(e);}}finally{receiving=false;}
 }
 async function poll(){
  if(polling||receiving||!channel||disposed)return;
  if(Date.now()>deadline){const proof=channel;channel=null;void receipt('cancel',proof).catch(()=>{});note('登录已超时，请重新点击 GitHub 登录。',true);finish(Error('登录已超时'));return;}
  const proof=channel;polling=true;try{const r=await request(base+'/media-vault-login/result',{credentials:'omit',headers:{Authorization:'Bearer '+proof},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)});if(channel!==proof)return;if(r.ok&&r.status!==202){const data=await r.json();if(data.status==='connected')await acceptGrant(data,proof);}else if(!r.ok&&r.status!==503&&r.status!==502){const d=await r.json();note(d.error||'登录暂不可用，请重试。',true);finish(Error(d.error||'登录失败'));}}catch{/* Transient failures keep the same bounded login; no new request or grant. */}finally{polling=false;}
 }
 async function receive(event){const data=event.data;if(event.origin!==new URL(base).origin||event.source!==popup||data?.type!=='mv-device-connect'||data.channel!==channel)return;
  if(data.status==='login'){note('请在 GitHub 窗口完成登录，之后会自动继续下载。');return;}
  if(data.status==='setup_required'){note('首次请在 GitHub 确认创建专用私有登录应用，之后会自动继续。');return;}
  if(data.status==='error'){note(data.message||'连接失败，请重试。',true);finish(Error(data.message||'连接失败'));return;}
  if(data.status==='ready')await poll();
 }
 win.addEventListener('message',receive);
 function show(){resetApproval();if(!$('vpsConnection').open)$('vpsConnection').showModal();note(state.status==='approved'?'此设备已登录。可以查看或撤销其他设备。':'使用你自己的 GitHub 账号登录；有效连接会自动复用。');void refreshDevices().catch(()=>{});}
 async function ensure(){await ready;if(token?.expires_at>Date.now()&&(state.status!=='approved'||state.unverified)){try{await client.refresh();}catch(e){if(![403,404].includes(e.status))throw Error('VPS 暂时无法连接，请稍后重试，无需重新授权。');}}if(state.status==='approved'&&!state.unverified&&state.expires_at>Date.now())return Promise.resolve(client);if(pending)return pending.work;show();let resolve,reject;const work=new Promise((yes,no)=>{resolve=yes;reject=no;});pending={work,resolve,reject};return work;}
 $('vpsConnectStatus').onclick=show;$('vpsManageConnection').onclick=show;
 function startLogin(repair=false){
  if(receiving)return;const prior=channel;if(prior)void receipt('cancel',prior).catch(()=>{});
  channel=Array.from(win.crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');deadline=Date.now()+10*60000;
  const url=base+'/media-vault-connect/#'+new URLSearchParams({channel,remember:String($('vpsRemember').checked),...(repair?{setup:'true'}:{})});
  $('vpsRemember').disabled=true;popup=win.open(url,'media-vault-connect','popup,width=600,height=660');
  if(!popup){channel=null;resetApproval();note('请允许此页面打开一次 GitHub 登录窗口，然后重试。',true);return;}
  note('正在打开私有登录…');if(watch!==null)win.clearInterval(watch);
  // Provider COOP can make popup.closed true while login is still in progress.
  // Poll a secret-bound server handoff instead of treating that as cancellation.
  watch=win.setInterval(()=>void poll(),1500);void poll();
 }
 $('vpsConnectNow').onclick=()=>startLogin();$('vpsLoginRepair').onclick=()=>startLogin(true);
 function cancelConnection(){const proof=channel;channel=null;void receipt('cancel',proof).catch(()=>{});try{popup?.close();}catch{}closeDialog();finish(Error('已取消连接，本次没有提交下载任务。'));}
 $('vpsConnectCancel').onclick=cancelConnection;$('vpsConnection').oncancel=cancelConnection;
 async function forget(){try{if(token)await client.logout();token=null;await store.set(null);render({status:'unpaired'});$('vpsDevices').replaceChildren();note('已退出此设备。下次需使用 GitHub 登录，下载任务继续保留。');}catch(e){note(e.message,true);}}
 $('vpsForget').onclick=forget;
 async function refreshDevices(){
  const list=$('vpsDevices');list.replaceChildren();if(state.status!=='approved'||state.unverified)return;
  const expected=state.session_id,result=await client.read('/devices');if(state.session_id!==expected||state.status!=='approved'||state.unverified)return;for(const device of result.devices||[]){
   const row=doc.createElement('p'),label=doc.createElement('span'),button=doc.createElement('button');label.textContent=(device.current?'当前设备':'其他设备')+' · 登录于 '+new Date(device.created_at).toLocaleString('zh-CN')+' · 到期 '+new Date(device.expires_at).toLocaleDateString('zh-CN')+' ';button.textContent=device.current?'退出此设备':'撤销设备';button.onclick=async()=>{button.disabled=true;try{if(device.current){await forget();return;}await client.read('/devices/revoke',{id:device.id});await refreshDevices();}catch(e){note(e.message,true);button.disabled=false;}};row.append(label,button);list.append(row);
  }
 }
 $('pikpakTaskForm').onsubmit=event=>{event.preventDefault();void (async()=>{const button=$('pikpakTaskSubmit');button.disabled=true;try{await ensure();const profile=$('pikpakProfile').value;if(!profile)throw Error('请先添加并验证一个 PikPak 账号。');const result=await client.submit({kind:'pikpak',url:$('pikpakURL').value.trim(),profile_id:profile,cleanup_after_download:true});options.note?.('已开始 PikPak 下载，可在本页“下载任务”查看进度。');await options.onTasksChanged?.();options.openQueue?.();return result;}catch(e){options.note?.(e.message,true);}finally{button.disabled=false;}})();};
 const ready=(async()=>{try{token=await store.get();if(!token||token.expires_at<=Date.now()){token=null;render(state);return;}await client.refresh();await refreshAccounts();}catch{render({status:'unpaired'});}})();
 void ready.then(()=>{if(state.status==='approved')return options.onTasksChanged?.();}).catch(e=>options.note?.(e.message,true));
 return {ready,ensure,client,refreshAccounts,current:()=>state,openConnection:show,async openPikPak(url=''){await ensure();$('pikpakPanel').hidden=false;if(url)$('pikpakURL').value=url;await refreshAccounts();$('pikpakPanel').scrollIntoView({behavior:'smooth',block:'start'});},async read(path,body){await ensure();if(path==='/jobs'&&body){const result=await client.submit(body);await refreshAccounts();return result;}if(path==='/resolve')return {formats:[{id:'best',label:'最佳可用画质',format:'auto'}]};return client.read(path,body);},fetch:bridge,dispose(){disposed=true;client.dispose();win.removeEventListener('message',receive);finish(Error('页面已关闭'));}};
}
