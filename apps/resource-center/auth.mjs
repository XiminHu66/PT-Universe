export const RESOURCE_API='https://pt-universe-api.summer07-nanjolno.workers.dev/api/resources';
const HUB='https://pt-vps-tools.h1nano.chatgpt.site',KEY='pt.resources.session.v1',PENDING='pt.resources.connect.v1',ATTEMPT='pt.resources.connect-attempt.v1';
const get=k=>{try{return sessionStorage.getItem(k)}catch{return null}},put=(k,v)=>{try{sessionStorage.setItem(k,v);return true}catch{return false}},drop=k=>{try{sessionStorage.removeItem(k)}catch{}};
const payload=s=>{try{return JSON.parse(atob(s.split('.')[1].replaceAll('-','+').replaceAll('_','/')+'==='.slice((s.split('.')[1].length+3)%4)))}catch{return null}};
const valid=s=>{const p=payload(s||''),t=Math.floor(Date.now()/1000);return p?.iss===HUB&&p.aud==='pt-universe-resources'&&p.sub==='pt-backend-owner'&&p.scope==='resources:read'&&Number.isInteger(p.iat)&&Number.isInteger(p.exp)&&p.iat<=t+30&&p.iat>=t-86400&&p.exp>t+60&&p.exp>p.iat&&p.exp-p.iat<=86400&&/^[a-f0-9]{48}$/.test(p.nonce||'');};
let invalid=false;
export let returningToNexus=false;
export function resourceSession(){
 const u=new URL(location.href),params=new URLSearchParams(u.hash.slice(1));
 if(params.has('resource-session')){
  const candidate=params.get('resource-session')||'',nonce=params.get('nonce')||'';let pending;try{pending=JSON.parse(get(PENDING)||'null')}catch{}
  u.hash='';history.replaceState(history.state,'',u.href);
  if(pending?.nonce===nonce&&pending.expiresAt>Date.now()&&payload(candidate)?.nonce===nonce&&valid(candidate)){put(KEY,candidate);drop(ATTEMPT);if(pending.returnTo==='nexus'){returningToNexus=true;const target=new URL('../daily-nexus/',location.href);target.searchParams.set('view','monitor');target.searchParams.set('monitor',['overview','workflows','projects','settings'].includes(pending.view)?pending.view:'overview');location.replace(target.href);}}else{drop(KEY);invalid=true;}
  drop(PENDING);
 }
 const value=get(KEY);if(valid(value))return value;drop(KEY);return '';
}
export function connectResources(manual=false,nexusView=null){
 const prior=Number(get(ATTEMPT)||0);if(!manual&&(invalid||prior&&Date.now()-prior<120000))throw Error('连接尚未完成，请点击“连接资源后台”重试。');
 const nonce=Array.from(crypto.getRandomValues(new Uint8Array(24)),b=>b.toString(16).padStart(2,'0')).join('');
 if(!put(PENDING,JSON.stringify({nonce,expiresAt:Date.now()+600000,...(['overview','workflows','projects','settings'].includes(nexusView)?{returnTo:'nexus',view:nexusView}:{})}))||!put(ATTEMPT,String(Date.now())))throw Error('请允许站点临时存储后连接后台。');
 const destination=HUB+'/__pt_resources_connect?nonce='+nonce;
 if(nexusView&&window.parent!==window)window.top.location.assign(destination);else location.assign(destination);
}
export function clearResourceSession(){drop(KEY);}
