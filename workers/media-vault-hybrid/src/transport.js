import {transferBudget,streamingEnabled} from './limits.js';
// Session-only file transfer: source bytes travel VPS -> outbound WebSocket
// -> Durable Object TransformStream -> browser. D1 stores ONLY byte counts.
const hex=b=>Array.from(b).map(n=>n.toString(16).padStart(2,'0')).join('');
const newToken=()=>hex(crypto.getRandomValues(new Uint8Array(32)));
const month=()=>new Date().toISOString().slice(0,7);
function equal(a,b){
 if(!a||!b||a.length!==b.length)return false;
 let k=0;for(let i=0;i<a.length;i++)k|=a.charCodeAt(i)^b.charCodeAt(i);
 return k===0;
}
const auth=(req,secret)=>typeof secret==='string'&&secret.length>=32&&equal(req.headers.get('Authorization')||'','Bearer '+secret);
async function hash(text){
 const raw=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
 return hex(new Uint8Array(raw));
}
function json(obj,status=200){return new Response(JSON.stringify(obj),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}
const fail=(status,message)=>json({error:message},status);
const pathPattern=/^(aria|video|generated)\/[a-zA-Z0-9][a-zA-Z0-9._/ \[\]()\u0080-\uffff-]{0,220}$/u;
const jid=/^[0-9a-f]{24}$/;
const ready=e=>streamingEnabled(e)&&!!e?.DB;
const room=e=>e.RELAY.get(e.RELAY.idFromName('media-vault-private'));
export async function transportRoute(request,env){
 const response=await transportCore(request,env);
 if(!response||response.status===101)return response;
 const origin=request.headers.get('Origin');
 if(origin!=='https://ximinhu66.github.io')return response;
 const headers=new Headers(response.headers);
 headers.set('Access-Control-Allow-Origin','https://ximinhu66.github.io');
 headers.set('Vary','Origin');
 return new Response(response.body,{status:response.status,headers});
}
async function transportCore(request,env){
 const u=new URL(request.url),p=u.pathname;
 if(!['/download-ticket','/download','/agent/ws'].includes(p))return null;
 if(!ready(env))return fail(503,'Direct local-computer transfer relay is not enabled; no cloud media storage fallback');
 if(p==='/agent/ws'){
  if(!auth(request,env.MEDIA_AGENT_TOKEN))return fail(401,'Agent authentication required');
  if(request.headers.get('Upgrade')!=='websocket')return fail(426,'WebSocket required');
  return room(env).fetch('https://private/agent-connect',{headers:{Upgrade:'websocket'}});
 }
 if(p==='/download-ticket'){
  if(request.method!=='POST')return fail(405,'Method not allowed');
  if(!auth(request,env.MEDIA_OWNER_TOKEN))return fail(401,'Authentication required');
  let data;
  try {
   if(Number(request.headers.get('Content-Length')||0)>16000)return fail(413,'Request body too large');
   data=await request.json();
  }catch{return fail(400,'Expected JSON body')}
  return issueFileTicket(env,data);
 }
 if(p==='/download'){
  if(request.method!=='GET')return fail(405,'Method not allowed');
  const token=u.searchParams.get('ticket');
  if(!/^[0-9a-f]{64}$/.test(token||''))return fail(403,'Invalid file ticket');
  const digest=await hash(token);
  const t=await env.DB.prepare("SELECT job_id,relative_path,bytes,month FROM mv_hybrid_tickets WHERE digest=? AND status='new' AND expires_at>?").bind(digest,Date.now()).first();
  if(!t)return fail(403,'Ticket expired or already redeemed');
  // A paired ticket expires with its approved test session, including revocation.
  const link=await env.DB.prepare('SELECT session_digest FROM mv_hybrid_browser_tickets WHERE digest=?').bind(digest).first();
  if(link){
   const session=await env.DB.prepare("SELECT digest FROM mv_hybrid_browser_sessions WHERE digest=? AND status='approved' AND expires_at>?").bind(link.session_digest,Date.now()).first();
   if(!session)return fail(403,'Test session expired or revoked');
  }
  const marked=await env.DB.prepare("UPDATE mv_hybrid_tickets SET status='active' WHERE digest=? AND status='new' AND expires_at>?").bind(digest,Date.now()).run();
  if(!marked.meta?.changes)return fail(403,'Ticket already used');
  const file=await env.DB.prepare('SELECT name FROM mv_hybrid_files WHERE job_id=? AND relative_path=?').bind(t.job_id,t.relative_path).first();
  if(!file){await releaseTicket(env,digest,t.month);return fail(404,'File metadata unavailable');}
  const transfer=hex(crypto.getRandomValues(new Uint8Array(12)));
  const q=new URLSearchParams({job:t.job_id,path:t.relative_path,transfer,size:String(t.bytes),name:file.name,month:t.month,digest});
  let res;
  try{res=await room(env).fetch('https://private/stream?'+q.toString());}
  catch{res=null}
  if(!res||res.status!==200){
   await releaseTicket(env,digest,t.month);
   return fail(503,'Download agent offline or busy; request another ticket');
  }
  const headers=new Headers(res.headers);
  headers.set('Referrer-Policy','no-referrer');
  headers.set('X-Robots-Tag','noindex');
  headers.set('Cache-Control','private, no-store');
  return new Response(res.body,{status:200,headers});
 }
 return null;
}
async function releaseTicket(env,digest,period){
 await env.DB.batch([
  env.DB.prepare("UPDATE mv_hybrid_transfer_usage SET reserved_bytes=MAX(0,reserved_bytes-(SELECT COALESCE(SUM(bytes),0) FROM mv_hybrid_tickets WHERE digest=? AND status='active')),updated_at=? WHERE month=?").bind(digest,Date.now(),period),
  env.DB.prepare("UPDATE mv_hybrid_tickets SET status='failed' WHERE digest=? AND status='active'").bind(digest)
 ]);
}


export async function issueFileTicket(env,data,session=null){
  if(!ready(env))return fail(503,'Direct transfer relay is disabled');
  if(!jid.test(data?.id||'')||!pathPattern.test(data?.path||'')||data.path.includes('..'))return fail(400,'Invalid file selection');
  const j=await env.DB.prepare('SELECT status FROM mv_hybrid_jobs WHERE id=?').bind(data.id).first();
  if(j?.status!=='complete')return fail(409,'Job not completed');
  const f=await env.DB.prepare('SELECT bytes,name FROM mv_hybrid_files WHERE job_id=? AND relative_path=?').bind(data.id,data.path).first();
  if(!f||!Number.isSafeInteger(f.bytes)||f.bytes<=0||f.bytes>12*1024**3)return fail(404,'File not found or size invalid');
  if(env.MEDIA_STREAM_TEST_UNTIL&&f.bytes>10*1024*1024)return fail(413,'Temporary acceptance allows only small files');
  const m=month(),now=Date.now();
  const expires=session?Math.min(now+120000,session.expires_at):now+120000;
  await env.DB.prepare('INSERT OR IGNORE INTO mv_hybrid_transfer_usage(month,transferred_bytes,reserved_bytes,updated_at) VALUES(?,0,0,?)').bind(m,now).run();
  // A D1 batch is a transaction: concurrent expiry checks cannot release twice.
  await env.DB.batch([
   env.DB.prepare("UPDATE mv_hybrid_transfer_usage SET reserved_bytes=MAX(0,reserved_bytes-(SELECT COALESCE(SUM(bytes),0) FROM mv_hybrid_tickets WHERE month=? AND status='new' AND expires_at<=?)),updated_at=? WHERE month=?").bind(m,now,now,m),
   env.DB.prepare("UPDATE mv_hybrid_tickets SET status='expired' WHERE month=? AND status='new' AND expires_at<=?").bind(m,now)
  ]);
  const token=newToken();
  const digest=await hash(token);
  try {
   const ops=[
    env.DB.prepare("INSERT INTO mv_hybrid_tickets(digest,job_id,relative_path,bytes,month,expires_at,status) SELECT ?,?,?,?,?,?,'new' FROM mv_hybrid_transfer_usage WHERE month=? AND transferred_bytes+reserved_bytes+?<=?"+(session?" AND EXISTS(SELECT 1 FROM mv_hybrid_browser_sessions WHERE digest=? AND status='approved' AND expires_at>? AND issued_tickets<6)":''))
     .bind(digest,data.id,data.path,f.bytes,m,expires,m,f.bytes,transferBudget(env),...(session?[session.digest,now]:[])),
    env.DB.prepare("UPDATE mv_hybrid_transfer_usage SET reserved_bytes=reserved_bytes+?,updated_at=? WHERE month=? AND EXISTS(SELECT 1 FROM mv_hybrid_tickets WHERE digest=? AND status='new')").bind(f.bytes,now,m,digest)
   ];
   if(session){
    ops.push(env.DB.prepare("INSERT INTO mv_hybrid_browser_tickets(digest,session_digest) SELECT ?,? WHERE EXISTS(SELECT 1 FROM mv_hybrid_tickets WHERE digest=? AND status='new')").bind(digest,session.digest,digest));
    ops.push(env.DB.prepare("UPDATE mv_hybrid_browser_sessions SET issued_tickets=issued_tickets+1 WHERE digest=? AND EXISTS(SELECT 1 FROM mv_hybrid_tickets WHERE digest=? AND status='new')").bind(session.digest,digest));
   }
   const issued=await env.DB.batch(ops);
   if(!issued[0].meta?.changes)return fail(429,'Application transfer budget or bounded test ticket limit reached');
  }catch(e){
   return fail(503,'Failed to issue file ticket');
  }
  return json({ticket:token,expires_in:120},200);

}
