// Read-only eligibility for exactly one additional user-device acceptance round.
import assert from 'node:assert/strict';
export function validateDeviceFileHistory(history,files,expected,now){
 assert.ok(Number.isSafeInteger(now)&&now>0);
 assert.equal(history.length,3,'Expected exactly the original three tickets; do not reopen after another round');
 assert.equal(files.length,3);assert.equal(expected.length,3);
 for(const f of files){
  assert.equal(f.size,expected.find(e=>e.id===f.id)?.bytes,'Retained size changed; do not substitute media');
  const matches=history.filter(t=>t.job_id===f.id&&t.relative_path===f.path&&t.bytes===f.size);
  assert.equal(matches.length,1,'History must contain exactly one original ticket per selected file');
  const t=matches[0];assert.equal(t.status,'complete','Original transfer must be complete, not active or ambiguous');
  assert.ok(Number.isSafeInteger(t.expires_at)&&t.expires_at<now,'Prior ticket deadline must have passed');
  assert.ok(t.session_status==='revoked'||Number.isSafeInteger(t.session_expires_at)&&t.session_expires_at<now,'Prior session must be closed or expired');
 }
}

// One explicit recovery round after the actual failed user attempt. Historical
// tickets/bytes stay intact; this guard refuses any fourth round or completed
// user-file transfer. No grants or DB writes occur here.
export function validateDeviceRecoveryHistory(history,files,expected,now){
 assert.ok(history.length>=4&&history.length<=6,'Expected original three plus one failed user attempt only');
 const original=history.filter(t=>t.status==='complete');
 validateDeviceFileHistory(original,files,expected,now);
 const failed=history.filter(t=>t.status!=='complete');
 assert.ok(failed.length>=1&&failed.length<=3);
 const seen=new Set();
 for(const t of failed){
  const f=files.find(f=>f.id===t.job_id&&f.path===t.relative_path&&f.size===t.bytes);
  assert.ok(f&&!seen.has(f.id),'Recovery history must match distinct selected files');seen.add(f.id);
  assert.ok(['failed','expired'].includes(t.status),'Active or ambiguous transfer forbids recovery');
  assert.ok(Number.isSafeInteger(t.expires_at)&&t.expires_at<now);
  assert.ok(t.session_status==='revoked'||Number.isSafeInteger(t.session_expires_at)&&t.session_expires_at<now);
 }
}
