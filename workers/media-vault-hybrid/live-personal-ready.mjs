// Metadata/auth only; no app HTML, cookie creation, source request or task.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {appEnabled,appReadOnly} from './src/account-auth.js';
const {vars}=JSON.parse(await readFile(new URL('./account-window.json',import.meta.url),'utf8'));
assert.equal(vars.MEDIA_APP_TEST_MODE,'personal');assert.equal(vars.MEDIA_APP_ACCOUNT_ID,'media-vault-personal');
assert.equal(vars.ENABLE_APP_SUBMISSION,'true');assert.equal(vars.ENABLE_DIRECT_STREAM,'false');assert.ok(appEnabled(vars));assert.equal(appReadOnly(vars),false);
const base='https://pt-media-hybrid.summer07-nanjolno.workers.dev';
for(const path of ['/app-auth/session','/app-api/pikpak/accounts','/app-api/jobs']){
 const r=await fetch(base+path,{redirect:'error',signal:AbortSignal.timeout(20000)});assert.equal(r.status,403,'Unapproved browser must remain denied');
}
const r=await fetch(base+'/health',{headers:{Authorization:'Bearer '+process.env.OWNER},redirect:'error',signal:AbortSignal.timeout(20000)});assert.equal(r.status,200);assert.equal((await r.json()).streaming,'not-live');
console.log('PASS personal VPS task portal ready; unapproved browser denied, Owner approval required, streaming OFF; no page/source/media/cookie/task access');
