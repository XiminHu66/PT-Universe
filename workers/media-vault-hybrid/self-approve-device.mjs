// Runs only after the repository owner submits their own explicit GitHub form.
// No browser secret, pairing code or service key is exposed to the issue or UI.
import assert from 'node:assert/strict';
import {readFile,appendFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {APPROVAL_REPOSITORY,APPROVAL_OWNER,APPROVAL_OWNER_ID,APPROVAL_PREFIX,approvalBody} from '../../apps/media-vault/device-approval.js';
const base='https://pt-media-hybrid.summer07-nanjolno.workers.dev';
export function validateSelfApproval(event,context,now=Date.now()){
 const person=value=>value?.id===APPROVAL_OWNER_ID&&value.login===APPROVAL_OWNER&&value.type==='User';
 assert.equal(context.eventName,'issues');assert.equal(context.repository,APPROVAL_REPOSITORY);assert.equal(context.actor,APPROVAL_OWNER);
 assert.equal(event.action,'opened');assert.equal(event.repository?.full_name,APPROVAL_REPOSITORY);assert.ok(person(event.repository?.owner));assert.ok(person(event.sender));
 const issue=event.issue;assert.ok(issue&&!issue.pull_request&&issue.state==='open'&&person(issue.user));assert.ok(Number.isSafeInteger(issue.number)&&issue.number>0);
 const created=Date.parse(issue.created_at);assert.ok(Number.isFinite(created)&&created<=now+30000&&created>now-5*60000,'确认请求已过期，请返回 Media Vault 重新连接。');
 assert.ok(typeof issue.title==='string'&&issue.title.startsWith(APPROVAL_PREFIX));const id=issue.title.slice(APPROVAL_PREFIX.length);assert.match(id,/^[a-f0-9]{24}$/);
 const body=String(issue.body||'').replaceAll('\r\n','\n').trim();
 const remember=body===approvalBody(id,true);assert.ok(remember||body===approvalBody(id,false),'请保留页面自动填写的设备及权限信息。');
 return {id,remember,issue:issue.number};
}
export async function approveSelfDevice(event,context,secrets,request=fetch,now=Date.now()){
 const selected=validateSelfApproval(event,context,now);
 assert.ok(secrets.owner?.length>=32&&secrets.d1&&secrets.account&&secrets.github,'Configured server-side approval secrets required');
 async function lookup(){
  const r=await request('https://api.cloudflare.com/client/v4/accounts/'+encodeURIComponent(secrets.account)+'/d1/database/86805c79-d903-46cd-b0e2-c079c1a7fc1a/query',{method:'POST',headers:{Authorization:'Bearer '+secrets.d1,'Content-Type':'application/json'},body:JSON.stringify({sql:"SELECT pair_code,status FROM mv_hybrid_app_sessions WHERE id=? AND account_id=? AND status IN ('pending','approved') AND expires_at>? AND pair_code NOT LIKE 'vault:%'",params:[selected.id,'media-vault-personal',now]}),redirect:'error',signal:AbortSignal.timeout(20000)});
  const d=await r.json();assert.ok(r.ok&&d.success===true&&d.result?.length===1&&d.result[0].success!==false,'设备状态暂不可读取，请稍后重试。');const rows=d.result[0].results;assert.equal(rows?.length,1,'设备请求已过期或已取消，请返回 Media Vault 重新连接。');assert.match(rows[0].pair_code,/^[a-f0-9]{32}$/);return rows[0];
 }
 const row=await lookup();let approved=false;
 if(row.status==='pending'){
  const r=await request(base+'/app-auth/approve',{method:'POST',headers:{Authorization:'Bearer '+secrets.owner,'Content-Type':'application/json'},body:JSON.stringify({code:row.pair_code}),redirect:'error',signal:AbortSignal.timeout(20000)});
  assert.equal(r.status,200,'设备确认未完成：请求可能已过期，或已达到设备数量上限。');const d=await r.json();
  assert.equal(d.ok,true);assert.equal(d.session_id,selected.id);assert.equal(d.scope,'personal-vps-downloads');assert.equal(d.job_limit,200);assert.equal(d.ticket_limit,100);assert.ok(d.expires_at>now&&d.expires_at<=now+7*86400000);approved=true;
 }
 // Only the known confirmation issue is closed; never comments or other issues.
 const closed=await request('https://api.github.com/repos/'+APPROVAL_REPOSITORY+'/issues/'+selected.issue,{method:'PATCH',headers:{Authorization:'Bearer '+secrets.github,'Content-Type':'application/json',Accept:'application/vnd.github+json','User-Agent':'MediaVaultDeviceConfirmation'},body:JSON.stringify({state:'closed',state_reason:'completed'}),redirect:'error',signal:AbortSignal.timeout(15000)});
 assert.equal(closed.status,200,'设备已确认；确认单暂未自动关闭，可直接返回 Media Vault。');
 return {session_id:selected.id,remember:selected.remember,approved,issue_closed:true};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 assert.equal(process.env.GITHUB_EVENT_NAME,'issues');const raw=await readFile(process.env.GITHUB_EVENT_PATH,'utf8');assert.ok(raw.length<=512000);
 const result=await approveSelfDevice(JSON.parse(raw),{eventName:process.env.GITHUB_EVENT_NAME,repository:process.env.GITHUB_REPOSITORY,actor:process.env.GITHUB_ACTOR},{owner:process.env.OWNER,d1:process.env.D1_TOKEN,account:process.env.CLOUDFLARE_ACCOUNT_ID,github:process.env.GITHUB_TOKEN});
 console.log('PASS GitHub owner self-confirmation; only the requested device approved; confirmation issue closed; no key exported');
 if(process.env.GITHUB_STEP_SUMMARY)await appendFile(process.env.GITHUB_STEP_SUMMARY,`## 设备确认已完成\n\n请返回 Media Vault；连接窗口会自动关闭，本页即可开始下载。\n\n设备编号：${result.session_id}\n\n${result.remember?'已选择记住设备 30 天。':'已选择本次连接，最长 24 小时。'}\n`);
}
