const {test}=require('node:test');
const assert=require('node:assert/strict');
const {address,hosts,probe,scan}=require('../../apps/daily-nexus/boox-connector.js');
test('Only the requested subnet and port are accepted',()=>{
 for(const value of ['https://192.168.4.2:8085','192.168.4.0','192.168.4.255','192.168.5.2','127.0.0.1','192.168.4.2:80','192.168.4.2/a','192.168.4.2@evil.com'])assert.throws(()=>address(value));
 assert.equal(address('http://192.168.4.23:8085/'),'http://192.168.4.23:8085');
 assert.equal(hosts('192.168.4.23')[0],'http://192.168.4.23:8085');assert.equal(new Set(hosts()).size,254);
});
test('Device identity must match actual BOOX API; opaque responses stay unverified',async()=>{
 assert.equal((await probe('192.168.4.2',{fetcher:async()=>({ok:true,json:async()=>({type:'server',model:'Note Air'})})})).verified,true);
 assert.equal(await probe('192.168.4.2',{fetcher:async()=>({ok:true,json:async()=>({type:'router',model:'Other'})})}),null);
 assert.equal(await probe('192.168.4.2',{fetcher:async()=>({ok:false,status:404})}),null);
 assert.equal((await probe('192.168.4.2',{fetcher:async(_,o)=>{if(o.mode==='cors')throw Error('CORS');return {type:'opaque'}}})).verified,false);
});
test('Abort and timeouts cancel the underlying network request',async()=>{
 let aborted=false;const fetcher=(_,o)=>new Promise((r,j)=>o.signal.addEventListener('abort',()=>{aborted=true;j(Error('aborted'))}));
 assert.equal(await probe('192.168.4.2',{fetcher,timeout:5}),null);assert.equal(aborted,true);
 const controller=new AbortController();controller.abort();let called=false;assert.equal(await probe('192.168.4.2',{signal:controller.signal,fetcher:()=>{called=true}}),null);assert.equal(called,false);
});
test('Scan prefers last address, limits concurrency, never leaves the requested subnet',async()=>{
 let active=0,max=0;const seen=[],progress=[],found=[];
 const result=await scan({last:'192.168.4.23',permission:false,onProgress:n=>progress.push(n),onFound:x=>found.push(x),probeFn:async url=>{seen.push(url);max=Math.max(max,++active);await new Promise(r=>setTimeout(r,1));--active;return url.includes('.23:')?{url,verified:true,model:'BOOX'}:null}});
 assert.equal(seen[0],'http://192.168.4.23:8085');assert.equal(new Set(seen).size,254);assert.equal(progress.at(-1),254);assert.ok(max<=6);assert.equal(result.length,1);assert.equal(found.length,1);
});
test('Stopping scan prevents new work and late results',async()=>{
 const controller=new AbortController();let calls=0;const found=[];
 await scan({signal:controller.signal,onFound:x=>found.push(x),probeFn:async url=>{calls++;controller.abort();return {url,verified:true}}});
 assert.equal(calls,1);assert.equal(found.length,0);
});
