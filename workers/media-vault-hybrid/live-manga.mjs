// One fixed source job. Existing Owner auth only; never opens account/stream gates.
import assert from 'node:assert/strict';
const base='https://pt-media-hybrid.summer07-nanjolno.workers.dev',headers={Authorization:'Bearer '+process.env.OWNER,Origin:'https://ximinhu66.github.io'};
assert.ok((process.env.OWNER||'').length>=32);
async function request(path,body){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{...headers,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)});assert.ok(r.ok,'Metadata request HTTP '+r.status);return r.json();}
const before=await request('/quota');assert.equal(before.tracking,'not_active');assert.equal(before.reserved_bytes,0);
const spec={kind:'manga',provider:'mangadex',title:'肥猪千金开始逆袭 第3.1话 · 中文来源验收',url:'https://mangadex.org/chapter/bd38fb72-e77f-40e9-abbf-21f53571f0be',max_bytes:10*1024**2,max_pages:20};
const created=await request('/jobs',spec);assert.match(created.id,/^[a-f0-9]{24}$/);console.log('MANGA_PROOF_JOB_ID='+created.id);
const deadline=Date.now()+6*60000;let job;
while(Date.now()<deadline){const listing=await request('/jobs');job=listing.jobs.find(x=>x.id===created.id);assert.ok(job,'Exact source task not found');if(['complete','error','cancelled','expired'].includes(job.status))break;await new Promise(r=>setTimeout(r,5000));}
assert.equal(job.status,'complete','Chinese source task did not complete: '+String(job.error||job.status));
const data=await request('/jobs/files?id='+created.id);assert.equal(data.files.length,1);assert.ok(data.files[0].name.endsWith('.cbz'));assert.ok(data.files[0].size>0&&data.files[0].size<=10*1024**2);
const after=await request('/quota');assert.equal(after.tracking,'not_active');assert.equal(after.transferred_bytes,before.transferred_bytes);assert.equal(after.reserved_bytes,0);
console.log('PASS actual Chinese source Worker -> Agent -> adapter -> complete CBZ file metadata; one chapter, <=20 pages/10 MiB, no ticket or media relay, unchanged ledger. VPS archive/image proof is separate.');
