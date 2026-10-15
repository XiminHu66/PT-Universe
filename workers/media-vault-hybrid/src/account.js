import {appFileTest,fileTestPermits} from './account-file-scope.js';
import {appEnabled,appCookieDigest,ownerAuthorized,randomHex,appCookie,APP_LIFETIME,appDeadline,appReadOnly,appSubmissionTest,appFilesAllowed,appJobLimit,appTicketLimit,appScope} from './account-auth.js';
import {digest} from './session-auth.js';
import {canonicalJob,rowFormat} from './job-contract.js';
import {novelCatalog} from './account-catalog.js';
import {transferBudget,streamingEnabled} from './limits.js';
import {issueFileTicket} from './transport.js';
import {PILOT_PRESETS,pilotPermits} from './account-pilot.js';
const reply=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
const fail=(status,error)=>reply({error},status);
const active="'queued','running','waiting','active'";
const jobPattern=/^[a-f0-9]{24}$/;
async function body(request){
 try{const raw=await request.text();if(raw.length>12000)throw Error('Oversized JSON');
 const data=JSON.parse(raw);if(!data||typeof data!=='object'||Array.isArray(data))throw Error('Object required');return data;
 }catch{throw Object.assign(Error('Invalid JSON body'),{status:400});}
}
async function revoke(db,hash){
 await db.batch([
  db.prepare("UPDATE mv_hybrid_transfer_usage SET reserved_bytes=MAX(0,reserved_bytes-(SELECT COALESCE(SUM(t.bytes),0) FROM mv_hybrid_tickets t JOIN mv_hybrid_app_tickets a ON a.digest=t.digest WHERE t.month=mv_hybrid_transfer_usage.month AND t.status='new' AND a.session_digest=?)),updated_at=?").bind(hash,Date.now()),
  db.prepare("UPDATE mv_hybrid_tickets SET status='expired' WHERE status='new' AND digest IN(SELECT digest FROM mv_hybrid_app_tickets WHERE session_digest=?)").bind(hash),
  db.prepare("UPDATE mv_hybrid_app_sessions SET status='revoked' WHERE digest=?").bind(hash)
 ]);
}
export async function accountRoute(request,env){
 const u=new URL(request.url),p=u.pathname;
 if(!p.startsWith('/app-auth/')&&!p.startsWith('/app-api/'))return null;
 // No credentialed CORS: even read access belongs to the dedicated origin.
 if(request.headers.get('Origin')&&request.headers.get('Origin')!==u.origin)return fail(403,'Same-origin account access required');
 try{
  if(p==='/app-auth/revoke'){
   if(request.method!=='POST')return fail(405,'POST required');
   if(!ownerAuthorized(request,env))return fail(401,'Owner authorization required');
   const data=await body(request);if(!jobPattern.test(data.session_id||''))return fail(400,'Invalid session ID');
   if(!env.DB)return fail(503,'Metadata unavailable');
   const session=await env.DB.prepare('SELECT digest FROM mv_hybrid_app_sessions WHERE id=?').bind(data.session_id).first();
   if(session)await revoke(env.DB,session.digest);
   return reply({ok:true});
  }
  if(p==='/app-auth/logout'){
   if(request.method!=='POST')return fail(405,'POST required');
   if(request.headers.get('Origin')!==u.origin)return fail(403,'Same-origin logout required');
   const hash=await appCookieDigest(request);if(hash&&env.DB)await revoke(env.DB,hash);
   if(hash&&!env.DB)return fail(503,'Metadata unavailable');
   return reply({ok:true},200,{'Set-Cookie':appCookie('',0)});
  }
  if(!appEnabled(env))return fail(404,'Account access unavailable');
  if(!env.DB)return fail(503,'Metadata unavailable');
  const hash=await appCookieDigest(request);
  const current=hash?await env.DB.prepare('SELECT * FROM mv_hybrid_app_sessions WHERE digest=? AND expires_at>?').bind(hash,Date.now()).first():null;
  if(p==='/app-auth/pair'){
   if(request.method!=='POST')return fail(405,'POST required');
   if(request.headers.get('Origin')!==u.origin)return fail(403,'Same-origin pairing required');
   // A browser must explicitly logout before changing its cookie, so old
   // pending or approved grants cannot be silently abandoned and multiplied.
   if(current&&['pending','approved'].includes(current.status))return fail(409,'Logout before requesting a replacement session');
   const token=randomHex(32),code=randomHex(16),id=randomHex(12),now=Date.now(),expires=Math.min(now+5*60000,appDeadline(env));
   const result=await env.DB.prepare("INSERT INTO mv_hybrid_app_sessions(digest,id,pair_code,account_id,created_at,expires_at) SELECT ?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM mv_hybrid_app_sessions WHERE status='pending' AND expires_at>?)<10").bind(await digest(token),id,code,env.MEDIA_APP_ACCOUNT_ID,now,expires,now).run();
   if(!result.meta?.changes)return fail(429,'Too many pending account requests');
   return reply({status:'pending',pair_code:code,session_id:id,expires_at:expires},201,{'Set-Cookie':appCookie(token,Math.max(0,Math.floor(Math.min(APP_LIFETIME,appDeadline(env)-now)/1000)))});
  }
  if(p==='/app-auth/approve'){
   if(request.method!=='POST')return fail(405,'POST required');
   if(!ownerAuthorized(request,env))return fail(401,'Owner authorization required');
   const data=await body(request);if(!/^[a-f0-9]{32}$/.test(data.code||''))return fail(400,'Invalid account request code');
   const now=Date.now();
   const result=await env.DB.prepare("UPDATE mv_hybrid_app_sessions SET status='approved',account_id=?,expires_at=MIN(created_at+?,?) WHERE pair_code=? AND account_id=? AND status='pending' AND expires_at>? AND (SELECT COUNT(*) FROM mv_hybrid_app_sessions WHERE status='approved' AND account_id=? AND expires_at>?)<?").bind(env.MEDIA_APP_ACCOUNT_ID,APP_LIFETIME,appDeadline(env),data.code,env.MEDIA_APP_ACCOUNT_ID,now,env.MEDIA_APP_ACCOUNT_ID,now,appFileTest(env)?1:3).run();
   if(!result.meta?.changes)return fail(409,'Request expired, already handled or device limit reached');
   const session=await env.DB.prepare('SELECT id,expires_at FROM mv_hybrid_app_sessions WHERE pair_code=?').bind(data.code).first();
   return reply({ok:true,session_id:session.id,expires_at:session.expires_at,scope:appScope(env),job_limit:appJobLimit(env),ticket_limit:appTicketLimit(env)});
  }
  if(!current||!['pending','approved'].includes(current.status))return fail(403,'Account session expired or revoked');
  if(p==='/app-auth/session'){
   if(request.method!=='GET')return fail(405,'GET required');
   if(current.account_id!==env.MEDIA_APP_ACCOUNT_ID)return fail(403,'Account scope changed');
   if(current.status==='pending')return reply({status:'pending',pair_code:current.pair_code,session_id:current.id,expires_at:current.expires_at});
   const fileUsage=appFileTest(env)?Number((await env.DB.prepare('SELECT COUNT(*) n FROM mv_hybrid_app_tickets a JOIN mv_hybrid_tickets t ON t.digest=a.digest JOIN mv_hybrid_app_sessions s ON s.digest=a.session_digest WHERE s.account_id=? AND t.expires_at>?').bind(current.account_id,Number(env.MEDIA_APP_FILE_TEST_START)).first())?.n||0):current.issued_tickets;
   const used=appSubmissionTest(env)?Number((await env.DB.prepare('SELECT COUNT(*) n FROM mv_hybrid_account_jobs WHERE account_id=?').bind(current.account_id).first())?.n||0):current.created_jobs;
   return reply({status:'approved',session_id:current.id,expires_at:Math.min(current.expires_at,appDeadline(env)),scope:appScope(env),read_only:appReadOnly(env),can_submit:!appReadOnly(env)&&!appFileTest(env)&&env.ENABLE_APP_SUBMISSION==='true',can_download:appFilesAllowed(env)&&streamingEnabled(env),job_limit:appJobLimit(env),ticket_limit:appTicketLimit(env),jobs_remaining:Math.max(0,appJobLimit(env)-used),tickets_remaining:Math.max(0,appTicketLimit(env)-fileUsage),...(appSubmissionTest(env)?{presets:PILOT_PRESETS}:{} )});
  }
  if(current.status!=='approved'||current.account_id!==env.MEDIA_APP_ACCOUNT_ID)return fail(403,'Approved account required');
  if(request.method!=='GET'&&request.headers.get('Origin')!==u.origin)return fail(403,'Same-origin mutation required');
  if(appReadOnly(env)&&request.method!=='GET')return fail(403,'Login acceptance is read-only');
  if(p==='/app-api/novel/catalog'&&request.method==='GET'){
   if(appReadOnly(env)||appSubmissionTest(env)||appFileTest(env))return fail(403,'Catalog lookup is outside this fixed acceptance scope');
   if(u.searchParams.size!==1)return fail(400,'Source URL required');
   try{return reply(await novelCatalog(u.searchParams.get('url'),env));}
   catch(e){return fail([400,429].includes(e.status)?e.status:503,'Catalog unavailable; verify source access and retry later');}
  }
  if(p==='/app-api/health'&&request.method==='GET')return reply({ok:true,mode:'account-cookie',streaming:streamingEnabled(env)?'enabled':'not-live'});
  if(p==='/app-api/quota'&&request.method==='GET'){
   const period=new Date().toISOString().slice(0,7),q=await env.DB.prepare('SELECT transferred_bytes,reserved_bytes FROM mv_hybrid_transfer_usage WHERE month=?').bind(period).first();
   const used=Number(q?.transferred_bytes||0),reserved=Number(q?.reserved_bytes||0),limit=transferBudget(env);
   return reply({period,limit_bytes:limit,transferred_bytes:used,reserved_bytes:reserved,remaining_bytes:Math.max(0,limit-used-reserved),tracking:streamingEnabled(env)?'active':'not_active',kind:'self_imposed_monthly_budget'});
  }
  if(p==='/app-api/jobs'&&request.method==='GET'){
   const result=await env.DB.prepare('SELECT j.* FROM mv_hybrid_jobs j JOIN mv_hybrid_account_jobs a ON a.job_id=j.id WHERE a.account_id=? ORDER BY j.created_at DESC LIMIT 40').bind(current.account_id).all();
   return reply({jobs:result.results.filter(j=>!appFileTest(env)||fileTestPermits(env,j.id)).map(rowFormat)});
  }
  if(p==='/app-api/jobs'&&request.method==='POST'){
   if(appFileTest(env)||env.ENABLE_APP_SUBMISSION!=='true')return fail(403,'Account submission disabled');
   const raw=await body(request);let spec;
   if(raw.retry_of!==undefined){
    if(!jobPattern.test(raw.retry_of||''))return fail(400,'Invalid retry job ID');
    const prior=await env.DB.prepare('SELECT j.request_json,j.status FROM mv_hybrid_jobs j JOIN mv_hybrid_account_jobs a ON a.job_id=j.id WHERE j.id=? AND a.account_id=?').bind(raw.retry_of,current.account_id).first();
    if(!prior)return fail(404,'Account retry job not found');
    if(!['error','cancelled','expired'].includes(prior.status))return fail(409,'Only failed, cancelled or expired jobs can be rebuilt');
    spec=canonicalJob(JSON.parse(prior.request_json));
   }else spec=canonicalJob(raw);
   if(appSubmissionTest(env)&&!pilotPermits(spec))return fail(403,'Only the four fixed pilot recipes are permitted');
   if(!spec||!/^[a-f0-9]{32}$/.test(raw.request_key||''))return fail(400,'Valid job and request key required');
   const fingerprint=await digest(JSON.stringify(spec));
   const replay=async()=>env.DB.prepare('SELECT job_id,request_hash FROM mv_hybrid_account_jobs WHERE account_id=? AND request_key=?').bind(current.account_id,raw.request_key).first();
   const previous=await replay();if(previous)return previous.request_hash===fingerprint?reply({id:previous.job_id,replayed:true}):fail(409,'Request key was used for different input');
   const id=randomHex(12),now=Date.now();
   const batch=await env.DB.batch([
    env.DB.prepare("INSERT INTO mv_hybrid_jobs(id,kind,request_json,status,created_at,updated_at) SELECT ?,?,?,'queued',?,? WHERE (SELECT COUNT(*) FROM mv_hybrid_jobs WHERE status IN ("+active+"))<5 AND EXISTS(SELECT 1 FROM mv_hybrid_app_sessions WHERE digest=? AND status='approved' AND account_id=? AND expires_at>? AND created_jobs<?) AND NOT EXISTS(SELECT 1 FROM mv_hybrid_account_jobs WHERE account_id=? AND request_key=?)"+(appSubmissionTest(env)?" AND (SELECT COUNT(*) FROM mv_hybrid_account_jobs WHERE account_id=?)<4 AND NOT EXISTS(SELECT 1 FROM mv_hybrid_account_jobs WHERE account_id=? AND request_hash=?)":'')).bind(id,spec.kind,JSON.stringify(spec),now,now,current.digest,current.account_id,now,appJobLimit(env),current.account_id,raw.request_key,...(appSubmissionTest(env)?[current.account_id,current.account_id,fingerprint]:[])),
    env.DB.prepare('INSERT INTO mv_hybrid_account_jobs(job_id,account_id,request_key,request_hash,created_by_digest) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM mv_hybrid_jobs WHERE id=?)').bind(id,current.account_id,raw.request_key,fingerprint,current.digest,id),
    env.DB.prepare('UPDATE mv_hybrid_app_sessions SET created_jobs=created_jobs+1 WHERE digest=? AND EXISTS(SELECT 1 FROM mv_hybrid_account_jobs WHERE job_id=?)').bind(current.digest,id)
   ]);
   if(batch[0].meta?.changes)return reply({id,status:'queued'},202);
   const raced=await replay();if(raced)return raced.request_hash===fingerprint?reply({id:raced.job_id,replayed:true}):fail(409,'Request key was used for different input');
   return fail(429,'Queue full or session job allowance exhausted');
  }
  if(!['/app-api/jobs/files','/app-api/jobs/cancel','/app-api/download-ticket'].includes(p))return fail(404,'Unknown account endpoint');
  if(request.method!==(p.endsWith('/files')?'GET':'POST'))return fail(405,'Method not allowed');
  const data=p.endsWith('/files')?{id:u.searchParams.get('id')}:await body(request);
  if(!jobPattern.test(data.id||''))return fail(400,'Invalid job ID');
  const owned=await env.DB.prepare('SELECT j.status FROM mv_hybrid_jobs j JOIN mv_hybrid_account_jobs a ON a.job_id=j.id WHERE j.id=? AND a.account_id=?').bind(data.id,current.account_id).first();
  if(appFileTest(env)&&!fileTestPermits(env,data.id))return fail(404,'File outside this acceptance scope');
  if(!owned)return fail(404,'Account job not found');
  if(p.endsWith('/files')){
   const files=owned.status==='complete'?await env.DB.prepare('SELECT relative_path AS path,name,bytes AS size FROM mv_hybrid_files WHERE job_id=?').bind(data.id).all():{results:[]};return reply({files:files.results.filter(f=>!appFileTest(env)||fileTestPermits(env,data.id,f.path,f.size))});
  }
  if(p.endsWith('/cancel')){
   if(appFileTest(env))return fail(403,'Task mutations are outside this file-save scope');
   if(owned.status==='cancelled')return reply({ok:true});
   const now=Date.now();
   const r=await env.DB.prepare("UPDATE mv_hybrid_jobs SET status='cancelled',updated_at=? WHERE id=? AND status IN ("+active+") AND EXISTS(SELECT 1 FROM mv_hybrid_app_sessions WHERE digest=? AND status='approved' AND account_id=? AND expires_at>?) AND EXISTS(SELECT 1 FROM mv_hybrid_account_jobs WHERE job_id=? AND account_id=?)").bind(now,data.id,current.digest,current.account_id,now,data.id,current.account_id).run();
   return r.meta?.changes?reply({ok:true}):fail(409,'Job finished or session changed');
  }
  if(!appFilesAllowed(env))return fail(403,'This account acceptance does not grant file tickets');
  return issueFileTicket(env,data,{...current,kind:'app'});
 }catch(e){return fail(e.status===400?400:503,e.status===400?'Invalid request body':'Account service request failed; no media fallback');}
}
