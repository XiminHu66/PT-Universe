// The connection proof stays in the URL fragment and is never sent to GitHub.
// Main-page polling completes even if the provider severs window.opener (COOP).
const target='https://ximinhu66.github.io',params=new URLSearchParams(location.hash.slice(1)),channel=params.get('channel'),remember=params.get('remember')==='true';
const message=document.getElementById('connectMessage'),setup=document.getElementById('setupForm');
const send=value=>window.opener?.postMessage({type:'mv-device-connect',channel,...value},target);
async function request(path,body){const r=await fetch(path,{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',redirect:'error',headers:body?{'Content-Type':'application/json'}:{},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});const d=await r.json();if(!r.ok)throw Object.assign(Error(d.error||'连接暂不可用，请回到 Media Vault 重试。'),{status:r.status});return d;}
async function connect(){
 if(!/^[a-f0-9]{64}$/.test(channel||'')||!['true','false'].includes(params.get('remember'))){message.textContent='请从 Media Vault 的登录按钮打开此窗口。';return;}
 try{
  const context={channel,remember};await request('/media-vault-login/connect',context);
  if(params.get('setup')==='true'){showSetup();return;}
  let state;try{state=await request('/app-auth/session');}catch(e){if(e.status!==403)throw e;}
  if(state?.status==='approved'&&state.scope==='personal-vps-downloads'){
   await request('/media-vault-login/complete',context);send({status:'ready'});message.textContent='已登录，正在返回 Media Vault。';window.close();return;
  }
  const started=await request('/media-vault-login/start',context);
  if(started.status==='setup_required'){
   showSetup();return;
  }
  const url=new URL(started.authorize_url);if(url.origin!=='https://github.com'||url.pathname!=='/login/oauth/authorize')throw Error('登录地址无效。');
  send({status:'login'});message.textContent='正在打开 GitHub 登录…';location.replace(url.href);
 }catch(e){setup.hidden=true;message.textContent=e.message;send({status:'error',message:e.message});}
}
function showSetup(){message.textContent='在 GitHub 确认创建专用私有登录应用；之后可直接登录。';document.getElementById('setupChannel').value=channel;document.getElementById('setupRemember').value=String(remember);setup.hidden=false;send({status:'setup_required'});setup.requestSubmit();}
void connect();
