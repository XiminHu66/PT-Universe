import {fileTestManifest} from './src/account-file-scope.js';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {readFile,writeFile} from 'node:fs/promises';
export function configureAccountWindow(base,operation,now=Date.now(),selection=null){
 assert.equal(base.name,'pt-media-hybrid');assert.equal(base.vars.ENABLE_DIRECT_STREAM,'false');
 assert.equal(base.vars.ENABLE_APP_ACCESS,'false');assert.equal(base.vars.ENABLE_APP_SUBMISSION,'false');
 assert.ok(['account-login-on','account-login-off','account-submit-on','account-submit-off','account-rc-off','account-files-on','account-files-off','account-novel-on','account-novel-off'].includes(operation));assert.ok(Number.isSafeInteger(now)&&now>0);
 if(operation==='account-files-on'){
  assert.ok(selection&&/^submit-test-[a-f0-9]{32}$/.test(selection.account_id),'Retained account selection required');
  assert.equal(fileTestManifest({MEDIA_APP_FILE_TEST_FILES:JSON.stringify(selection.files)}).length,3,'Three fixed retained files required');
 }
 const config=structuredClone(base),submit=operation==='account-submit-on',enabled=operation==='account-login-on'||submit;
 Object.assign(config.vars,{ENABLE_DIRECT_STREAM:'false',ENABLE_APP_SUBMISSION:'false',ENABLE_ACCEPTANCE_UI:'false',ENABLE_APP_ACCESS:enabled?'true':'false',MEDIA_APP_LOGIN_TEST_UNTIL:String(enabled?now+20*60000:0),MEDIA_APP_ACCOUNT_ID:enabled?'login-test-'+randomUUID().replaceAll('-',''):'',MEDIA_STREAM_TEST_UNTIL:'0',MEDIA_ACCEPTANCE_UNTIL:'0',MEDIA_ACCEPTANCE_JOB_IDS:'',MEDIA_STREAM_TEST_LARGE_JOB:''});
 Object.assign(config.vars,{MEDIA_APP_TEST_MODE:enabled?(submit?'submission':'login'):'closed',MEDIA_APP_SUBMISSION_TEST_UNTIL:'0',MEDIA_APP_FILE_TEST_START:'0',MEDIA_APP_FILE_TEST_UNTIL:'0',MEDIA_APP_FILE_TEST_FILES:'',MEDIA_APP_NOVEL_TEST_START:'0',MEDIA_APP_NOVEL_TEST_UNTIL:'0'});
 if(submit)Object.assign(config.vars,{ENABLE_APP_SUBMISSION:'true',MEDIA_APP_LOGIN_TEST_UNTIL:'0',MEDIA_APP_SUBMISSION_TEST_UNTIL:String(now+30*60000),MEDIA_APP_ACCOUNT_ID:'submit-test-'+randomUUID().replaceAll('-','')});
 if(operation==='account-novel-on')Object.assign(config.vars,{ENABLE_APP_ACCESS:'true',ENABLE_APP_SUBMISSION:'true',MEDIA_APP_ACCOUNT_ID:'novel-test-'+randomUUID().replaceAll('-',''),MEDIA_APP_TEST_MODE:'novel-ux',MEDIA_APP_NOVEL_TEST_START:String(now),MEDIA_APP_NOVEL_TEST_UNTIL:String(now+30*60000)});
 if(operation==='account-files-on')Object.assign(config.vars,{ENABLE_APP_ACCESS:'true',ENABLE_APP_SUBMISSION:'false',ENABLE_DIRECT_STREAM:'true',MEDIA_STREAM_TEST_UNTIL:String(now+20*60000),MEDIA_APP_ACCOUNT_ID:selection.account_id,MEDIA_APP_TEST_MODE:'files',MEDIA_APP_LOGIN_TEST_UNTIL:'0',MEDIA_APP_FILE_TEST_START:String(now),MEDIA_APP_FILE_TEST_UNTIL:String(now+20*60000),MEDIA_APP_FILE_TEST_FILES:JSON.stringify(selection.files)});
 return config;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const config=configureAccountWindow(JSON.parse(await readFile(new URL('./wrangler.jsonc',import.meta.url),'utf8')),process.env.OPERATION,Date.now(),process.env.OPERATION==='account-files-on'?JSON.parse(await readFile(new URL('./account-file-selection.json',import.meta.url),'utf8')):null);
 await writeFile(new URL('./account-window.json',import.meta.url),JSON.stringify(config,null,2));
 console.log('Configured isolated account operation',process.env.OPERATION,'; temporary preview OFF; explicit bounded file operation required to enable streaming');
}
