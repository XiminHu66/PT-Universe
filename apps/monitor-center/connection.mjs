export const API='https://pt-universe-api.summer07-nanjolno.workers.dev/api/monitor';
export const HUB='https://pt-vps-tools.h1nano.chatgpt.site';
const KEY='pt.monitor.session.v1',PENDING='pt.monitor.pending.v1',ATTEMPT='pt.monitor.attempt.v1';
const get=k=>{try{return sessionStorage.getItem(k)}catch{return null}},set=(k,v)=>{try{sessionStorage.setItem(k,v);return true}catch{return false}},drop=k=>{try{sessionStorage.removeItem(k)}catch{}};
export function payload(value){try{return JSON.parse(atob(value.split('.')[1].replaceAll('-','+').replaceAll('_','/')+'==='.slice((value.split('.')[1].length+3)%4)))}catch{return null}}
export function usable(token){const p=payload(token||''),t=Math.floor(Date.now()/1000);return p?.iss===HUB&&p.aud==='pt-universe-monitor'&&p.sub==='pt-backend-owner'&&p.scope==='monitor:manage'&&Number.isInteger(p.iat)&&Number.isInteger(p.exp)&&p.iat<=t+30&&p.iat>=t-3600&&p.exp>t+30&&p.exp>p.iat&&p.exp-p.iat<=3600&&/^[a-f0-9]{48}$/.test(p.nonce||'');}
let token=get(KEY)||'',invalid=false;
const fragment=new URLSearchParams(location.hash.slice(1));
if(fragment.has('monitor-session')){const candidate=fragment.get('monitor-session'),nonce=fragment.get('nonce');let pending;try{pending=JSON.parse(get(PENDING)||'null')}catch{}history.replaceState(history.state,'',location.pathname+location.search);if(pending?.nonce===nonce&&pending.expiresAt>Date.now()&&payload(candidate)?.nonce===nonce&&usable(candidate)){token=candidate;set(KEY,token)}else{token='';drop(KEY);invalid=true}drop(PENDING);}
if(!usable(token)){token='';drop(KEY);}
export const connected=()=>usable(token);
export function connect({automatic=false}={}){if(automatic&&(location.origin!=='https://ximinhu66.github.io'||invalid||connected()||Date.now()-Number(get(ATTEMPT)||0)<120000))return false;const nonce=[...crypto.getRandomValues(new Uint8Array(24))].map(v=>v.toString(16).padStart(2,'0')).join('');if(!set(PENDING,JSON.stringify({nonce,expiresAt:Date.now()+600000})))throw Error('请允许本站临时存储后重试');set(ATTEMPT,String(Date.now()));location.assign(HUB+'/__pt_monitor_connect?nonce='+nonce);return true;}
export async function api(path,{method='GET',body}={}){
 if(!/^\/[a-z0-9/-]+$/i.test(path))throw Error('不支持的请求');
 const r=await fetch(API+path,{method,headers:{authorization:'Bearer '+token,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(40000)});
 let value;try{value=await r.json()}catch{throw Error('后台返回异常，请稍后重试')};if(r.status===401){token='';drop(KEY);invalid=true;document.dispatchEvent(new CustomEvent('monitor-disconnected'));}if(!r.ok)throw Error(value.error||'请求失败');return value;
}

// Resume only the fixed Deal Lab page after the existing nonce-bound connection flow.
if(connected()&&location.pathname.startsWith('/PT-Universe/apps/monitor-center')){let resume;try{resume=JSON.parse(get('pt.deal-lab.return.v1')||'null')}catch{}drop('pt.deal-lab.return.v1');if(resume?.path==='/PT-Universe/apps/deal-lab/'&&resume.expiresAt>Date.now())location.replace(resume.path);}
