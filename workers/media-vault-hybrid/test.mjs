import assert from 'node:assert/strict';
import {handle} from './src/index.js';
const db={jobs:[],files:[],usage:{transferred_bytes:0,reserved_bytes:0}};
const binds=[];
function statement(sql,args){
 const S=sql.replace(/\s+/g,' ').trim();
 return {
 async first(){
   if(S.startsWith('SELECT transferred_bytes'))return null;
   if(S.startsWith('SELECT COUNT(*)'))return {total:db.jobs.filter(x=>['queued','running'].includes(x.status)).length};
   if(S.startsWith('SELECT * FROM mv_hybrid_jobs WHERE status='))return db.jobs.find(x=>x.status==='queued')||null;
   if(S.startsWith('SELECT status FROM mv_hybrid_jobs WHERE id=')){let j=db.jobs.find(x=>x.id===args[0]);return j?{status:j.status}:null;}
   return null;
 },
 async all(){
   if(S.startsWith('SELECT * FROM mv_hybrid_jobs ORDER BY'))return {results:[...db.jobs].reverse()};
   if(S.startsWith('SELECT relative_path AS path'))return {results:db.files.filter(x=>x.job_id===args[0]).map(x=>({path:x.relative_path,name:x.name,size:x.bytes}))};
   return {results:[]};
 },
 async run(){
   if(S.startsWith('INSERT INTO mv_hybrid_jobs(')){db.jobs.push({id:args[0],kind:args[1],request_json:args[2],status:'queued',created_at:args[3],updated_at:args[4],lease_until:0,completed_bytes:0,total_bytes:0,error:'',detail:''});return {meta:{changes:1}}}
   if(S.startsWith('UPDATE mv_hybrid_jobs SET status=')){
     if(S.includes('lease_until=?')&&S.includes("status='queued'")){const j=db.jobs.find(x=>x.id===args[2]&&x.status==='queued');if(j){j.status='running';j.lease_until=args[0];return{meta:{changes:1}}}return{meta:{changes:0}}}
     if(S.includes("SET status='cancelled'")){const j=db.jobs.find(x=>x.id===args[1]);if(j)j.status='cancelled';return{meta:{changes:1}}}
     if(S.includes("SET status='queued'"))return {meta:{changes:0}};
     const j=db.jobs.find(x=>x.id===args[7]);if(j)Object.assign(j,{status:args[0],updated_at:args[1],lease_until:args[2],completed_bytes:args[3],total_bytes:args[4],detail:args[5],error:args[6]});return {meta:{changes:1}};
   }
   if(S.startsWith('INSERT OR REPLACE INTO mv_hybrid_files')){db.files.push({job_id:args[0],relative_path:args[1],name:args[2],bytes:args[3]});return{meta:{changes:1}}}
   return {meta:{changes:0}};
 } 
 }
}
const env={MEDIA_OWNER_TOKEN:'a'.repeat(64),MEDIA_AGENT_TOKEN:'b'.repeat(64),DB:{prepare(sql){return{bind(...args){return statement(sql,args)}}}}};
const base='https://pt-media-hybrid.example.workers.dev';
async function req(path,opts={},environment=env){return handle(new Request(base+path,opts),environment)}
function auth(token=env.MEDIA_OWNER_TOKEN){return {'Authorization':'Bearer '+token, 'Origin':'https://ximinhu66.github.io'}}
async function result(res){return {status:res.status,body:await res.json()}}
let r=await result(await req('/quota'));assert.equal(r.status,401);
r=await result(await req('/quota',{headers:auth()}));
assert.equal(r.status,200);assert.equal(r.body.tracking,'not_active');assert.equal(r.body.transferred_bytes,0);assert.equal(r.body.remaining_bytes,r.body.limit_bytes);assert.equal(r.body.kind,'self_imposed_monthly_budget');
r=await result(await req('/jobs',{method:'POST',headers:{...auth(),'Content-Type':'application/json'},body:JSON.stringify({kind:'novel',url:'https://www.wenku8.net/book/3551.htm',indices:[0]})}));
assert.equal(r.status,202);const id=r.body.id;assert.match(id,/^[0-9a-f]{24}$/);
r=await result(await req('/jobs',{headers:auth()}));assert.equal(r.body.jobs.length,1);
r=await result(await req('/agent/lease',{method:'POST',headers:{...auth(), 'Content-Type':'application/json'},body:'{}'}));assert.equal(r.status,401,'owner token must not grant agent access');
r=await result(await req('/agent/lease',{method:'POST',headers:{...auth(env.MEDIA_AGENT_TOKEN),'Content-Type':'application/json'},body:'{}'}));
assert.equal(r.status,200);assert.equal(r.body.job.id,id);
r=await result(await req('/agent/report',{method:'POST',headers:{...auth(env.MEDIA_AGENT_TOKEN),'Content-Type':'application/json'},body:JSON.stringify({id,status:'complete',completed:14240,total:14240,title:'测试小说',files:[{path:'generated/'+id+'.epub',name:id+'.epub',size:14240}]})}));
assert.equal(r.status,200);
r=await result(await req('/jobs/files?id='+id,{headers:auth()}));assert.equal(r.body.files[0].size,14240);
r=await result(await req('/download-ticket',{method:'POST',headers:{...auth(),'Content-Type':'application/json'},body:'{}'}));assert.equal(r.status,503,'no streaming fallback to cloud storage allowed');
r=await result(await req('/jobs',{method:'POST',headers:{...auth(),'Content-Type':'application/json'},body:JSON.stringify({kind:'video',url:'https://127.0.0.1/internal'})}));assert.equal(r.status,400);
r=await result(await req('/jobs',{headers:{...auth(),Origin:'https://evil.example'}}));assert.equal(r.status,403);
r=await req('/jobs',{method:'OPTIONS',headers:{Origin:'https://ximinhu66.github.io'}});
assert.equal(r.status,204);
console.log('PASS owner/agent token isolation, job enqueue/lease/report, file metadata, quota-not-yet-active, no cloud file transfer fallback, CORS and URL validation');
