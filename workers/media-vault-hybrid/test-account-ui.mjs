import assert from 'node:assert/strict';
import {createAccountConnection} from '../../apps/media-vault/account-session.js';
import {mountAccountPage} from '../../apps/media-vault/account-app.js';
import {previewRoute} from './src/preview.js';
const origin='https://account.invalid',id='a'.repeat(24),jobId='b'.repeat(24);
const approved={status:'approved',session_id:id,expires_at:100000,can_submit:true,jobs_remaining:5,tickets_remaining:100};
const pending={status:'pending',session_id:id,pair_code:'c'.repeat(32),expires_at:5000};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status});
const memory=()=>({data:new Map(),getItem(k){return this.data.get(k);},setItem(k,v){this.data.set(k,v);},removeItem(k){this.data.delete(k);}});
function setup(handler,storage=memory(),extra={}){
 const calls=[],timers=new Map();let serial=0;
 const client=createAccountConnection({origin,storage,now:()=>1000,setTimeout:(f,ms)=>{timers.set(++serial,{f,ms});return serial;},clearTimeout:i=>timers.delete(i),fetch:async(url,o)=>{calls.push({url,o});return handler(new URL(url).pathname,o,calls);},...extra});return {client,calls,timers,storage};
}
let remaining=5,lose=true;const created=new Map();
const handler=async(path,o)=>{
 if(path==='/app-auth/session')return json({...approved,jobs_remaining:remaining});
 if(path==='/app-auth/logout')return json({ok:true});
 if(path==='/app-api/jobs'&&o.method==='POST'){
  const body=JSON.parse(o.body),existed=created.has(body.request_key);if(!existed){created.set(body.request_key,jobId);remaining--;}
  if(lose){lose=false;throw Error('connection lost AFTER commit');}return json({id:jobId,replayed:existed});
 }return json({jobs:[]});
};
const h=setup(handler);const spec={kind:'video',url:'https://example.com/video.mp4'};
await h.client.refresh();const one=h.client.submit(spec),two=h.client.submit(spec);assert.equal(one,two);await assert.rejects(one,/AFTER commit/);assert.equal(created.size,1);
assert.ok(!h.storage.getItem('mv.account.requests.v1').includes(spec.url),'no source URL or credential persisted');
await assert.rejects(h.client.submit({...spec,url:'https://example.com/other.mp4'}),/原内容/);
h.client.dispose();const restored=setup(handler,h.storage);assert.equal((await restored.client.refresh()).session_id,id);
assert.equal((await restored.client.submit(spec)).replayed,true);assert.equal(created.size,1,'reload and retry resolve the committed job');
remaining=0;assert.equal((await restored.client.submit(spec)).id,jobId,'replay works after new-job allowance reaches zero');
await assert.rejects(restored.client.submit({...spec,url:'https://example.com/new.mp4'}),/额度/);
for(const {url,o} of [...h.calls,...restored.calls]){assert.equal(new URL(url).origin,origin);assert.equal(o.credentials,'same-origin');assert.equal(o.redirect,'error');assert.ok(!Object.keys(o.headers).some(k=>/authorization/i.test(k)));}
for(const path of ['/agent/lease','/resolve','https://evil.invalid/jobs','/jobs/files?id='+jobId+'&extra=1'])await assert.rejects(restored.client.read(path));
await restored.client.logout();assert.equal(restored.storage.getItem('mv.account.requests.v1'),undefined);restored.client.dispose();
let resolveRead;const late=setup(async(path)=>path==='/app-auth/session'?json(approved):path==='/app-auth/logout'?json({ok:true}):new Promise(r=>resolveRead=r));
const read=late.client.read('/jobs');while(!resolveRead)await new Promise(r=>setImmediate(r));await late.client.logout();resolveRead(json({jobs:[{id:jobId}]}));await assert.rejects(read,/会话已变化/);assert.equal(late.client.current().status,'unpaired');late.client.dispose();
let resolvePost;const latePost=setup(async(path,o)=>path==='/app-auth/session'?json(approved):path==='/app-auth/logout'?json({ok:true}):new Promise(r=>resolvePost=r));
const posting=latePost.client.submit(spec);while(!resolvePost)await new Promise(r=>setImmediate(r));await latePost.client.logout();resolvePost(json({id:jobId}));await assert.rejects(posting,/会话已变化/);assert.equal(latePost.storage.getItem('mv.account.requests.v1'),undefined,'late POST cannot repopulate the cleared retry journal');latePost.client.dispose();
let finish,started;const start=new Promise(r=>started=r);
const race=setup(async path=>path==='/app-auth/pair'?(started(),new Promise(r=>finish=r)):json({ok:true}));
const pairing=race.client.pair();await start;const logout=race.client.logout();assert.equal(race.calls.length,2);finish(json(pending));await assert.rejects(pairing,/会话已变化/);await logout;assert.deepEqual(race.calls.map(x=>new URL(x.url).pathname),['/app-auth/logout','/app-auth/pair','/app-auth/logout']);race.client.dispose();
const bad=setup(async()=>json({},503));await assert.rejects(bad.client.logout());assert.equal(bad.client.current().status,'logout-failed');await assert.rejects(bad.client.read('/jobs'));bad.client.dispose();
const malformed=setup(async()=>json({}));await assert.rejects(malformed.client.logout(),/尚未确认/);malformed.client.dispose();
const blocked=setup(handler,{getItem(){},setItem(){throw Error('blocked');}});remaining=5;await assert.rejects(blocked.client.submit(spec),/会话存储/);assert.ok(!blocked.calls.some(x=>x.o.method==='POST'));blocked.client.dispose();
let clock=1000;const expire=setup(async()=>json(approved),memory(),{now:()=>clock});await expire.client.refresh();clock=100000;expire.timers.values().next().value.f();assert.equal(expire.client.current().status,'expired');expire.client.dispose();
const channel={postMessage(){},close(){}};const cross=setup(handler,memory(),{channel});await cross.client.refresh();channel.onmessage({data:'logout'});await new Promise(r=>setImmediate(r));assert.equal(cross.client.current().status,'unpaired');cross.client.dispose();
// Minimal DOM contract harness exercises the actual controller handlers, not a
// second implementation. It is not a browser layout or real-download test.
const nodes=new Map();function node(id){if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',innerHTML:'',disabled:false,hidden:false,open:false,replaceChildren(){this.innerHTML='';},showModal(){this.open=true;},close(){this.open=false;}});return nodes.get(id);}
let emit,session=approved,resolveFiles,disposedSaver=0;
const fake={current:()=>session,refresh:async()=>{emit(session);return session;},read:async p=>p==='/jobs'?{jobs:[{id:jobId,kind:'video',status:'complete'}]}:p==='/quota'?{limit_bytes:100,tracking:'not_active'}:new Promise(r=>resolveFiles=r),submit:async()=>({id:jobId}),pair:async()=>{},logout:async()=>{session={status:'unpaired'};emit(session);},dispose(){}};
const page=mountAccountPage({origin,document:{getElementById:node,hidden:false},setInterval:()=>1,clearInterval(){},createConnection:o=>{emit=o.onState;return fake;},createSaver:()=>({dispose(){disposedSaver++;},save(){}})});
await new Promise(r=>setImmediate(r));assert.equal(node('jobFields').disabled,false);assert.match(node('budget').textContent,/传输当前关闭/);
const click={target:{closest:()=>({dataset:{files:jobId}})}};node('jobs').onclick(click);while(!resolveFiles)await new Promise(r=>setImmediate(r));await node('logout').onclick();resolveFiles({files:[{name:'late.mp4',size:100}]});await new Promise(r=>setImmediate(r));assert.equal(node('files').open,false,'late file list cannot reopen after logout');assert.equal(node('filesList').innerHTML,'');assert.equal(node('jobFields').disabled,true);
session=approved;await page.reload();node('jobs').onclick(click);while(!resolveFiles)await new Promise(r=>setImmediate(r));resolveFiles({files:[{name:'<unsafe>.mp4',size:100}]});await new Promise(r=>setImmediate(r));assert.equal(node('files').open,true);assert.match(node('filesList').innerHTML,/&lt;unsafe&gt;/);await node('logout').onclick();assert.equal(node('files').open,false);assert.equal(disposedSaver,1);page.dispose();
const env={ENABLE_APP_ACCESS:'true',MEDIA_APP_ACCOUNT_ID:'fixture'};
const req=p=>new Request(origin+p);
for(const path of ['/app/','/app/account-app.js','/app/account-session.js'])assert.equal(previewRoute(req(path),{}).status,404);
const response=previewRoute(req('/app/'),env),html=await response.text();assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'no-store');assert.match(response.headers.get('Content-Security-Policy'),/connect-src 'self'/);
for(const id of ['jobForm','pair','logout','filesList'])assert.match(html,new RegExp('id="'+id+'"'));
for(const forbidden of ['engineToken','Owner','pt-sync.js','pt-bridge.js'])assert.ok(!html.includes(forbidden));
for(const name of ['account-app.js','account-session.js','account.css','native-download.js'])assert.equal(previewRoute(req('/app/'+name),env).status,200);
for(const name of ['app.js','scoped-session.js','index.html','constructor','data/snapshot.json'])assert.equal(previewRoute(req('/app/'+name),env).status,404);
const accountStyle=await previewRoute(req('/app/style.css'),env).text();assert.ok(!accountStyle.includes('@import'));assert.ok(accountStyle.startsWith(':root{'),'font import stripping preserves root variables even when font URLs contain semicolons');
assert.equal(previewRoute(req('/acceptance/app/account-session.js'),{ENABLE_ACCEPTANCE_UI:'true',MEDIA_ACCEPTANCE_UNTIL:String(Date.now()+60000)}).status,404);
console.log('PASS account frontend: cookie restore, reload-safe bounded retry journal, duplicate submit, uncertain response, cap replay, stale response/logout/expiry isolation, cross-tab logout, failed logout lockout, DOM file cleanup and gated asset isolation');
