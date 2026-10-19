import assert from 'node:assert/strict';
import {MediaRelay} from './src/relay.js';
import {relayContext} from './test-state.mjs';
const agent={readyState:1,sent:[],send(x){this.sent.push(JSON.parse(x))}};
let credited=null;
const db={
 async batch(ops){return Promise.all(ops.map(op=>op.run()))},
 prepare(sql){return {async all(){return {results:[]}},bind(...args){return {async run(){
  if(sql.startsWith('UPDATE mv_hybrid_transfer_usage'))credited={sql,args};
  return {meta:{changes:1}};
 }}}}}
};
const relay=new MediaRelay(relayContext(agent),{DB:db});
const id='a'.repeat(24),job='b'.repeat(24);
const path='generated/'+job+'.epub';
const params=new URLSearchParams({job,path,transfer:id,size:'4',name:'中文.epub',month:'2026-10',digest:'c'.repeat(64)});
const result=await relay.fetch(new Request('https://local/stream?'+params));
assert.equal(result.status,200);
assert.equal(result.headers.get('Content-Length'),'4');
assert.equal(agent.sent[0].type,'pull');
assert.equal(agent.sent[0].path,path);
const reader=result.body.getReader();
const payload=new Uint8Array([...new TextEncoder().encode(id),80,75,3,4]);
const write=relay.webSocketMessage(agent,payload.buffer);
const first=await reader.read();
assert.deepEqual([...first.value],[80,75,3,4]);
await write;
assert.equal(agent.sent.at(-1).type,'ack');
const end=relay.webSocketMessage(agent,JSON.stringify({type:'end',id}));
const finished=await reader.read();
assert.equal(finished.done,true);
await end;
assert.equal(agent.sent.at(-1).type,'delivered');
assert.deepEqual(credited.args.slice(0,2),[4,4]);
const bad=await relay.fetch(new Request('https://local/stream?'+new URLSearchParams({job,path,transfer:'invalid',size:'4',month:'2026-10'})));
assert.equal(bad.status,400);
console.log('PASS simulated VPS outbound websocket -> Durable Object stream -> local browser bytes, ACK backpressure and usage ledger');

