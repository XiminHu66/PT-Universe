export const COOKIE='__Host-mv-acceptance';
export const hex=b=>Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');
export async function digest(text){return hex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))))}
export async function cookieDigest(request){
 const raw=(request.headers.get('Cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
 return /^[a-f0-9]{64}$/.test(raw||'')?digest(raw):null;
}
