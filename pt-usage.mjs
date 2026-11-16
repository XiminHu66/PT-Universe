const API='https://pt-universe-api.summer07-nanjolno.workers.dev/api/usage/visit';
const KEY='pt.usage.browser.v1';
const clock=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Los_Angeles'});
const ownOrigin='https://ximinhu66.github.io';
const accountKeys=['ptu.sync.config','ptu.decision.collector-account'];
let pending=false;

function browserId(){
  let id=localStorage.getItem(KEY);
  if(!id){id=crypto.randomUUID();localStorage.setItem(KEY,id);}
  return id;
}

export async function recordVisit(){
  if(location.origin!==ownOrigin||!/^\/PT-Universe(?:\/|$)/i.test(location.pathname)||document.hidden||pending)return;
  const site=/^\/PT-Universe\/apps\/daily-nexus(?:\/|$)/i.test(location.pathname)?'nexus':'universe';
  const stamp=KEY+'.'+site,day=clock.format(new Date());
  try{
    if(localStorage.getItem(stamp)===day)return;
    pending=true;
    const response=await fetch(API,{method:'POST',keepalive:true,credentials:'omit',headers:{'content-type':'text/plain;charset=UTF-8'},body:JSON.stringify({id:browserId(),site})});
    if(response.status===204)localStorage.setItem(stamp,day);
  }catch{/* Visit telemetry must never interrupt navigation. */}
  finally{pending=false;}
}

async function hashIdentity(kind,id){
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('pt-usage:'+kind+':'+id));
  return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
}

export async function ownUsageIdentities(){
  const ids=[];
  for(const key of accountKeys){
    try{
      const id=JSON.parse(localStorage.getItem(key)||'null')?.id;
      if(typeof id==='string'&&/^[-0-9a-f]{36}$/i.test(id))ids.push(id);
    }catch{/* Ignore inaccessible or stale pairing settings. */}
  }
  return {browser:await hashIdentity('browser',browserId()),accounts:await Promise.all([...new Set(ids)].map(id=>hashIdentity('account',id)))};
}
