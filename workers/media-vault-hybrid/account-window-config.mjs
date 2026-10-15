import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {readFile,writeFile} from 'node:fs/promises';
export function configureAccountWindow(base,operation,now=Date.now()){
 assert.equal(base.name,'pt-media-hybrid');assert.equal(base.vars.ENABLE_DIRECT_STREAM,'false');
 assert.equal(base.vars.ENABLE_APP_ACCESS,'false');assert.equal(base.vars.ENABLE_APP_SUBMISSION,'false');
 assert.ok(['account-login-on','account-login-off'].includes(operation));assert.ok(Number.isSafeInteger(now)&&now>0);
 const config=structuredClone(base),enabled=operation==='account-login-on';
 Object.assign(config.vars,{ENABLE_DIRECT_STREAM:'false',ENABLE_APP_SUBMISSION:'false',ENABLE_ACCEPTANCE_UI:'false',ENABLE_APP_ACCESS:enabled?'true':'false',MEDIA_APP_LOGIN_TEST_UNTIL:String(enabled?now+20*60000:0),MEDIA_APP_ACCOUNT_ID:enabled?'login-test-'+randomUUID().replaceAll('-',''):'',MEDIA_STREAM_TEST_UNTIL:'0',MEDIA_ACCEPTANCE_UNTIL:'0',MEDIA_ACCEPTANCE_JOB_IDS:'',MEDIA_STREAM_TEST_LARGE_JOB:''});
 return config;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const config=configureAccountWindow(JSON.parse(await readFile(new URL('./wrangler.jsonc',import.meta.url),'utf8')),process.env.OPERATION);
 await writeFile(new URL('./account-window.json',import.meta.url),JSON.stringify(config,null,2));
 console.log('Configured isolated account login operation; task mutation, tickets, streaming and temporary preview stay OFF');
}
