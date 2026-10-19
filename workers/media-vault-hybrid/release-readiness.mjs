// Evidence consistency checks, not a substitute for actual user observation or approval.
const reference=value=>typeof value==='string'&&value.trim().length>0;
function novelPassed(value){
 const s=value?.scope;
 return value?.status==='passed-real-browser'&&reference(value.evidence_reference)&&
  s?.first_two_chapters===true&&s.text_only===true&&s.cancel_rebuild===true&&
  ['compact','standard','large'].every(layout=>s.layouts?.includes(layout))&&
  Number.isInteger(s.job_count)&&s.job_count>=3&&s.job_count<=4&&s.device_count===1&&
  s.streaming===false&&s.tickets===0;
}
function elapsedPassed(value){
 const o=value?.observation,start=Date.parse(o?.started_at),end=Date.parse(o?.ended_at);
 return value?.elapsed_long_term==='passed-real-elapsed-observation'&&
  o?.source==='real-user-device'&&o.accepted_by_user===true&&reference(o.evidence_reference)&&
  Number.isSafeInteger(o.approved_minimum_ms)&&o.approved_minimum_ms>0&&
  Number.isFinite(start)&&Number.isFinite(end)&&end>start&&end-start>=o.approved_minimum_ms&&
  o.same_device===true&&o.browser_restart===true&&o.absolute_expiry===true&&o.revocation_denied===true;
}
// A user-approved scope change is a deferral, never evidence that 24h elapsed.
// It applies only to this gate; novel, native-save and publication checks remain.
function elapsedDeferred(value){
 const d=value?.release_requirement;
 return value?.elapsed_long_term==='not-completed-user-deferred'&&
  value.observation===undefined&&d?.status==='deferred-by-user'&&
  d.approved_by_user===true&&d.scope==='longer-session-persistence-only'&&
  reference(d.evidence_reference)&&reference(d.reason);
}
export function releaseBlockers(manifest){
 const blockers=new Map();
 for(const gate of manifest.pending||[])blockers.set(gate.id,gate.status);
 const evidence=manifest.acceptance_evidence||{};
 const missing=(id,reason)=>{if(!blockers.has(id))blockers.set(id,reason);};
 if(!novelPassed(evidence.novel_real_ui))missing('novel-real-ui','real browser scope and evidence required');
 const windows=evidence.windows_native;
 if(windows?.user_device_acceptance!=='passed-native-save-offline-validation-and-playback'||
    windows.mp4_playback!=='user-confirmed-picture-and-sound-normal')
  missing('windows-native-save','user-device save, offline verification and playback required');
 if(!elapsedPassed(evidence.session_restart)&&!elapsedDeferred(evidence.session_restart))
  missing('longer-session-persistence','actual elapsed device observations or explicit user-approved deferral required');
 if(evidence.manga_source?.status!=='passed-live-source-and-archive-checks')
  missing('manga-source','live source and archive evidence required');
 const decision=manifest.publication_decision;
 if(decision?.status!=='approved'||decision.approved_by_user!==true||
    decision.scope!=='merge-both-prs-and-production-publication'||
    decision.automatic_deployments_acknowledged!==true||!reference(decision.evidence_reference))
  missing('final-merge-and-publication','explicit user decision covering merge and automatic production deployments required');
 return [...blockers].map(([id,status])=>({id,status}));
}
