// Repository-only readiness check. No credentials, network, migrations or deploy.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {configureAccountWindow} from './account-window-config.mjs';
import {layouts} from '../../apps/media-vault/account-form.js';
import {NOVEL_UX_LAYOUTS} from './src/account-novel-scope.js';
import {appEnabled} from './src/account-auth.js';
import {streamingEnabled,transferBudget} from './src/limits.js';
import {releaseBlockers} from './release-readiness.mjs';
const root=new URL('../../',import.meta.url),base=JSON.parse(await readFile(new URL('./wrangler.jsonc',import.meta.url),'utf8'));
const manifest=JSON.parse(await readFile(new URL('./candidate-manifest.json',import.meta.url),'utf8'));
assert.equal(manifest.schema_version,1);assert.equal(manifest.stage,'closed-integration-candidate');
for(const key of ['ENABLE_APP_ACCESS','ENABLE_APP_SUBMISSION','ENABLE_DIRECT_STREAM'])assert.equal(base.vars[key],'false');
assert.notEqual(base.vars.ENABLE_ACCEPTANCE_UI,'true');assert.ok(!base.vars.MEDIA_APP_ACCOUNT_ID);assert.equal(appEnabled(base.vars),false);assert.equal(streamingEnabled(base.vars),false);
assert.equal(transferBudget(base.vars),100*1024**3);
for(const binding of ['r2_buckets','kv_namespaces','queues'])assert.equal(base[binding],undefined,'No media archive bindings in candidate');
assert.deepEqual(layouts,NOVEL_UX_LAYOUTS,'UI presets and server scope must agree');
for(const operation of ['account-login-off','account-submit-off','account-files-off','account-novel-off','account-rc-off']){
 const {vars}=configureAccountWindow(base,operation);
 assert.equal(appEnabled(vars),false);assert.equal(streamingEnabled(vars),false);assert.equal(vars.MEDIA_APP_ACCOUNT_ID,'');assert.equal(vars.MEDIA_APP_TEST_MODE,'closed');
 for(const name of ['MEDIA_APP_LOGIN_TEST_UNTIL','MEDIA_APP_SUBMISSION_TEST_UNTIL','MEDIA_APP_FILE_TEST_START','MEDIA_APP_FILE_TEST_UNTIL','MEDIA_APP_NOVEL_TEST_START','MEDIA_APP_NOVEL_TEST_UNTIL','MEDIA_STREAM_TEST_UNTIL'])assert.equal(vars[name],'0');
}
for(const [path,expected] of Object.entries(manifest.production_source_sha256)){
 const actual=createHash('sha256').update(await readFile(new URL(path,root))).digest('hex');assert.equal(actual,expected,'Reviewed production source changed: '+path);
}
assert.deepEqual(manifest.original_order,['outbound-agent','metadata','small-transfer','large-recovery','budget-retention','real-sources','frontend','merge-publication']);
assert.ok(Array.isArray(manifest.pending)&&manifest.pending.every(x=>typeof x.id==='string'&&typeof x.status==='string'),'Acceptance gate shape required');
console.log('PASS closed integration candidate: defaults and shutdown configs closed; 100 GiB budget; shared layout contract; reviewed production source unchanged; no deployment performed');
const blockers=releaseBlockers(manifest);
console.log(blockers.length?'NOT READY FOR PRODUCTION: '+blockers.map(x=>x.id+': '+x.status).join('; '):'PASS recorded acceptance evidence and explicit merge/publication decision are complete');
if(process.argv.includes('--release'))assert.equal(blockers.length,0,'Release blocked by unresolved acceptance and publication gates');
