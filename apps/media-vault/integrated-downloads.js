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
 let token=null,state={status:'unpaired'},pending=null,popup=null,channel=null,watch=null,disposed=false,receiving=false,pikpak;
 const note=(text,bad=false)=>{const el=$('vpsConnectionMessage');el.textContent=text;el.classList.toggle('error',bad);options.note?.(text,bad);};
 async function bridge(url,init={}){
  const path=new URL(url,win.location.href).pathname;
  const destination=path==='/app-auth/session'?'/session':path==='/app-auth/logout'?'/logout':path.startsWith('/app-api/')?path.slice('/app-api'.length):path.startsWith('/vault-api/')?path.slice('/vault-api'.length):null;
  if(!destination)throw Error('请使用 Media Vault 内的连接按钮。');
  return request(base+'/vault-api'+destination+new URL(url,win.location.href).search,{...init,credentials:'omit',headers:{...init.headers,Authorization:'Bearer '+(token?.token||'')},cache:'no-store',redirect:'error'});
 }
 function render(next){state=next;pikpak?.render(next);const connected=next.status==='approved'&&!next.unverified;
  $('vpsConnectStatus').textContent=connected?'● VPS 已连接':'连接 VPS';$('vpsConnectNow').textContent=connected?'重新连接':'连接并继续';$('vpsDeviceStatus').textContent=connected?'已连接 · 此设备有效至 '+new Date(next.expires_at).toLocaleDateString('zh-CN'):'首次连接后可记住本设备，下载无需逐项授权。';
  $('vpsForget').disabled=!token;$('pikpakTaskSubmit').disabled=!connected||!$('pikpakProfile').options.length;
  options.onState?.(next);
 }
 const client=createAccountConnection({...options.connection,origin:base,fetch:bridge,storage:options.storage||win.sessionStorage,onState:render});
 async function refreshAccounts(){if(state.status!=='approved'||state.unverified)return;await pikpak.refresh();$('pikpakTaskSubmit').disabled=!$('pikpakProfile').options.length;}
 pikpak=mountPikPak({client,$,note:options.note||note,current:()=>state,reload:async()=>{await refreshAccounts();await options.onTasksChanged?.();}});
 function finish(error){if(watch!==null){win.clearInterval(watch);watch=null;}const task=pending;pending=null;if(error)task?.reject(error);else task?.resolve(client);}
 function closeDialog(){if($('vpsConnection').open)$('vpsConnection').close();}
 async function receive(event){const data=event.data;if(event.origin!==new URL(base).origin||event.source!==popup||data?.type!=='mv-device-connect'||data.channel!==channel)return;
  if(data.status==='pending'){note('首次连接需要管理员确认一次。确认后会自动继续本次下载。');$('vpsPairCode').textContent=data.pair_code;return;}
  if(data.status==='error'){note(data.message||'连接失败，请重试。',true);finish(Error(data.message||'连接失败'));return;}
  if(data.status!=='connected'||!/^[a-f0-9]{64}$/.test(data.token||'')||!Number.isSafeInteger(data.expires_at)||data.expires_at<=Date.now())return;
  receiving=true;token={token:data.token,expires_at:data.expires_at};
  try{if($('vpsRemember').checked)await store.set(token);else await store.set(null);}catch{note('本次已连接；浏览器不允许记住设备。');}
  try{await client.refresh();if(disposed)return;closeDialog();finish();await refreshAccounts();await options.onTasksChanged?.();}catch(e){note(e.message,true);finish(e);}finally{receiving=false;}
 }
 win.addEventListener('message',receive);
 function show(){if(!$('vpsConnection').open)$('vpsConnection').showModal();$('vpsPairCode').textContent='';note('连接会复用已有授权，不需要输入服务器密钥。');}
 function ensure(){if(state.status==='approved'&&!state.unverified&&state.expires_at>Date.now())return Promise.resolve(client);if(pending)return pending.work;show();let resolve,reject;const work=new Promise((yes,no)=>{resolve=yes;reject=no;});pending={work,resolve,reject};return work;}
 $('vpsConnectStatus').onclick=show;$('vpsManageConnection').onclick=show;
 $('vpsConnectNow').onclick=()=>{
  channel=win.crypto.randomUUID().replaceAll('-','');const url=base+'/media-vault-connect/?'+new URLSearchParams({channel,remember:String($('vpsRemember').checked)});
  popup=win.open(url,'media-vault-connect','popup,width=570,height=580');
  if(!popup){note('请允许此页面打开一次连接窗口，然后重试。',true);return;}
  if(watch!==null)win.clearInterval(watch);
  watch=win.setInterval(()=>{if(popup?.closed&&!receiving){if(state.status!=='approved'){note('连接窗口已关闭，可重新点击连接。');finish(Error('连接尚未完成，请重试。'));}else if(watch!==null){win.clearInterval(watch);watch=null;}}},1000);
 };
 function cancelConnection(){channel=null;popup?.close();closeDialog();finish(Error('已取消连接，本次没有提交下载任务。'));}
 $('vpsConnectCancel').onclick=cancelConnection;$('vpsConnection').oncancel=cancelConnection;
 $('vpsForget').onclick=async()=>{try{if(token)await client.logout();token=null;await store.set(null);render({status:'unpaired'});note('已忘记此设备。VPS 上的下载任务继续保留。');}catch(e){note(e.message,true);}};
 $('pikpakTaskForm').onsubmit=event=>{event.preventDefault();void (async()=>{const button=$('pikpakTaskSubmit');button.disabled=true;try{await ensure();const profile=$('pikpakProfile').value;if(!profile)throw Error('请先添加并验证一个 PikPak 账号。');const result=await client.submit({kind:'pikpak',url:$('pikpakURL').value.trim(),profile_id:profile,cleanup_after_download:true});options.note?.('已开始 PikPak 下载，可在本页“下载任务”查看进度。');await options.onTasksChanged?.();options.openQueue?.();return result;}catch(e){options.note?.(e.message,true);}finally{button.disabled=false;}})();};
 const ready=(async()=>{try{token=await store.get();if(!token||token.expires_at<=Date.now()){token=null;render(state);return;}await client.refresh();await refreshAccounts();await options.onTasksChanged?.();}catch{render({status:'unpaired'});}})();
 return {ready,ensure,client,refreshAccounts,current:()=>state,openConnection:show,async openPikPak(url=''){await ensure();$('pikpakPanel').hidden=false;if(url)$('pikpakURL').value=url;await refreshAccounts();$('pikpakPanel').scrollIntoView({behavior:'smooth',block:'start'});},async read(path,body){await ensure();if(path==='/jobs'&&body){const result=await client.submit(body);await refreshAccounts();return result;}if(path==='/resolve')return {formats:[{id:'best',label:'最佳可用画质',format:'auto'}]};return client.read(path,body);},fetch:bridge,dispose(){disposed=true;client.dispose();win.removeEventListener('message',receive);finish(Error('页面已关闭'));}};
}
