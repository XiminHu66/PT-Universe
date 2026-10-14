import { strict as assert } from 'node:assert';
import { handle } from './src/index.js';

const token='Bearer '+'a'.repeat(64);
const called=[];
const service={fetch:async(url,init)=>{
  called.push({url,init});
  if(new URL(url).pathname==='/download')return new Response(new Uint8Array([0x50,0x4b,0x03,0x04]),{status:200,headers:{'Content-Type':'application/octet-stream','Content-Disposition':'attachment; filename="sample.cbz"'}});
  return Response.json({ok:true,jobs:[]});
}};
const env={INTERNAL_MEDIA:service};
async function send(path,params={},mock=env){
  const req=new Request('https://pt-media-gateway.example.workers.dev'+path,params);
  return handle(req,mock);
}
let r=await send('/health');
assert.equal(r.status,401,'anonymous API access must be denied');
assert.equal(called.length,0);
r=await send('/health',{headers:{Authorization:token,Origin:'https://malicious.example'}});
assert.equal(r.status,403,'foreign website Origin must be denied');
assert.equal(called.length,0);
r=await send('/health',{headers:{Authorization:token,Origin:'https://ximinhu66.github.io'}});
assert.equal(r.status,200);
assert.equal(r.headers.get('Access-Control-Allow-Origin'),'https://ximinhu66.github.io');
assert.equal(called[0].url,'http://adapter:8789/health');
assert.equal(called[0].init.headers.get('Authorization'),token);
r=await send('/jobs',{method:'OPTIONS',headers:{Origin:'https://ximinhu66.github.io','Access-Control-Request-Headers':'authorization,content-type'}});
assert.equal(r.status,204);
assert.match(r.headers.get('Access-Control-Allow-Headers'),/Authorization/);
r=await send('/jobs',{method:'POST',headers:{Origin:'https://ximinhu66.github.io',Authorization:token,'Content-Type':'application/json'},body:JSON.stringify({kind:'novel',indices:[0],url:'https://www.wenku8.net/book/3551.htm'})});
assert.equal(r.status,200);
assert.equal(called[1].url,'http://adapter:8789/jobs');
assert.equal(called[1].init.headers.get('Authorization'),token);
r=await send('/jobs',{method:'DELETE',headers:{Authorization:token}});
assert.equal(r.status,405);
r=await send('/../../evil',{headers:{Authorization:token}});
assert.equal(r.status,404);
r=await send('/download?ticket='+'A'.repeat(43));
assert.equal(r.status,200);
assert.equal(r.headers.get('Content-Disposition'),'attachment; filename="sample.cbz"');
assert.equal(r.headers.get('Access-Control-Allow-Origin'),null);
assert.deepEqual([...new Uint8Array(await r.arrayBuffer())],[0x50,0x4b,0x03,0x04]);
r=await send('/download?ticket=bad');
assert.equal(r.status,400);
r=await send('/resolve',{method:'POST',headers:{Authorization:token,'Content-Type':'application/json'},body:'{'+'x'.repeat(16500)+'}'});
assert.equal(r.status,413);
r=await send('/health',{headers:{Authorization:token}}, {});
assert.equal(r.status,503);
console.log('PASS: no-domain Workers VPC gateway auth, CORS, route allowlist, bounded POST, stream and one-use URL forwarding fixtures');
