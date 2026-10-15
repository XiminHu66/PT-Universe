import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const config=JSON.parse(await readFile(new URL('./wrangler.jsonc',import.meta.url),'utf8'));
assert.equal(config.name,'pt-media-hybrid');assert.equal(config.vars.ENABLE_DIRECT_STREAM,'false');
const operation=process.env.OPERATION;
// Existing acceptance windows must never grant the new account permissions.
config.vars.ENABLE_APP_ACCESS='false';
config.vars.ENABLE_APP_SUBMISSION='false';
assert.ok(['deploy','prepare','stream-on','stream-off','large-on'].includes(operation));
config.vars.ENABLE_DIRECT_STREAM=['stream-on','large-on'].includes(operation)?'true':'false';
const ids=process.env.TEST_JOB_IDS||'';
if(ids)assert.match(ids,operation==='large-on'?/^[a-f0-9]{24}$/:/^[a-f0-9]{24}(,[a-f0-9]{24}){2}$/);
if(operation==='large-on')assert.match(ids,/^[a-f0-9]{24}$/);
// An OFF prepare must not expose a preview.
const preview=operation==='stream-on'&&!!ids;
config.vars.ENABLE_ACCEPTANCE_UI=preview?'true':'false';
config.vars.MEDIA_STREAM_TEST_LARGE_JOB=operation==='large-on'?ids:'';
config.vars.MEDIA_ACCEPTANCE_JOB_IDS=['prepare','stream-on'].includes(operation)?ids:'';
config.vars.MEDIA_ACCEPTANCE_UNTIL=String(preview?Date.now()+30*60*1000:0);
config.vars.MEDIA_STREAM_TEST_UNTIL=String(['stream-on','large-on'].includes(operation)?Date.now()+20*60*1000:0);
await writeFile(new URL('./test-window.json',import.meta.url),JSON.stringify(config,null,2));
console.log('Configured isolated test operation',operation,'with automatic request gate expiry');
