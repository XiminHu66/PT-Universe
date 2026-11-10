export const RESOURCE_API='https://pt-universe-api.summer07-nanjolno.workers.dev/api/resources';
const HUB='https://pt-vps-tools.h1nano.chatgpt.site',KEY='pt.resources.session.v1',PENDING='pt.resources.connect.v1',ATTEMPT='pt.resources.connect-attempt.v1';
const get=k=>{try{return sessionStorage.getItem(k)}catch{return null}},put=(k,v)=>{try{sessionStorage.setItem(k,v);return true}catch{return false}},drop=k=>{try{sessionStorage.removeItem(k)}catch{}};
const payload=s=>{try{return JSON.parse(atob(s.split('.')[1].replaceAll('-','+').replaceAll('_','/')+'==='.slice((s.split('.')[1].length+3)%4)))}catch{return null}};
const valid=s=>{const p=payload(s||''),t=Math.floor(Date.now()/1000);return p?.iss===HUB&&p.aud==='pt-universe-resources'&&p.sub==='pt-backend-owner'&&p.scope==='resources:read'&&Number.isInteger(p.iat)&&Number.isInteger(p.exp)&&p.iat<=t+30&&p.iat>=t-86400&&p.exp>t+60&&p.exp>p.iat&&p.exp-p.iat<=86400&&/^[a-f0-9]{48}$/.test(p.nonce||'');};
let invalid=false,channel=null,listenerReady=false;
export let returningToNexus=false;
function pending(){try{return JSON.parse(get(PENDING)||'null')}catch{return null}}
function matches(candidate,nonce,p){return p?.nonce===nonce&&p.expiresAt>Date.now()&&payload(candidate)?.nonce===nonce&&valid(candidate);}
function finish(error,candidate){
 const current=channel;if(!current)return;channel=null;clearTimeout(current.timer);current.frame?.remove();
 if(pending()?.nonce===current.nonce)drop(PENDING);
 if(error){current.reject(error);return;}
 if(!put(KEY,candidate)){current.reject(Error('请允许站点临时存储后连接后台。'));return;}
 drop(ATTEMPT);invalid=false;current.resolve();
}
function listen(){if(listenerReady)return;listenerReady=true;
 window.addEventListener('message',event=>{
  const c=channel,d=event.data;if(!c||event.origin!==location.origin||event.source!==c.ref||d?.type!=='pt-resource-auth-return'||d.nonce!==c.nonce)return;
  if(!matches(d.session,d.nonce,pending())){finish(Error('连接校验未通过，请重试连接。'));return;}
  finish(null,d.session);
 });
}
export function resourceSession(){
 const u=new URL(location.href),params=new URLSearchParams(u.hash.slice(1));
 if(params.has('resource-session')){
  const candidate=params.get('resource-session')||'',nonce=params.get('nonce')||'',p=pending();
  u.hash='';history.replaceState(history.state,'',u.href);
  if(matches(candidate,nonce,p)){
   if(p.transport==='frame'||p.transport==='popup'){
    returningToNexus=true;
    const target=p.transport==='popup'?window.opener:window.parent;
    if(target&&target!==window){target.postMessage({type:'pt-resource-auth-return',nonce,session:candidate},location.origin);if(p.transport==='popup')window.close();}
   }else{
    put(KEY,candidate);drop(ATTEMPT);drop(PENDING);
    // Compatibility for an owner connection started by an earlier version.
    if(p.returnTo==='nexus'){returningToNexus=true;const target=new URL('../daily-nexus/',location.href);target.searchParams.set('view',p.view==='vps'?'vps':'monitor');if(p.view!=='vps')target.searchParams.set('monitor',['overview','workflows','projects','settings','releases'].includes(p.view)?p.view:'overview');location.replace(target.href);}
   }
  }else{if(p?.nonce===nonce){drop(KEY);drop(PENDING);}invalid=true;if(window.parent!==window||window.opener)returningToNexus=true;}
 }
 const value=get(KEY);if(valid(value))return value;drop(KEY);return '';
}
export function connectResources(manual=false,nexusView=null){
 if(channel)return channel.promise;
 const prior=Number(get(ATTEMPT)||0);if(!manual&&(invalid||prior&&Date.now()-prior<120000))throw Error('连接尚未完成，可点击连接重试。');
 const nonce=Array.from(crypto.getRandomValues(new Uint8Array(24)),b=>b.toString(16).padStart(2,'0')).join('');
 const isolated=['overview','workflows','projects','settings','releases','vps'].includes(nexusView),transport=manual?'popup':'frame';
 if(!put(PENDING,JSON.stringify({nonce,expiresAt:Date.now()+600000,...(isolated?{returnTo:'nexus',view:nexusView,transport}:{})}))||!put(ATTEMPT,String(Date.now())))throw Error('请允许站点临时存储后连接后台。');
 const destination=HUB+'/__pt_resources_connect?nonce='+nonce;
 if(!isolated){location.assign(destination);return;}
 listen();let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});channel={nonce,promise,resolve,reject,ref:null,frame:null,timer:null};
 if(manual){
  const popup=window.open(destination,'pt-resource-owner-connect','popup,width=520,height=700');
  if(!popup){finish(Error('请允许连接窗口弹出后重试；Daily Nexus 不会跳转。'));return promise;}
  channel.ref=popup;const deadline=Date.now()+300000;
  const watch=()=>{if(!channel||channel.nonce!==nonce)return;if(popup.closed){finish(Error('连接窗口已关闭，当前页面已保留。'));return;}if(Date.now()>=deadline){finish(Error('连接尚未完成，请重试连接。'));return;}channel.timer=setTimeout(watch,1000);};channel.timer=setTimeout(watch,1000);
 }else{
  const frame=document.createElement('iframe');frame.hidden=true;frame.title='后台连接';frame.referrerPolicy='no-referrer';document.body.append(frame);channel.frame=frame;channel.ref=frame.contentWindow;frame.src=destination;
  channel.timer=setTimeout(()=>finish(Error('后台登录需要确认，请点击连接；当前页面已保留。')),15000);
 }
 return promise;
}
export function clearResourceSession(){drop(KEY);}
