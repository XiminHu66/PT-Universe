import assert from 'node:assert/strict';
const values=new Map();globalThis.sessionStorage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
globalThis.location={href:'https://ximinhu66.github.io/PT-Universe/apps/resource-center/',assign:u=>{location.assigned=u}};globalThis.history={state:null,replaceState:(_,__,u)=>{location.href=u}};
const {resourceSession,connectResources,clearResourceSession}=await import('../../apps/resource-center/auth.mjs');
assert.equal(resourceSession(),'');connectResources();const nonce=new URL(location.assigned).searchParams.get('nonce');assert.match(nonce,/^[a-f0-9]{48}$/);assert.throws(()=>connectResources(),/连接尚未完成/);
const now=Math.floor(Date.now()/1000),token=extra=>'header.'+Buffer.from(JSON.stringify({iss:'https://pt-vps-tools.h1nano.chatgpt.site',aud:'pt-universe-resources',sub:'pt-backend-owner',scope:'resources:read',iat:now,exp:now+86400,nonce,...extra})).toString('base64url')+'.fixture';
location.href+='#resource-session='+token({})+'&nonce='+nonce;assert.equal(resourceSession(),token({}));assert.equal(new URL(location.href).hash,'');clearResourceSession();assert.equal(resourceSession(),'');
connectResources(true);const n2=new URL(location.assigned).searchParams.get('nonce');location.href+='#resource-session='+token({nonce:n2})+'&nonce='+nonce;assert.equal(resourceSession(),'');assert.equal(new URL(location.href).hash,'');
values.set('pt.resources.session.v1',token({scope:'resources:configure'}));assert.equal(resourceSession(),'');values.set('pt.resources.session.v1',token({exp:now-1}));assert.equal(resourceSession(),'');
console.log('PASS: fixed identity broker, nonce-bound callback, fragment removal, temporary storage, retry cooldown and expired/wrong-scope grant rejection.');
// Embedded login leaves the iframe and returns to a fixed, token-free Nexus URL.
globalThis.window={parent:{},top:{location:{assign:u=>{location.topAssigned=u}}}};
location.replace=u=>{location.replaced=u};
connectResources(true,'projects');const embeddedNonce=new URL(location.topAssigned).searchParams.get('nonce');
const pending=JSON.parse(values.get('pt.resources.connect.v1'));assert.equal(pending.returnTo,'nexus');assert.equal(pending.view,'projects');
location.href='https://ximinhu66.github.io/PT-Universe/apps/resource-center/#resource-session='+token({nonce:embeddedNonce})+'&nonce='+embeddedNonce;
assert.equal(resourceSession(),token({nonce:embeddedNonce}));assert.equal(new URL(location.href).hash,'');assert.equal(location.replaced,'https://ximinhu66.github.io/PT-Universe/apps/daily-nexus/?view=monitor&monitor=projects');assert.equal(values.has('pt.resources.connect.v1'),false);
// A stored arbitrary destination cannot become an open redirect.
connectResources(true,'overview');const fixedNonce=new URL(location.topAssigned).searchParams.get('nonce');const fixed=JSON.parse(values.get('pt.resources.connect.v1'));fixed.view='https://evil.example/';values.set('pt.resources.connect.v1',JSON.stringify(fixed));
location.href='https://ximinhu66.github.io/PT-Universe/apps/resource-center/#resource-session='+token({nonce:fixedNonce})+'&nonce='+fixedNonce;resourceSession();assert.equal(location.replaced,'https://ximinhu66.github.io/PT-Universe/apps/daily-nexus/?view=monitor&monitor=overview');
console.log('PASS: embedded authorization uses the top window, reuses session-only grants and returns to a fixed Nexus subview without credentials in the URL.');
