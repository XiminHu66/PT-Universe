import assert from 'node:assert/strict';
import {validateDeviceFileHistory,validateDeviceRecoveryHistory} from './device-file-history.mjs';
const now=10000,files=[0,1,2].map(i=>({id:String(i),path:'generated/'+i,size:i+1})),expected=files.map(f=>({id:f.id,bytes:f.size}));
const history=files.map(f=>({job_id:f.id,relative_path:f.path,bytes:f.size,status:'complete',expires_at:1000,session_status:'revoked',session_expires_at:2000}));
validateDeviceFileHistory(history,files,expected,now);
for(const change of [
 h=>h.pop(),h=>h.push({...h[0]}),h=>h.push(...h.map(x=>({...x}))),
 h=>h[0].status='active',h=>h[0].status='failed',h=>h[0].expires_at=now,
 h=>h[0].expires_at='1000',h=>h[0].relative_path='other',h=>h[0].bytes++,
 h=>{h[0].session_status='approved';h[0].session_expires_at=now+1000;},
 h=>h[0].job_id=h[1].job_id
]){const h=structuredClone(history);change(h);assert.throws(()=>validateDeviceFileHistory(h,files,expected,now));}
assert.throws(()=>validateDeviceFileHistory(history,files,expected.map(x=>({...x,bytes:99})),now));
console.log('PASS device-round eligibility: exact completed prior three only, expired/closed credentials, immutable expected sizes; active/ambiguous/extra rounds rejected');

const failed=history.map(t=>({...t,status:'failed'}));
validateDeviceRecoveryHistory([...history,failed[0]],files,expected,now);
validateDeviceRecoveryHistory([...history,...failed],files,expected,now);
for(const h of [[...history,...failed,failed[0]],[...history,{...failed[0],status:'active'}],[...history,{...failed[0],expires_at:now+1}],[...history,{...failed[0],relative_path:'wrong'}],[...history,failed[0],failed[0]]])assert.throws(()=>validateDeviceRecoveryHistory(h,files,expected,now));
console.log('PASS one explicit failed-device recovery eligibility: no history reset, no active/completed extra transfer, no duplicate file, no fourth round');
