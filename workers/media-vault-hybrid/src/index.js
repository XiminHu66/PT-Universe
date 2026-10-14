// Control plane only; stores tasks, metadata and REAL transfer ledger in D1.
// All media bytes will use a separate, not-yet-enabled live streaming channel.
// No R2, KV media storage, GitHub artifact uploads or arbitrary fetch/proxy.
import {transportRoute} from './transport.js';
export {MediaRelay} from './relay.js';
const CORS_ORIGIN='https://ximinhu66.github.io';
const BUDGET_BYTES=10*1024*1024*1024; // app-defined monthly safety budget; NOT provider allowance
const active=new Set(['queued','running','waiting','active']);
const statuses=new Set(['queued','running','waiting','active','complete','error','cancelled']);
const kinds=new Set(['novel','manga','torrent','video']);
const jobIdPattern=/^[0-9a-f]{24}$/;
const ticketPath=/^(?:aria|video|generated)\/[a-zA-Z0-9][a-zA-Z0-9._/ -]{0,220}$/;

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
function validUrl(raw,kind){
  if(typeof raw!=='string'||raw.length>2048)return false;
  if(kind==='torrent'&&/^magnet:\?xt=urn:btih:[a-f0-9]{40}(?:&[^#\r\n]*)?$/i.test(raw))return true;
  try {
    const u=new URL(raw);
    if(u.username||u.password||u.port||u.protocol!=='https:'||!u.hostname.includes('.'))return false;
    if(/^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2[0-9]|3[01])\.)/i.test(u.hostname))return false;
    if(kind==='novel'&&!['www.wenku8.net','wenku8.net','www.bilinovel.com','www.bilinovel.net','www.linovelib.com','w.linovelib.com'].includes(u.hostname))return false;
    return true;
  }catch{return false}
}
async function jsonBody(request){
  const text=await request.text();
  if(text.length>12000)throw new Error('Request too large');
  const o=JSON.parse(text);
  if(!o||typeof o!=='object'||Array.isArray(o))throw new Error('JSON object required');
  return o;
}
function permittedJob(o){
  if(!kinds.has(o.kind))return false;
  if(o.kind==='manga')return typeof o.title==='string'&&o.title.length<200&&Array.isArray(o.files)&&o.files.length>0&&o.files.length<=20&&o.files.every(x=>typeof x==='string'&&/^File:[^<>#\r\n]{2,190}\.(png|jpe?g|gif|webp)$/i.test(x));
  if(!validUrl(o.url,o.kind))return false;
  if(o.kind==='novel'&&!(Array.isArray(o.indices)&&o.indices.length>0&&o.indices.length<=100&&o.indices.every(i=>Number.isSafeInteger(i)&&i>=0&&i<=100000)))return false;
  return true;
}
async function scalar(db,sql,...args){const row=await db.prepare(sql).bind(...args).first();return Number(Object.values(row||{})[0]||0)}
function rowFormat(row){return {id:row.id,kind:row.kind,url:JSON.parse(row.request_json).url||'',title:row.detail||row.kind,status:row.status,completed:row.completed_bytes,total:row.total_bytes,speed:0,error:row.error||'',created:row.created_at}}
function requireDb(env){if(!env.DB)throw new Error('D1 missing')}
export async function handle(request,env){
  const origin=request.headers.get('Origin');
  if(origin && origin!==CORS_ORIGIN)return denied(origin);
  const u=new URL(request.url),path=u.pathname;
  if(request.method==='OPTIONS'){
    if(origin!==CORS_ORIGIN)return denied(origin);
    const h=new Headers({'Access-Control-Allow-Origin':CORS_ORIGIN,'Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'Authorization,Content-Type','Access-Control-Max-Age':'600','Cache-Control':'no-store'});
    return new Response(null,{status:204,headers:h});
  }
  const direct=await transportRoute(request,env);
  if(direct)return direct;
  const agent=path.startsWith('/agent/');
  if(!tokenIs(request,agent?env.MEDIA_AGENT_TOKEN:env.MEDIA_OWNER_TOKEN))return denied(origin,401,'Authorization required');
  try {
    requireDb(env);
    if(path==='/health'&&request.method==='GET')
      return reply({ok:true,version:'hybrid-staging-0.1',mode:'outbound-control',storage:'D1 metadata only',streaming:env.ENABLE_DIRECT_STREAM==='true'&&!!env.RELAY?'enabled':'not-live'},200,origin);
    if(path==='/quota'&&request.method==='GET'){
      const m=month();
      const row=await env.DB.prepare('SELECT transferred_bytes,reserved_bytes FROM mv_hybrid_transfer_usage WHERE month=?').bind(m).first();
      const delivered=Number(row?.transferred_bytes||0),reserved=Number(row?.reserved_bytes||0);
      return reply({period:m,limit_bytes:BUDGET_BYTES,transferred_bytes:delivered,reserved_bytes:reserved,
        remaining_bytes:Math.max(0,BUDGET_BYTES-delivered-reserved),
        tracking:env.ENABLE_DIRECT_STREAM==='true'&&!!env.RELAY?'active':'not_active',kind:'self_imposed_monthly_budget',
        note:'No provider real-time bandwidth quota; media relay is not yet enabled'},200,origin);
    }
    if(path==='/jobs'&&request.method==='GET'){
      const result=await env.DB.prepare('SELECT * FROM mv_hybrid_jobs ORDER BY created_at DESC LIMIT 40').all();
      return reply({jobs:(result.results||[]).map(rowFormat)},200,origin);
    }
    if(path==='/jobs'&&request.method==='POST'){
      const o=await jsonBody(request);
      if(!permittedJob(o))return denied(origin,400,'Unsupported or invalid download job');
      const count=await scalar(env.DB,"SELECT COUNT(*) AS total FROM mv_hybrid_jobs WHERE status IN ('queued','running','waiting','active')");
      if(count>=5)return denied(origin,429,'Queue full; maximum five pending jobs');
      const id=Array.from(crypto.getRandomValues(new Uint8Array(12))).map(x=>x.toString(16).padStart(2,'0')).join('');
      const now=Date.now();
      await env.DB.prepare("INSERT INTO mv_hybrid_jobs(id,kind,request_json,status,created_at,updated_at) VALUES(?,?,?,'queued',?,?)").bind(id,o.kind,JSON.stringify(o),now,now).run();
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
      await env.DB.prepare("UPDATE mv_hybrid_jobs SET status='cancelled',updated_at=? WHERE id=? AND status IN ('queued','running','waiting','active')").bind(Date.now(),o.id).run();
      return reply({ok:true},200,origin);
    }
    if(path==='/resolve'&&request.method==='POST'){
      const o=await jsonBody(request);
      if(!validUrl(o.url,'video'))return denied(origin,400,'Invalid HTTPS video URL');
      return reply({title:'yt-dlp · queued extraction',formats:[{id:'best',label:'最佳可用',format:'auto',note:'Source support is not guaranteed'}]},200,origin);
    }
    if(path==='/agent/lease'&&request.method==='POST'){
      const now=Date.now();
      // Requeue stale worker leases. Agent must make operations idempotent.
      await env.DB.prepare("UPDATE mv_hybrid_jobs SET status='queued',lease_until=0 WHERE status='running' AND lease_until<?").bind(now).run();
      const row=await env.DB.prepare("SELECT * FROM mv_hybrid_jobs WHERE status='queued' ORDER BY created_at LIMIT 1").first();
      if(!row)return reply({job:null},200,origin);
      const result=await env.DB.prepare("UPDATE mv_hybrid_jobs SET status='running',lease_until=?,updated_at=? WHERE id=? AND status='queued'").bind(now+180000,now,row.id).run();
      if(!result.meta?.changes)return reply({job:null},200,origin);
      return reply({job:{id:row.id,...JSON.parse(row.request_json)}},200,origin);
    }
    if(path==='/agent/report'&&request.method==='POST'){
      const o=await jsonBody(request);
      if(!jobIdPattern.test(o.id||'')||!statuses.has(o.status))return denied(origin,400,'Invalid status update');
      if(!['running','complete','error','cancelled'].includes(o.status))return denied(origin,400,'Invalid agent status');
      const done=Number(o.completed||0),total=Number(o.total||0);
      if(!Number.isSafeInteger(done)||!Number.isSafeInteger(total)||done<0||total<0)return denied(origin,400,'Invalid progress bytes');
      const row=await env.DB.prepare('SELECT status FROM mv_hybrid_jobs WHERE id=?').bind(o.id).first();
      if(!row)return denied(origin,404,'Job not found');
      if(row.status==='cancelled')return denied(origin,409,'Job cancelled');
      const sql="UPDATE mv_hybrid_jobs SET status=?,updated_at=?,lease_until=?,completed_bytes=?,total_bytes=?,detail=?,error=? WHERE id=?";
      await env.DB.prepare(sql).bind(o.status,Date.now(),o.status==='running'?Date.now()+180000:0,done,total,String(o.title||'').slice(0,180),String(o.error||'').slice(0,150),o.id).run();
      if(o.status==='complete'&&Array.isArray(o.files)){
        if(o.files.length>80)return denied(origin,400,'Too many files');
        for(const f of o.files){
          if(!ticketPath.test(f.path||'')||!Number.isSafeInteger(f.size)||f.size<=0||f.size>12*1024**3)continue;
          await env.DB.prepare('INSERT OR REPLACE INTO mv_hybrid_files(job_id,relative_path,name,bytes) VALUES(?,?,?,?)').bind(o.id,f.path,String(f.name||f.path).slice(0,220),f.size).run();
        }
      }
      return reply({ok:true},200,origin);
    }
    if(path==='/download-ticket'&&request.method==='POST')
      return denied(origin,503,'Direct-to-computer streaming not yet enabled; no cloud file storage fallback');
    if(path==='/download'&&request.method==='GET')
      return denied(origin,503,'Direct-to-computer streaming not yet enabled');
    return denied(origin,404,'Unknown route');
  }catch(e){
    return denied(origin,500,'Hybrid service unavailable: '+String(e?.message||e).slice(0,140));
  }
}
export default {fetch:handle};
