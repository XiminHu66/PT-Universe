// This small connection window never contains a task dashboard or provider password.
const target='https://ximinhu66.github.io',params=new URLSearchParams(location.search),channel=params.get('channel'),remember=params.get('remember')==='true';
let pairingStarted=false;
const message=document.getElementById('connectMessage'),code=document.getElementById('connectCode');
const send=value=>window.opener?.postMessage({type:'mv-device-connect',channel,...value},target);
async function request(path,body){const r=await fetch(path,{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',redirect:'error',headers:body?{'Content-Type':'application/json'}:{},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});const d=await r.json();if(!r.ok)throw Object.assign(Error('连接暂不可用，请回到 Media Vault 重试。'),{status:r.status});return d;}
async function connect(){
 if(!window.opener||!/^[a-f0-9]{32}$/.test(channel||'')){message.textContent='请从 Media Vault 的“连接 VPS”按钮打开此窗口。';return;}
 try{
  let state;try{state=await request('/app-auth/session');}catch(e){if(e.status!==403)throw e;if(pairingStarted)throw Error('首次连接请求已到期，请回到 Media Vault 重新点击连接。');await request('/app-auth/logout',{});state=await request('/app-auth/pair',{});pairingStarted=true;}
  if(state.status==='approved'){
   if(state.scope!=='personal-vps-downloads')throw Error('当前授权不是个人下载权限，请在 Media Vault 检查连接。');
   const grant=await request('/app-auth/media-vault-connect',{remember});send({status:'connected',...grant});message.textContent='已连接，正在返回 Media Vault。';window.close();return;
  }
  pairingStarted=true;message.textContent='这是首次连接，管理员确认后会自动返回。之后本设备无需逐项授权。';code.textContent=state.session_id;send({status:'pending',session_id:state.session_id});
  if(state.expires_at<=Date.now())throw Error('首次连接请求已到期，请回到 Media Vault 重试。');
  setTimeout(connect,2500);
 }catch(e){message.textContent=e.message;send({status:'error',message:e.message});}
}
void connect();
