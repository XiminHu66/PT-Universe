import {integratedRoute} from './integrated.js';
import {githubLoginRoute,loginReadiness} from './github-login.js';
import {validUrl,canonicalJob,rowFormat} from './job-contract.js';
import {accountRoute} from './account.js';
import {OCI_REFERENCE_BYTES,transferBudget,streamingEnabled} from './limits.js';
import {acceptancePage} from './acceptance.js';
import {nativeDownloadModule,nativeDownloadFailure} from './native-download.js';
import {previewRoute} from './preview.js';
import {browserSessionRoute} from './browser-session.js';
// Control plane only; stores tasks, metadata and REAL transfer ledger in D1.
// All media bytes will use a separate, not-yet-enabled live streaming channel.
// No R2, KV media storage, GitHub artifact uploads or arbitrary fetch/proxy.
import {transportRoute} from './transport.js';
export {MediaRelay} from './relay.js';
const CORS_ORIGIN='https://ximinhu66.github.io';
const active=new Set(['queued','running','waiting','active']);
const statuses=new Set(['queued','running','waiting','active','complete','error','cancelled']);
const jobIdPattern=/^[0-9a-f]{24}$/;
const ticketPath=/^(?:aria|video|generated)\/[a-zA-Z0-9][a-zA-Z0-9._/ \[\](),&!+'\u0080-\uffff\u{10000}-\u{10ffff}-]{0,220}$/u;

function equal(a,b){
  if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;
  let value=0;for(let i=0;i<a.length;i++)value|=a.charCodeAt(i)^b.charCodeAt(i);
  return value===0;
}
function reply(obj,status=200,origin=null){
  const headers=new Headers({'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  if(origin===CORS_ORIGIN){headers.set('Access-Control-Allow-Origin',CORS_ORIGIN);headers.set('Vary','Origin')}
  return new Response(JSON.stringify(obj),{status,headers});
}
function denied(origin,status=403,message='Forbidden'){return reply({error:message},status,origin)}
function tokenIs(request,secret){
  const expected=(secret&&String(secret))||'';
  return expected.length>=32&&equal(request.headers.get('Authorization')||'', 'Bearer '+expected);
}
function month(){return new Date().toISOString().slice(0,7)}
async function jsonBody(request){
  try{const text=await request.text();
   if(text.length>12000)throw Error();
   const o=JSON.parse(text);
   if(!o||typeof o!=='object'||Array.isArray(o))throw Error();
   return o;
  }catch{throw Object.assign(Error('A bounded JSON object is required'),{status:400});}
}
async function scalar(db,sql,...args){const row=await db.prepare(sql).bind(...args).first();return Number(Object.values(row||{})[0]||0)}
function requireDb(env){if(!env.DB)throw new Error('D1 missing')}
export async function handle(request,env){
  const origin=request.headers.get('Origin');
  if(origin && origin!==CORS_ORIGIN&&origin!==new URL(request.url).origin)return denied(origin);
  const u=new URL(request.url),path=u.pathname;
  const login=await githubLoginRoute(request,env,{exchange:integratedRoute});if(login)return login;
  const integrated=await integratedRoute(request,env);if(integrated)return integrated;
  const preview=previewRoute(request,env);if(preview)return preview;
  if(path==='/acceptance'&&request.method==='GET')return acceptancePage(env);
  if(path==='/acceptance/native-download.js'&&request.method==='GET')return nativeDownloadModule(env);
  const account=await accountRoute(request,env);if(account)return account;
  const browserSession=await browserSessionRoute(request,env);
  if(browserSession)return browserSession;
  if(request.method==='OPTIONS'){
    if(origin!==CORS_ORIGIN)return denied(origin);
    const h=new Headers({'Access-Control-Allow-Origin':CORS_ORIGIN,'Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'Authorization,Content-Type','Access-Control-Max-Age':'600','Cache-Control':'no-store'});
    return new Response(null,{status:204,headers:h});
  }
  const direct=await transportRoute(request,env);
  if(direct)return nativeDownloadFailure(request,direct);
  const agent=path.startsWith('/agent/');
  if(!tokenIs(request,agent?env.MEDIA_AGENT_TOKEN:env.MEDIA_OWNER_TOKEN))return denied(origin,401,'Authorization required');
  try {
    requireDb(env);
    if(path==='/login-readiness'&&request.method==='GET'&&!agent)return reply(await loginReadiness(env),200,origin);
    if(path==='/health'&&request.method==='GET')
      return reply({ok:true,version:'hybrid-staging-0.1',mode:'outbound-control',storage:'D1 metadata only',streaming:streamingEnabled(env)?'enabled':'not-live'},200,origin);
    if(path==='/quota'&&request.method==='GET'){
      const m=month();
      const row=await env.DB.prepare('SELECT transferred_bytes,reserved_bytes FROM mv_hybrid_transfer_usage WHERE month=?').bind(m).first();
      const delivered=Number(row?.transferred_bytes||0),reserved=Number(row?.reserved_bytes||0);
      return reply({period:m,limit_bytes:transferBudget(env),transferred_bytes:delivered,reserved_bytes:reserved,
        remaining_bytes:Math.max(0,transferBudget(env)-delivered-reserved),
        official_oci_reference_bytes:OCI_REFERENCE_BYTES,official_oci_usage_bytes:null,official_oci_remaining_bytes:null,
        tracking:streamingEnabled(env)?'active':'not_active',kind:'self_imposed_monthly_budget',
        note:streamingEnabled(env)?'Application streaming budget; not provider real-time bandwidth quota':'No provider real-time bandwidth quota; media relay is not enabled'},200,origin);
    }
    if(path==='/jobs'&&request.method==='GET'){
      const result=await env.DB.prepare('SELECT * FROM mv_hybrid_jobs ORDER BY created_at DESC LIMIT 40').all();
      return reply({jobs:(result.results||[]).map(rowFormat)},200,origin);
    }
    if(path==='/jobs'&&request.method==='POST'){
      const o=canonicalJob(await jsonBody(request));
      if(!o||o.kind.startsWith('pikpak'))return denied(origin,400,'Unsupported or invalid download job');
      const count=await scalar(env.DB,"SELECT COUNT(*) AS total FROM mv_hybrid_jobs WHERE status IN ('queued','running','waiting','active')");
      if(count>=5)return denied(origin,429,'Queue full; maximum five pending jobs');
      const id=Array.from(crypto.getRandomValues(new Uint8Array(12))).map(x=>x.toString(16).padStart(2,'0')).join('');
      const now=Date.now();
      const inserted=await env.DB.prepare("INSERT INTO mv_hybrid_jobs(id,kind,request_json,status,created_at,updated_at) SELECT ?,?,?,'queued',?,? WHERE (SELECT COUNT(*) FROM mv_hybrid_jobs WHERE status IN ('queued','running','waiting','active'))<5").bind(id,o.kind,JSON.stringify(o),now,now).run();
      if(!inserted.meta?.changes)return denied(origin,429,'Queue full; maximum five pending jobs');
      return reply({id,status:'queued'},202,origin);
    }
    if(path==='/jobs/files'&&request.method==='GET'){
      const id=u.searchParams.get('id');
      if(!jobIdPattern.test(id||''))return denied(origin,400,'Invalid job ID');
      const job=await env.DB.prepare('SELECT status FROM mv_hybrid_jobs WHERE id=?').bind(id).first();
      if(!job)return denied(origin,404,'Job not found');
      const results=job.status==='complete'?await env.DB.prepare('SELECT relative_path AS path,name,bytes AS size FROM mv_hybrid_files WHERE job_id=?').bind(id).all():{results:[]};
      return reply({files:results.results||[]},200,origin);
    }
    if(path==='/jobs/cancel'&&request.method==='POST'){
      const o=await jsonBody(request);
      if(!jobIdPattern.test(o.id||''))return denied(origin,400,'Invalid job ID');
      const row=await env.DB.prepare('SELECT status,kind,request_json FROM mv_hybrid_jobs WHERE id=?').bind(o.id).first();
      if(!row)return denied(origin,404,'Job not found');
      if(row.status==='cancelled')return reply({ok:true},200,origin);
      if(!active.has(row.status))return denied(origin,409,'Job already finished');
      await env.DB.prepare("UPDATE mv_hybrid_jobs SET status='cancelled',request_json=CASE WHEN kind='pikpak-account' THEN json_remove(request_json,'$.token_cipher') ELSE request_json END,updated_at=? WHERE id=? AND status IN ('queued','running','waiting','active')").bind(Date.now(),o.id).run();
      return reply({ok:true},200,origin);
    }
    if(path==='/resolve'&&request.method==='POST'){
      const o=await jsonBody(request);
      if(!validUrl(o.url,'video'))return denied(origin,400,'Invalid HTTPS video URL');
      return reply({title:'yt-dlp · queued extraction',formats:[{id:'best',label:'最佳可用',format:'auto',note:'Source support is not guaranteed'}]},200,origin);
    }
    if(path==='/agent/job'&&request.method==='GET'){
      const id=u.searchParams.get('id');
      if(!jobIdPattern.test(id||''))return denied(origin,400,'Invalid job ID');
      const row=await env.DB.prepare('SELECT status FROM mv_hybrid_jobs WHERE id=?').bind(id).first();
      if(!row)return denied(origin,404,'Job not found');
      return reply({id,status:row.status},200,origin);
    }
    if(path==='/agent/expire'&&request.method==='POST'){
      const o=await jsonBody(request);
      if(!jobIdPattern.test(o.id||''))return denied(origin,400,'Invalid job ID');
      const now=Date.now();
      // Serialize expiry against both issuance and redemption in D1. A pending
      // or active transfer keeps its source; an expired job cannot issue anew.
      await env.DB.batch([
        env.DB.prepare("UPDATE mv_hybrid_jobs SET status='expired',updated_at=?,lease_until=0,error='Temporary source expired; submit again' WHERE id=? AND status IN ('complete','error','cancelled') AND updated_at<=? AND NOT EXISTS(SELECT 1 FROM mv_hybrid_tickets WHERE job_id=? AND (status='active' OR (status='new' AND expires_at>?)))").bind(now,o.id,now-24*3600000,o.id,now),
        env.DB.prepare("UPDATE mv_hybrid_transfer_usage SET reserved_bytes=MAX(0,reserved_bytes-(SELECT COALESCE(SUM(bytes),0) FROM mv_hybrid_tickets WHERE job_id=? AND month=mv_hybrid_transfer_usage.month AND status='new' AND expires_at<=?)),updated_at=? WHERE EXISTS(SELECT 1 FROM mv_hybrid_jobs WHERE id=? AND status='expired')").bind(o.id,now,now,o.id),
        env.DB.prepare("UPDATE mv_hybrid_tickets SET status='expired' WHERE job_id=? AND status='new' AND expires_at<=? AND EXISTS(SELECT 1 FROM mv_hybrid_jobs WHERE id=? AND status='expired')").bind(o.id,now,o.id),
        env.DB.prepare("DELETE FROM mv_hybrid_files WHERE job_id=? AND EXISTS(SELECT 1 FROM mv_hybrid_jobs WHERE id=? AND status='expired')").bind(o.id,o.id)
      ]);
      const row=await env.DB.prepare('SELECT status,kind,request_json FROM mv_hybrid_jobs WHERE id=?').bind(o.id).first();
      if(!row)return denied(origin,404,'Job not found');
      if(row.status!=='expired')return denied(origin,409,'Source retained: job too recent or transfer outstanding');
      return reply({ok:true,status:'expired'},200,origin);
    }
    if(path==='/agent/lease'&&request.method==='POST'){
      const now=Date.now();
      // Requeue stale worker leases. Agent must make operations idempotent.
      await env.DB.prepare("UPDATE mv_hybrid_jobs SET status='queued',lease_until=0 WHERE status='running' AND lease_until<?").bind(now).run();
      const row=await env.DB.prepare("SELECT * FROM mv_hybrid_jobs WHERE status='queued' ORDER BY created_at LIMIT 1").first();
      if(!row)return reply({job:null},200,origin);
      const result=await env.DB.prepare("UPDATE mv_hybrid_jobs SET status='running',lease_until=?,updated_at=? WHERE id=? AND status='queued'").bind(now+180000,now,row.id).run();
      if(!result.meta?.changes)return reply({job:null},200,origin);
      const spec=JSON.parse(row.request_json);
      // The adapter's established switch is skip_images. Preserve old Owner
      // requests and translate the account's explicit text-only preference.
      if(spec.kind==='novel'&&typeof spec.text_only==='boolean')spec.skip_images=spec.text_only;
      return reply({job:{...spec,id:row.id}},200,origin);
    }
    if(path==='/agent/report'&&request.method==='POST'){
      const o=await jsonBody(request);
      if(!jobIdPattern.test(o.id||'')||!statuses.has(o.status))return denied(origin,400,'Invalid status update');
      if(!['running','complete','error','cancelled'].includes(o.status))return denied(origin,400,'Invalid agent status');
      const done=Number(o.completed||0),total=Number(o.total||0);
      if(!Number.isSafeInteger(done)||!Number.isSafeInteger(total)||done<0||total<0)return denied(origin,400,'Invalid progress bytes');
      const row=await env.DB.prepare('SELECT status,kind,request_json FROM mv_hybrid_jobs WHERE id=?').bind(o.id).first();
      if(!row)return denied(origin,404,'Job not found');
      if(row.status==='cancelled')return denied(origin,409,'Job cancelled');
      if(row.status==='complete'||row.status==='error'||row.status==='expired'){
        if(row.status===o.status)return reply({ok:true,terminal:true},200,origin);
        return denied(origin,409,'Job already finished');
      }
      if(row.status!=='running')return denied(origin,409,'Job has not been leased');
      const files=o.status==='complete'?o.files:[];
      let providerControl=false;
      if(o.status==='complete'&&Array.isArray(files)&&files.length===0){
       const kind=await env.DB.prepare('SELECT kind FROM mv_hybrid_jobs WHERE id=?').bind(o.id).first();
       providerControl=['pikpak-account','pikpak-cleanup'].includes(kind?.kind);
      }
      if(!Array.isArray(files)||files.length>80||(o.status==='complete'&&files.length===0&&!providerControl))return denied(origin,400,'Completed job requires valid files');
      if(files.some(f=>!f||!ticketPath.test(f.path||'')||f.path.split('/').includes('..')||!Number.isSafeInteger(f.size)||f.size<=0||f.size>12*1024**3))return denied(origin,400,'Invalid file metadata');
      const ops=files.map(f=>env.DB.prepare("INSERT OR REPLACE INTO mv_hybrid_files(job_id,relative_path,name,bytes) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM mv_hybrid_jobs WHERE id=? AND status='running')").bind(o.id,f.path,String(f.name||f.path).slice(0,220),f.size,o.id));
      if(row.kind==='pikpak-account'&&o.status!=='running'){const spec=JSON.parse(row.request_json);delete spec.token_cipher;ops.push(env.DB.prepare("UPDATE mv_hybrid_jobs SET request_json=? WHERE id=? AND status='running'").bind(JSON.stringify(spec),o.id));}
      let detail=String(o.title||'').slice(0,180);
      const phases=new Set(['submitting','extracting','downloading','processing','metadata','peers','queued','checking']);
      if(!row.kind.startsWith('pikpak')&&phases.has(o.phase)){
       detail=JSON.stringify({title:detail,phase:o.phase,speed:Number.isSafeInteger(o.speed)&&o.speed>=0?o.speed:0,peers:Number.isSafeInteger(o.peers)&&o.peers>=0&&o.peers<=100000?o.peers:0});
      }
      if(row.kind.startsWith('pikpak')&&o.status==='complete'){
       let data;try{data=JSON.parse(String(o.title||''));}catch{}
       if(data&&row.kind==='pikpak-account')detail=JSON.stringify({id:o.id,label:String(data.label||'PikPak').slice(0,24),ready:data.ready===true,...(data.auth_type==='rclone'?{auth_type:'rclone'}:{})});
       else if(data&&['awaiting-confirmation','purged-quota-released','purged-quota-pending'].includes(data.cleanup)){
        const spec=JSON.parse(row.request_json);
        if(!/^[A-Za-z0-9_-]{1,128}$/.test(data.file_id||''))return denied(origin,400,'Invalid cleanup file ID');
        if(row.kind==='pikpak'&&(!Number.isSafeInteger(data.bytes)||data.bytes<=0||data.bytes>6000000000||typeof data.name!=='string'||data.name.length>220))return denied(origin,400,'Invalid cleanup receipt');
        if(row.kind==='pikpak-cleanup'&&(data.file_id!==spec.file_id||data.source_job!==spec.source_job||data.cleanup==='awaiting-confirmation'))return denied(origin,400,'Cleanup target mismatch');
        detail=JSON.stringify({cleanup:data.cleanup,file_id:data.file_id,...(row.kind==='pikpak'?{bytes:data.bytes,name:data.name}:{source_job:spec.source_job})});
        if(row.kind==='pikpak-cleanup')ops.push(env.DB.prepare("UPDATE mv_hybrid_jobs SET detail=json_set(detail,'$.cleanup',?) WHERE id=? AND kind='pikpak' AND status='complete' AND json_valid(detail) AND json_extract(detail,'$.file_id')=?").bind(data.cleanup,spec.source_job,spec.file_id));
       }
      }
      const sql="UPDATE mv_hybrid_jobs SET status=?,updated_at=?,lease_until=?,completed_bytes=?,total_bytes=?,detail=?,error=? WHERE id=? AND status='running'";
      ops.push(env.DB.prepare(sql).bind(o.status,Date.now(),o.status==='running'?Date.now()+180000:0,done,total,detail,String(o.error||'').slice(0,150),o.id));
      // D1 batch commits file metadata and the terminal status atomically.
      const results=await env.DB.batch(ops);
      if(!results.at(-1)?.meta?.changes)return denied(origin,409,'Job state changed');
      return reply({ok:true},200,origin);
    }
    if(path==='/download-ticket'&&request.method==='POST')
      return denied(origin,503,'Direct-to-computer streaming not yet enabled; no cloud file storage fallback');
    if(path==='/download'&&request.method==='GET')
      return denied(origin,503,'Direct-to-computer streaming not yet enabled');
    return denied(origin,404,'Unknown route');
  }catch(e){
    return denied(origin,e?.status===400?400:500,e?.status===400?'A bounded JSON object is required':'Hybrid service unavailable');
  }
}
export default {fetch:handle};

