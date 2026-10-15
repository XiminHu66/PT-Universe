import {digest,hex} from './session-auth.js';
export const APP_COOKIE='__Host-mv-account';
export const APP_LIFETIME=7*24*3600000;
export const APP_JOB_LIMIT=5,APP_TICKET_LIMIT=100;
export const appReadOnly=env=>env.MEDIA_APP_LOGIN_TEST_UNTIL!==undefined;
export function appDeadline(env){
 if(!appReadOnly(env))return Number.MAX_SAFE_INTEGER;
 const value=Number(env.MEDIA_APP_LOGIN_TEST_UNTIL);
 return /^\d+$/.test(String(env.MEDIA_APP_LOGIN_TEST_UNTIL))&&Number.isSafeInteger(value)?value:0;
}
export const appEnabled=env=>env.ENABLE_APP_ACCESS==='true'&&/^[a-zA-Z0-9_-]{1,48}$/.test(env.MEDIA_APP_ACCOUNT_ID||'')&&appDeadline(env)>Date.now()&&(!appReadOnly(env)||/^login-test-[a-f0-9]{32}$/.test(env.MEDIA_APP_ACCOUNT_ID));
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
