import {COOKIE,hex,digest,cookieDigest} from './session-auth.js';
import {issueFileTicket} from './transport.js';
import {streamingEnabled,transferBudget} from './limits.js';
const response=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
const fail=(code,label)=>response({error:label},code);
const windowOpen=env=>env.ENABLE_ACCEPTANCE_UI==='true'&&Number.isSafeInteger(Number(env.MEDIA_ACCEPTANCE_UNTIL))&&Number(env.MEDIA_ACCEPTANCE_UNTIL)>Date.now();
const ids=env=>(env.MEDIA_ACCEPTANCE_JOB_IDS||'').split(',');
const validIds=list=>list.length===3&&new Set(list).size===3&&list.every(x=>/^[a-f0-9]{24}$/.test(x));
function owner(request,env){
 const value=request.headers.get('Authorization')||'',expected='Bearer '+(env.MEDIA_OWNER_TOKEN||'');
 if((env.MEDIA_OWNER_TOKEN||'').length<32||value.length!==expected.length)return false;
 let k=0;for(let i=0;i<value.length;i++)k|=value.charCodeAt(i)^expected.charCodeAt(i);return k===0;
}
async function body(request){const text=await request.text();if(text.length>1600)throw Error('Oversized body');return JSON.parse(text)}
async function session(request,env){
 const hash=await cookieDigest(request);if(!hash)return null;
 return env.DB.prepare('SELECT * FROM mv_hybrid_browser_sessions WHERE digest=? AND expires_at>?').bind(hash,Date.now()).first();
}
export async function browserSessionRoute(request,env){
 const u=new URL(request.url),p=u.pathname;
 if(!['/acceptance/pair','/acceptance/approve','/acceptance/session','/acceptance/ticket','/acceptance/revoke','/acceptance/logout'].includes(p))return null;
 if(!env.DB)return fail(503,'Metadata service unavailable');
 try{
  if(p==='/acceptance/logout'){
   if(request.method!=='POST')return fail(405,'POST required');
   if(request.headers.get('Origin')!==u.origin)return fail(403,'Same-origin logout required');
   const hash=await cookieDigest(request);if(!hash)return fail(403,'Browser session required');
   await env.DB.batch([
    env.DB.prepare("UPDATE mv_hybrid_transfer_usage SET reserved_bytes=MAX(0,reserved_bytes-(SELECT COALESCE(SUM(t.bytes),0) FROM mv_hybrid_tickets t JOIN mv_hybrid_browser_tickets b ON b.digest=t.digest WHERE t.month=mv_hybrid_transfer_usage.month AND t.status='new' AND b.session_digest=?)),updated_at=?").bind(hash,Date.now()),
    env.DB.prepare("UPDATE mv_hybrid_tickets SET status='expired' WHERE status='new' AND digest IN(SELECT digest FROM mv_hybrid_browser_tickets WHERE session_digest=?)").bind(hash),
    env.DB.prepare("UPDATE mv_hybrid_browser_sessions SET status='revoked' WHERE digest=?").bind(hash)
   ]);
   return response({ok:true},200,{'Set-Cookie':COOKIE+'=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0'});
  }
  if(p==='/acceptance/revoke'){
   if(request.method!=='POST')return fail(405,'POST required');
   if(!owner(request,env))return fail(401,'Owner authorization required');
   await env.DB.batch([
    env.DB.prepare("UPDATE mv_hybrid_transfer_usage SET reserved_bytes=MAX(0,reserved_bytes-(SELECT COALESCE(SUM(t.bytes),0) FROM mv_hybrid_tickets t JOIN mv_hybrid_browser_tickets b ON b.digest=t.digest JOIN mv_hybrid_browser_sessions s ON s.digest=b.session_digest WHERE t.month=mv_hybrid_transfer_usage.month AND t.status='new' AND s.status IN ('pending','approved'))),updated_at=?").bind(Date.now()),
    env.DB.prepare("UPDATE mv_hybrid_tickets SET status='expired' WHERE status='new' AND digest IN(SELECT b.digest FROM mv_hybrid_browser_tickets b JOIN mv_hybrid_browser_sessions s ON s.digest=b.session_digest WHERE s.status IN ('pending','approved'))"),
    env.DB.prepare("UPDATE mv_hybrid_browser_sessions SET status='revoked' WHERE status IN ('pending','approved')")
   ]);
   return response({ok:true});
  }
  if(!windowOpen(env)||!validIds(ids(env)))return fail(404,'Browser acceptance unavailable');
  if(p==='/acceptance/pair'){
   if(request.method!=='POST')return fail(405,'POST required');
   if(request.headers.get('Origin')!==u.origin)return fail(403,'Same-origin pairing required');
   const token=hex(crypto.getRandomValues(new Uint8Array(32))),code=hex(crypto.getRandomValues(new Uint8Array(8)));
   const expires=Math.min(Date.now()+5*60*1000,Number(env.MEDIA_ACCEPTANCE_UNTIL));
   const created=await env.DB.prepare("INSERT INTO mv_hybrid_browser_sessions(digest,pair_code,expires_at) SELECT ?,?,? WHERE (SELECT COUNT(*) FROM mv_hybrid_browser_sessions WHERE status='pending' AND expires_at>?)<10").bind(await digest(token),code,expires,Date.now()).run();
   if(!created.meta?.changes)return fail(429,'Too many pending test sessions');
   return response({pair_code:code,status:'pending',expires_at:expires},201,{'Set-Cookie':COOKIE+'='+token+'; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=900'});
  }
  if(p==='/acceptance/approve'){
   if(request.method!=='POST')return fail(405,'POST required');
   if(!owner(request,env))return fail(401,'Owner authorization required');
   const data=await body(request),code=String(data.code||'').toLowerCase(),selected=data.ids;
   if(!/^[a-f0-9]{16}$/.test(code)||!Array.isArray(selected)||!validIds(selected)||selected.join(',')!==ids(env).join(','))return fail(403,'Approval must match configured test files');
   for(const id of selected){
    const job=await env.DB.prepare('SELECT status FROM mv_hybrid_jobs WHERE id=?').bind(id).first();
    const files=await env.DB.prepare('SELECT relative_path AS path,name,bytes AS size FROM mv_hybrid_files WHERE job_id=?').bind(id).all();
    if(job?.status!=='complete'||files.results?.length!==1||!Number.isSafeInteger(files.results[0].size)||files.results[0].size<=0||files.results[0].size>10*1024*1024)return fail(409,'Test files unavailable');
   }
   const until=Math.min(Date.now()+15*60*1000,Number(env.MEDIA_ACCEPTANCE_UNTIL));
   const updated=await env.DB.prepare("UPDATE mv_hybrid_browser_sessions SET status='approved',job_ids_json=?,expires_at=? WHERE pair_code=? AND status='pending' AND expires_at>?").bind(JSON.stringify(selected),until,code,Date.now()).run();
   return updated.meta?.changes?response({ok:true,scope:'three small test files',expires_at:until}):fail(409,'Pairing code expired or already approved');
  }
  const current=await session(request,env);
  if(!current||!['pending','approved'].includes(current.status))return fail(403,'Test session unavailable');
  if(p==='/acceptance/session'){
   if(request.method!=='GET')return fail(405,'GET required');
   if(current.status==='pending')return response({status:'pending',pair_code:current.pair_code,expires_at:current.expires_at});
   const selected=JSON.parse(current.job_ids_json);if(!validIds(selected)||selected.join(',')!==ids(env).join(','))return fail(403,'Test scope changed');
   const files=[];
   for(const id of selected){const found=await env.DB.prepare('SELECT relative_path AS path,name,bytes AS size FROM mv_hybrid_files WHERE job_id=?').bind(id).all();files.push(...found.results.map(f=>({...f,id})))}
   const quota=await env.DB.prepare('SELECT transferred_bytes,reserved_bytes FROM mv_hybrid_transfer_usage WHERE month=?').bind(new Date().toISOString().slice(0,7)).first();
   const transferred=Number(quota?.transferred_bytes||0),reserved=Number(quota?.reserved_bytes||0),limit=transferBudget(env);
   return response({status:'approved',expires_at:current.expires_at,streaming:streamingEnabled(env)?'enabled':'not-live',files,quota:{period:new Date().toISOString().slice(0,7),limit_bytes:limit,transferred_bytes:transferred,reserved_bytes:reserved,remaining_bytes:Math.max(0,limit-transferred-reserved),tracking:streamingEnabled(env)?'active':'not_active',kind:'self_imposed_monthly_budget'}});
  }
  if(request.method!=='POST')return fail(405,'POST required');
  if(request.headers.get('Origin')!==u.origin)return fail(403,'Same-origin ticket required');
  const data=await body(request),selected=JSON.parse(current.job_ids_json);
  if(current.status!=='approved'||!validIds(selected)||selected.join(',')!==ids(env).join(',')||!selected.includes(data.id))return fail(403,'File outside approved test scope');
  return issueFileTicket(env,data,current);
 }catch{return fail(500,'Browser test session request failed')}
}
