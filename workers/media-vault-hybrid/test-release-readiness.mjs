import assert from 'node:assert/strict';
import {releaseBlockers} from './release-readiness.mjs';
const ids=m=>releaseBlockers(m).map(x=>x.id).sort();
const remaining=['final-merge-and-publication','longer-session-persistence','novel-real-ui'];
const erased={pending:[],acceptance_evidence:{
 windows_native:{status:'passed-on-windows-runner',user_device_acceptance:'passed-native-save-offline-validation-and-playback',mp4_playback:'user-confirmed-picture-and-sound-normal'},
 session_restart:{status:'passed-real-browser-process-restart',elapsed_long_term:'not-observed'},
 manga_source:{status:'passed-live-source-and-archive-checks'}
}};
assert.deepEqual(ids(erased),remaining,'Deleting the pending list cannot fabricate acceptance');
const ciOnly=structuredClone(erased);delete ciOnly.acceptance_evidence.windows_native.user_device_acceptance;
assert.ok(ids(ciOnly).includes('windows-native-save'),'Windows CI does not replace own-device acceptance');

// Entirely synthetic records exercise the checker; no actual acceptance is created.
const complete=structuredClone(erased);
complete.acceptance_evidence.novel_real_ui={status:'passed-real-browser',evidence_reference:'synthetic-test-record',scope:{first_two_chapters:true,text_only:true,layouts:['compact','standard','large'],cancel_rebuild:true,job_count:4,device_count:1,streaming:false,tickets:0}};
Object.assign(complete.acceptance_evidence.session_restart,{elapsed_long_term:'passed-real-elapsed-observation',observation:{source:'real-user-device',accepted_by_user:true,evidence_reference:'synthetic-test-record',approved_minimum_ms:24*3600000,started_at:'2026-01-01T00:00:00Z',ended_at:'2026-01-02T00:00:00Z',same_device:true,browser_restart:true,absolute_expiry:true,revocation_denied:true}});
complete.publication_decision={status:'approved',approved_by_user:true,scope:'merge-both-prs-and-production-publication',automatic_deployments_acknowledged:true,evidence_reference:'synthetic-test-record'};
assert.deepEqual(ids(complete),[]);
const manual=structuredClone(complete);manual.pending=[{id:'additional-review',status:'pending'}];
assert.deepEqual(ids(manual),['additional-review'],'Complete records do not erase an explicit remaining gate');
for(const patch of [{status:'passed-local-fixtures'},{scope:{...complete.acceptance_evidence.novel_real_ui.scope,job_count:5}},{scope:{...complete.acceptance_evidence.novel_real_ui.scope,tickets:1}}]){
 const m=structuredClone(complete);Object.assign(m.acceptance_evidence.novel_real_ui,patch);assert.ok(ids(m).includes('novel-real-ui'));
}
for(const patch of [{ended_at:'2026-01-01T01:00:00Z'},{ended_at:'2025-12-31T00:00:00Z'},{source:'clock-controlled-fixture'},{accepted_by_user:false},{revocation_denied:false}]){
 const m=structuredClone(complete);Object.assign(m.acceptance_evidence.session_restart.observation,patch);assert.ok(ids(m).includes('longer-session-persistence'));
}
const deferred=structuredClone(erased);
Object.assign(deferred.acceptance_evidence.session_restart,{
 elapsed_long_term:'not-completed-user-deferred',
 release_requirement:{status:'deferred-by-user',approved_by_user:true,scope:'longer-session-persistence-only',evidence_reference:'synthetic-user-scope-change',reason:'User does not require cross-day login for this release'}
});
assert.deepEqual(ids(deferred),['final-merge-and-publication','novel-real-ui'],'Deferral removes only the specifically authorized gate');
for(const patch of [{approved_by_user:false},{scope:'all-acceptance'},{evidence_reference:''},{reason:''},{status:'passed'}]){
 const m=structuredClone(deferred);Object.assign(m.acceptance_evidence.session_restart.release_requirement,patch);assert.ok(ids(m).includes('longer-session-persistence'));
}
for(const patch of [{elapsed_long_term:'passed-real-elapsed-observation'},{observation:{source:'real-user-device'}}]){
 const m=structuredClone(deferred);Object.assign(m.acceptance_evidence.session_restart,patch);assert.ok(ids(m).includes('longer-session-persistence'),'Deferral cannot be mislabeled as actual observation');
}
for(const patch of [{automatic_deployments_acknowledged:false},{scope:'merge-only'},{approved_by_user:false}]){
 const m=structuredClone(complete);Object.assign(m.publication_decision,patch);assert.ok(ids(m).includes('final-merge-and-publication'));
}
const limited=structuredClone(complete);
limited.release_mode='default-off-with-known-ui-limitations';
limited.publication_decision.known_limitations=['novel-catalog-and-three-previews'];
Object.assign(limited.acceptance_evidence.novel_real_ui,{
 status:'tasks-and-logout-passed-previews-unverified',catalog_preview_confirmation:'not-individually-confirmed-by-user',
 task_result_summary:{cancelled_compact:1,completed_compact_rebuild:1,completed_standard:1,completed_large:1,file_count:3,session_revoked_before_admin_close:true,download_tickets:0,transfer_delta_bytes:0},
 release_requirement:{status:'known-limitation-for-default-off-publication',scope:'catalog-and-three-preview-presets-only',user_directed_publication:true,evidence_reference:'synthetic-release-direction-after-disclosure',reason:'Publish disabled integration with actual preview results still unverified'}
});
limited.acceptance_evidence.session_restart=structuredClone(deferred.acceptance_evidence.session_restart);
assert.deepEqual(ids(limited),[],'Disclosed default-off publication is not a fabricated UI or elapsed-time pass');
for(const change of [m=>delete m.release_mode,m=>m.publication_decision.known_limitations=[],m=>m.publication_decision.approved_by_user=false,m=>m.acceptance_evidence.novel_real_ui.scope.tickets=1,m=>m.acceptance_evidence.novel_real_ui.task_result_summary.completed_standard=0,m=>m.acceptance_evidence.novel_real_ui.release_requirement.user_directed_publication=false,m=>m.acceptance_evidence.novel_real_ui.release_requirement.evidence_reference='',m=>m.acceptance_evidence.novel_real_ui.catalog_preview_confirmation='passed',m=>delete m.acceptance_evidence.windows_native.user_device_acceptance,m=>m.acceptance_evidence.manga_source.status='pending']){
 const m=structuredClone(limited);change(m);assert.ok(ids(m).length>0,'Known UI limitation cannot silently grant another scope or remove required evidence');
}
console.log('PASS release evidence: disclosed default-off publication and narrow elapsed deferral retain unverified results; missing task/save/source/decision evidence, extra scope and fabricated passes stay blocked');
