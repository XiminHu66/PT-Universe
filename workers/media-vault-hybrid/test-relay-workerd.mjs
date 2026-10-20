// Actual local workerd WebSockets/SQLite/FixedLengthStream; no live endpoints,
// credentials, media sources, port publication or acceptance-window changes.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const require=createRequire(new URL('../pt-universe-api/package.json',import.meta.url));
const modulePath=process.env.MEDIA_MINIFLARE_MODULE||require.resolve('miniflare');
const {Miniflare,convertV4MiniflareOptions}=await import(pathToFileURL(modulePath).href);
const source=await readFile(new URL('./src/relay.js',import.meta.url),'utf8');
const fixture=`import {MediaRelay} from './relay.js';
export class TestRelay extends MediaRelay {
 async fetch(req){if(new URL(req.url).pathname==='/test-expire-lease'){
  for(const ws of this.ctx.getWebSockets('media-agent'))ws.serializeAttachment({seen:Date.now()-61000,retired:false});
  return new Response(null,{status:204});
 }return super.fetch(req);}
}
export default {fetch(req,env){return env.RELAY.get(env.RELAY.idFromName('fixture')).fetch(req)}};`;
const options={host:'127.0.0.1',port:0,compatibilityDate:'2026-08-26',modules:[{type:'ESModule',path:'entry.mjs',contents:fixture},{type:'ESModule',path:'relay.js',contents:source}],durableObjects:{RELAY:{className:'TestRelay',useSQLite:true}},d1Databases:{DB:'fixture-db'}};
const mf=new Miniflare(convertV4MiniflareOptions?convertV4MiniflareOptions(options):options);
const fetch=(path,options)=>mf.dispatchFetch('http://local'+path,options);
const sockets=[];let busy=false,delivered=0,peer;
async function connect(respond=true){
 const r=await fetch('/agent-connect',{headers:{Upgrade:'websocket'}});assert.equal(r.status,101);
 const ws=r.webSocket;ws.accept();sockets.push(ws);
 ws.addEventListener('message',e=>{
  if(typeof e.data!=='string'||e.data==='mv-pong')return;
  const m=JSON.parse(e.data);
  if(m.type==='probe'&&respond)ws.send(JSON.stringify({type:busy?'probe-busy':'probe-ok',id:m.id}));
  if(m.type==='pull')ws.send(new Uint8Array([...new TextEncoder().encode(m.id),80,75,3,4]));
  if(m.type==='ack')ws.send(JSON.stringify({type:'end',id:m.id}));
  if(m.type==='delivered')delivered++;
 });
 return ws;
}
try{
 const db=await mf.getD1Database('DB');
 await db.exec((await readFile(new URL('./schema.sql',import.meta.url),'utf8')).split('\n').filter(x=>!x.startsWith('--')).join(' '));
 const id='a'.repeat(24),path='generated/'+id+'.epub';
 await db.prepare("INSERT INTO mv_hybrid_jobs(id,kind,request_json,status,created_at,updated_at) VALUES(?,'novel','{}','complete',0,0)").bind(id).run();
 await db.prepare("INSERT INTO mv_hybrid_transfer_usage(month,transferred_bytes,reserved_bytes,updated_at) VALUES('2026-10',0,4,0)").run();
 let agent=await connect();
 assert.equal((await fetch('/agent-ready')).status,204,'actual responsive WebSocket probe');
 busy=true;assert.equal((await fetch('/agent-ready')).status,429,'busy response is not treated as a broken connection');busy=false;
 // A socket may look OPEN even though its old Agent is gone. Expire only the
 // fixture attachment, retain the actual platform socket, then permit replacement.
 await fetch('/test-expire-lease');assert.equal((await fetch('/agent-ready')).status,503);
 agent=await connect();assert.equal((await fetch('/agent-ready')).status,204,'stale socket cannot block replacement');
 agent.send('mv-ping');
 const digest='b'.repeat(64),transfer='c'.repeat(24);
 await db.prepare("INSERT INTO mv_hybrid_tickets(digest,job_id,relative_path,bytes,month,expires_at,status) VALUES(?,?,?,4,'2026-10',?,'new')").bind(digest,id,path,Date.now()+60000).run();
 const q=new URLSearchParams({job:id,path,transfer,size:'4',name:'fixture.epub',month:'2026-10',digest});
 const r=await fetch('/stream?'+q);assert.equal(r.status,200);assert.equal(r.headers.get('Content-Length'),'4');
 assert.deepEqual([...new Uint8Array(await r.arrayBuffer())],[80,75,3,4]);
 for(let i=0;i<40&&delivered===0;i++)await new Promise(r=>setTimeout(r,10));
 assert.equal(delivered,1);assert.equal((await db.prepare('SELECT status FROM mv_hybrid_tickets WHERE digest=?').bind(digest).first()).status,'complete');
 assert.equal((await db.prepare('SELECT transferred_bytes FROM mv_hybrid_transfer_usage').first()).transferred_bytes,4);
 agent.close(1000,'fixture reconnect');
 for(let i=0;i<40&&agent.readyState!==3;i++)await new Promise(r=>setTimeout(r,10));
 await connect();assert.equal((await fetch('/agent-ready')).status,204,'actual peer close permits reconnect');
 await fetch('/test-expire-lease');await connect(false);
 assert.equal((await fetch('/agent-ready')).status,503,'silent OPEN socket times out before any ticket or browser stream');
 await connect();assert.equal((await fetch('/agent-ready')).status,204,'timeout permits later healthy connection');
 await fetch('/test-expire-lease');await connect(false);
 await connect();assert.equal((await fetch('/agent-ready')).status,204,'fresh silent OPEN socket is probed and replaced during reconnect, without waiting for sixty-second lease');
 await fetch('/test-expire-lease');await connect(false);
 const silentDigest='f'.repeat(64);await db.prepare("INSERT INTO mv_hybrid_tickets(digest,job_id,relative_path,bytes,month,expires_at,status) VALUES(?,?,?,4,'2026-10',?,'new')").bind(silentDigest,id,path,Date.now()+60000).run();
 const silent=await fetch('/stream?'+new URLSearchParams({job:id,path,transfer:'f'.repeat(24),size:'4',name:'fixture.epub',month:'2026-10',digest:silentDigest}));assert.equal(silent.status,503,'silent stream peer fails before HTTP200 or ticket claim');assert.equal((await db.prepare('SELECT status FROM mv_hybrid_tickets WHERE digest=?').bind(silentDigest).first()).status,'new');
 await connect();
 if(process.argv.includes('--require-agent'))assert.ok(process.env.MEDIA_AGENT_SOURCE,'Actual companion Agent source is required');
 if(process.env.MEDIA_AGENT_SOURCE){
  await fetch('/test-expire-lease');await fetch('/agent-ready');
  const address=new URL('/agent-connect',await mf.ready);address.protocol='ws:';
  let output='',errors='';
  peer=spawn(process.env.PYTHON||'python3',[new URL('./test-stream-peer.py',import.meta.url).pathname,address.href],{env:process.env,stdio:['ignore','pipe','pipe']});
  peer.stdout.on('data',b=>{output+=b.toString()});peer.stderr.on('data',b=>{errors+=b.toString()});
  async function waitConnections(count){for(let i=0;i<300;i++){if((output.match(/Outbound Media Vault stream relay connected/g)||[]).length>=count)return;if(peer.exitCode!==null)throw Error('Agent fixture exited: '+errors);await new Promise(r=>setTimeout(r,100));}throw Error('Agent reconnect deadline exceeded: '+errors);}
  await waitConnections(1);assert.equal((await fetch('/agent-ready')).status,204);
  // Real elapsed idle exceeds the lease. Only the actual Python heartbeat can
  // keep this socket valid; no clock substitution or fixture attachment refresh.
  await new Promise(r=>setTimeout(r,65000));
  assert.equal((await fetch('/agent-ready')).status,204,'actual Agent survives real 65-second idle beyond lease');
  await db.prepare("UPDATE mv_hybrid_transfer_usage SET reserved_bytes=4").run();
  const digest2='d'.repeat(64),transfer2='e'.repeat(24);
  await db.prepare("INSERT INTO mv_hybrid_tickets(digest,job_id,relative_path,bytes,month,expires_at,status) VALUES(?,?,?,4,'2026-10',?,'new')").bind(digest2,id,path,Date.now()+60000).run();
  const response=await fetch('/stream?'+new URLSearchParams({job:id,path,transfer:transfer2,size:'4',name:'fixture.epub',month:'2026-10',digest:digest2}));
  assert.equal(response.status,200);assert.deepEqual([...new Uint8Array(await response.arrayBuffer())],[80,75,3,4]);
  for(let i=0;i<40&&!output.includes('Browser stream acknowledged');i++)await new Promise(r=>setTimeout(r,50));
  assert.ok(output.includes('Browser stream acknowledged'),'real Agent completed source/read/ACK/delivery');
  await fetch('/test-expire-lease');assert.equal((await fetch('/agent-ready')).status,503);
  await waitConnections(2);assert.equal((await fetch('/agent-ready')).status,204,'actual Python reconnect recovers without re-opening browser grants');
  assert.equal((await db.prepare('SELECT transferred_bytes FROM mv_hybrid_transfer_usage').first()).transferred_bytes,8);
  console.log('PASS real Python Agent + workerd WebSockets: real 65-second idle heartbeat, source fixture -> real fixed stream -> consumer bytes/ACK/ledger, forced disconnect and actual reconnect');
 }
 console.log('PASS actual workerd WebSocket/SQLite/FixedLengthStream: responsive/busy/silent probes, stale OPEN replacement, heartbeat, real bytes/hash-length/ACK/ledger, peer-close reconnect; no live services');
}finally{if(peer){peer.kill('SIGTERM');await new Promise(resolve=>{if(peer.exitCode!==null)resolve();else peer.once('exit',resolve)});}for(const ws of sockets)try{ws.close(1000,'fixture end')}catch{}await mf.dispose();}
