import {appFileTest,fileTestWindowValid,FILE_TEST_TICKETS} from './account-file-scope.js';
import {digest,hex} from './session-auth.js';
export const APP_COOKIE='__Host-mv-account';
export const APP_LIFETIME=7*24*3600000;
export const APP_JOB_LIMIT=5,APP_TICKET_LIMIT=100;
export const appSubmissionTest=env=>env.MEDIA_APP_TEST_MODE==='submission';
export const appReadOnly=env=>!appSubmissionTest(env)&&!appFileTest(env)&&env.MEDIA_APP_LOGIN_TEST_UNTIL!==undefined;
export const appFilesAllowed=env=>!appReadOnly(env)&&!appSubmissionTest(env);
export const appJobLimit=env=>appReadOnly(env)||appFileTest(env)?0:appSubmissionTest(env)?4:APP_JOB_LIMIT;
export const appTicketLimit=env=>appFileTest(env)?FILE_TEST_TICKETS:appFilesAllowed(env)?APP_TICKET_LIMIT:0;
export const appScope=env=>appFileTest(env)?'three-file-save-test':appReadOnly(env)?'login-test-read-only':appSubmissionTest(env)?'submission-test-no-transfer':'account-created jobs';
export function appDeadline(env){
 if(!appReadOnly(env)&&!appSubmissionTest(env)&&!appFileTest(env))return Number.MAX_SAFE_INTEGER;
 const raw=appFileTest(env)?env.MEDIA_APP_FILE_TEST_UNTIL:appSubmissionTest(env)?env.MEDIA_APP_SUBMISSION_TEST_UNTIL:env.MEDIA_APP_LOGIN_TEST_UNTIL,value=Number(raw);
 return /^\d+$/.test(String(raw))&&Number.isSafeInteger(value)?value:0;
}
export const appEnabled=env=>(!appFileTest(env)||fileTestWindowValid(env)&&env.ENABLE_APP_SUBMISSION==='false'&&env.MEDIA_APP_LOGIN_TEST_UNTIL==='0'&&env.MEDIA_APP_SUBMISSION_TEST_UNTIL==='0'&&/^submit-test-[a-f0-9]{32}$/.test(env.MEDIA_APP_ACCOUNT_ID||''))&&env.ENABLE_APP_ACCESS==='true'&&(!env.MEDIA_APP_TEST_MODE||['closed','login','submission','files'].includes(env.MEDIA_APP_TEST_MODE))&&env.MEDIA_APP_TEST_MODE!=='closed'&&/^[a-zA-Z0-9_-]{1,48}$/.test(env.MEDIA_APP_ACCOUNT_ID||'')&&appDeadline(env)>Date.now()&&(!appReadOnly(env)||/^login-test-[a-f0-9]{32}$/.test(env.MEDIA_APP_ACCOUNT_ID))&&(!appSubmissionTest(env)||env.MEDIA_APP_LOGIN_TEST_UNTIL==='0'&&/^submit-test-[a-f0-9]{32}$/.test(env.MEDIA_APP_ACCOUNT_ID));
export async function appCookieDigest(request){
 const raw=(request.headers.get('Cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(APP_COOKIE+'='))?.slice(APP_COOKIE.length+1);
 return /^[a-f0-9]{64}$/.test(raw||'')?digest(raw):null;
}
export function ownerAuthorized(request,env){
 const expected='Bearer '+(env.MEDIA_OWNER_TOKEN||''),value=request.headers.get('Authorization')||'';
 if((env.MEDIA_OWNER_TOKEN||'').length<32||expected.length!==value.length)return false;
 let mismatch=0;for(let i=0;i<expected.length;i++)mismatch|=expected.charCodeAt(i)^value.charCodeAt(i);return mismatch===0;
}
export const randomHex=bytes=>hex(crypto.getRandomValues(new Uint8Array(bytes)));
export const appCookie=(token,maxAge)=>APP_COOKIE+'='+token+'; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age='+maxAge;
