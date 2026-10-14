import assert from 'node:assert/strict';
const base='https://pt-media-hybrid.summer07-nanjolno.workers.dev';
async function call(route,token=process.env.OWNER,method='GET',body){const r=await fetch(base+route,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});return {status:r.status,data:await r.json()}}
// Each bundle must agree. Checking health alone can see a new deployment while
// the following role probe still reaches the previous OFF version at another edge.
let consecutive=0,last;
for(let i=0;i<15;i++){
 const health=await call('/health'),quota=await call('/quota'),ticket=await call('/download-ticket',process.env.AGENT,'POST',{id:'0'.repeat(24),path:'generated/test.epub'}),agent=await call('/agent/ws',process.env.OWNER);
 last={health:health.status,streaming:health.data.streaming,quota:quota.status,tracking:quota.data.tracking,wrong_ticket_role:ticket.status,wrong_agent_role:agent.status};
 const ready=health.status===200&&health.data.streaming==='enabled'&&quota.status===200&&quota.data.tracking==='active'&&ticket.status===401&&agent.status===401;
 consecutive=ready?consecutive+1:0;if(consecutive===2)break;
 await new Promise(resolve=>setTimeout(resolve,2000));
}
assert.equal(consecutive,2,'Temporary gate did not stabilize: '+JSON.stringify(last));
console.log('PASS temporary stream gate active in two complete consecutive bundles; owner/agent role isolation preserved');
