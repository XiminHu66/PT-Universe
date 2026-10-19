import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const code=await readFile(new URL('../../apps/media-vault/device-connect.js',import.meta.url),'utf8');
const origin='https://ximinhu66.github.io',channel='c'.repeat(64);
function fixture(responses,hash='#channel='+channel+'&remember=true'){
 const calls=[],messages=[],elements=new Map();let closed=false,redirect;
 const ctx=vm.createContext({URL,URLSearchParams,AbortSignal,location:{hash,replace(url){redirect=url;}},document:{getElementById(id){if(!elements.has(id))elements.set(id,{hidden:true});return elements.get(id);}},window:{opener:{postMessage(data,target){assert.equal(target,origin);messages.push(data);}},close(){closed=true;}},fetch:async(path,options)=>{calls.push({path,options});const expected=responses.shift();assert.ok(expected,'Unexpected call '+path);assert.equal(path,expected.path);assert.equal(options.credentials,'same-origin');assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,undefined);return Response.json(expected.body||{}, {status:expected.status||200});}});
 vm.runInContext(code,ctx);return {calls,messages,elements,closed:()=>closed,redirect:()=>redirect,ctx};
}
const settle=async()=>{for(let n=0;n<12;n++)await new Promise(r=>setImmediate(r));};
const register={path:'/media-vault-login/connect',status:201},approved={path:'/app-auth/session',body:{status:'approved',scope:'personal-vps-downloads'}},missing={path:'/app-auth/session',status:403};
const restore=fixture([register,approved,{path:'/media-vault-login/complete',body:{ok:true}}]);await settle();assert.equal(restore.closed(),true);assert.equal(restore.messages[0].status,'ready');assert.equal(restore.messages[0].token,undefined,'no grant passed through window.opener');assert.equal(restore.messages[0].channel,channel);assert.deepEqual(restore.calls.map(x=>x.path),['/media-vault-login/connect','/app-auth/session','/media-vault-login/complete']);
const first=fixture([register,missing,{path:'/media-vault-login/start',body:{status:'setup_required'}}]);await settle();assert.equal(first.elements.get('setupForm').hidden,false);assert.equal(first.elements.get('setupChannel').value,channel);assert.equal(first.elements.get('setupRemember').value,'true');assert.equal(first.messages[0].status,'setup_required');
const oauth='https://github.com/login/oauth/authorize?client_id=fixture';const login=fixture([register,missing,{path:'/media-vault-login/start',body:{authorize_url:oauth}}]);await settle();assert.equal(login.redirect(),oauth);assert.equal(login.messages[0].status,'login');
const forged=fixture([register,missing,{path:'/media-vault-login/start',body:{authorize_url:'https://evil.invalid/login'}}]);await settle();assert.equal(forged.redirect(),undefined);assert.equal(forged.messages.at(-1).status,'error');
const offline=fixture([register,{path:'/app-auth/session',status:503}]);await settle();assert.equal(offline.calls.length,2);assert.equal(offline.messages[0].status,'error','service failure does not logout or start a new login');
const malformed=fixture([],'#channel=public-id&remember=true');await settle();assert.equal(malformed.calls.length,0);
const repair=fixture([register],'#channel='+channel+'&remember=false&setup=true');await settle();assert.equal(repair.calls.length,1);assert.equal(repair.elements.get('setupRemember').value,'false');assert.equal(repair.elements.get('setupForm').hidden,false);
const noOpener=fixture([register,approved,{path:'/media-vault-login/complete',body:{ok:true}}]);noOpener.ctx.window.opener=null;await settle();assert.equal(noOpener.closed(),true,'COOP/missing opener does not block server handoff');
console.log('PASS private popup: valid cookie reuse, zero public pairing, OAuth redirect allowlist, setup/repair form, fragment-only proof, no token postMessage, provider outage preserves login and COOP-safe completion');
