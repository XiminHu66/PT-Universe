import assert from 'node:assert/strict';
import {createNativeSaver} from '../../apps/media-vault/native-download.js';
import {nativeDownloadModule,nativeDownloadFailure} from './src/native-download.js';
const base='https://download.invalid',file={id:'a'.repeat(24),path:'generated/test.epub',name:'测试.epub',size:12};
const token='a'.repeat(64);
function harness(fetcher){
 const nodes=[],clicks=[],states=[],listeners=new Map();
 const win={location:{href:base+'/acceptance'},crypto,addEventListener:(k,v)=>listeners.set(k,v),removeEventListener:k=>listeners.delete(k)};
 const doc={body:{append:n=>nodes.push(n)},createElement:tag=>({tag,contentWindow:{},click(){clicks.push(this)},remove(){}})};
 const saver=createNativeSaver({baseURL:base,ticketPath:'/acceptance/ticket',window:win,document:doc,fetch:fetcher,wait:async()=>{},onState:s=>states.push(s)});
 return {saver,nodes,clicks,states,listeners};
}
const success=()=>new Response(JSON.stringify({ticket:token}),{headers:{'Content-Type':'application/json'}});
let calls=[];
const h=harness(async(url,options)=>{calls.push({url,options});return success()});
assert.deepEqual(await h.saver.save(file),{name:file.name,size:12,phase:'handed-off'});
assert.equal(calls.length,1,'only ticket metadata is fetched');assert.equal(calls[0].url,base+'/acceptance/ticket');
assert.equal(calls[0].options.credentials,'same-origin');assert.equal(calls[0].options.redirect,'error');
assert.deepEqual(JSON.parse(calls[0].options.body),{id:file.id,path:file.path});
const anchor=h.clicks[0],frame=h.nodes.find(n=>n.tag==='iframe'),navigation=new URL(anchor.href);
assert.equal(anchor.target,frame.name);assert.equal(anchor.download,undefined,'attachment headers supply filenames and permit HTML error navigation');assert.equal(anchor.referrerPolicy,'no-referrer');assert.equal(anchor.rel,undefined,'noopener must not turn the named frame into a popup');
assert.equal(navigation.pathname,'/download');assert.equal(navigation.searchParams.get('ticket'),token);
assert.match(navigation.searchParams.get('attempt'),/^[a-f0-9]{32}$/);assert.ok(!h.states.some(s=>s.phase==='complete'));
const message={type:'mv-native-download-error',attempt:navigation.searchParams.get('attempt'),status:429,retry_after:2};
const emit=(origin=base,source=frame.contentWindow,data=message)=>h.listeners.get('message')({origin,source,data});
emit('https://evil.invalid');emit(base,{});emit(base,frame.contentWindow,{...message,attempt:'b'.repeat(32)});
assert.equal(h.states.length,2,'forged origin, frame and attempt messages ignored');
emit();assert.equal(h.states.at(-1).phase,'error');assert.equal(h.states.at(-1).retryAfter,2);
emit();assert.equal(h.states.length,3,'duplicate failure ignored');
await h.saver.save(file);assert.equal(calls.length,2,'retry explicitly obtains a fresh ticket');
h.saver.dispose();assert.equal(h.listeners.size,0);await assert.rejects(h.saver.save(file),/入口已关闭/);
let release,fetches=0;
const delayed=harness(()=>{fetches++;return new Promise(r=>{release=r})});
const saving=delayed.saver.save(file);await assert.rejects(delayed.saver.save(file),/正在请求/);assert.equal(fetches,1);release(success());await saving;
let finishLate;const leaving=harness(()=>new Promise(r=>finishLate=r));
const lateSave=leaving.saver.save(file);leaving.saver.dispose();finishLate(success());
await assert.rejects(lateSave,/连接已变化/);assert.equal(leaving.clicks.length,0,'logout/disposal before ticket response must prevent native handoff');
for(const code of [401,403,404,409,429,503,502]){
 const failed=harness(async()=>new Response('{"error":"<secret server detail>"}',{status:code,headers:{'Retry-After':'5'}}));
 await assert.rejects(failed.saver.save(file),e=>e.status===code&&e.retryAfter===5&&!e.message.includes('secret'));
 assert.equal(failed.clicks.length,0);
}
const invalid=harness(async()=>success());
for(const f of [{...file,name:'../file.epub'},{...file,size:0},{...file,size:NaN}])await assert.rejects(invalid.saver.save(f),/文件信息无效/);
const malformed=harness(async()=>new Response('{"ticket":"javascript:bad"}'));await assert.rejects(malformed.saver.save(file),/票据格式无效/);
const abort=new AbortController();abort.abort();const cancelled=harness(async()=>success());await assert.rejects(cancelled.saver.save(file,{signal:abort.signal}),/已停止/);assert.equal(cancelled.clicks.length,0);
const offline=harness(async()=>{throw Error('network')});await assert.rejects(offline.saver.save(file),/连接失败/);
assert.throws(()=>createNativeSaver({baseURL:'https://user:secret@download.invalid',document:{},window:{location:{href:base}}}),/地址无效/);
const open={ENABLE_ACCEPTANCE_UI:'true',MEDIA_ACCEPTANCE_UNTIL:String(Date.now()+60000)};
assert.equal(nativeDownloadModule({}).status,404);
const moduleResponse=nativeDownloadModule(open),source=await moduleResponse.text();assert.equal(moduleResponse.status,200);
const deployed=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
assert.equal(typeof deployed.createNativeSaver,'function','served module is executable, not bundler-dependent text');
const req=new Request(base+'/download?ticket='+token+'&attempt='+'a'.repeat(32),{headers:{Accept:'text/html'}});
const original=()=>new Response('{"error":"private detail"}',{status:429,headers:{'Content-Type':'application/json','Retry-After':'2'}});
const bridge=nativeDownloadFailure(req,original()),html=await bridge.text();
assert.equal(bridge.status,429);assert.match(bridge.headers.get('Content-Security-Policy'),/frame-ancestors 'self' https:\/\/ximinhu66.github.io/);
assert.match(html,/mv-native-download-error/);assert.ok(!html.includes(token));assert.ok(!html.includes('private detail'));
const apiResponse=original();assert.equal(nativeDownloadFailure(new Request(req.url),apiResponse),apiResponse,'API errors remain JSON');
const ok=new Response('bytes');assert.equal(nativeDownloadFailure(req,ok),ok,'successful file stream untouched');
console.log('PASS shared native saver: direct navigation, metadata-only fetch, duplicate suppression, scoped error messages, fresh-ticket retry, cancellation, no false completion, executable gated module and private error bridge');

const offlineChannel=harness(()=>new Response(JSON.stringify({error:'Outbound download channel unavailable',code:'channel_unavailable',ticket_issued:false}),{status:503}));await assert.rejects(offlineChannel.saver.save(file),/本次未签发票据/);assert.equal(offlineChannel.states.at(-1).ticketIssued,false);assert.equal(offlineChannel.clicks.length,0);offlineChannel.saver.dispose();

let reconnectCalls=0;const reconnect=harness(()=>++reconnectCalls===1?new Response(JSON.stringify({code:'channel_unavailable',ticket_issued:false}),{status:503}):success());await reconnect.saver.save(file);assert.equal(reconnectCalls,2);assert.equal(reconnect.clicks.length,1);assert.ok(reconnect.states.some(s=>s.message.includes('自动重连')));reconnect.saver.dispose();

const interrupted=harness(success);await interrupted.saver.save(file);const interruptedFrame=interrupted.nodes.find(n=>n.tag==='iframe');for(let i=0;i<3;i++){const attempt=new URL(interrupted.clicks.at(-1).href).searchParams.get('attempt');interrupted.listeners.get('message')({origin:base,source:interruptedFrame.contentWindow,data:{type:'mv-native-download-error',attempt,status:503}});await new Promise(r=>setImmediate(r));}assert.equal(interrupted.clicks.length,3,'two confirmed pre-stream failures may reconnect, never unbounded retries');assert.equal(interrupted.states.at(-1).phase,'error');interrupted.saver.dispose();
