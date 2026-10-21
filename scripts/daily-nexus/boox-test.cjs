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
test('Remembered reachable device connects without a subnet scan',async()=>{
 const seen=[],phases=[];
 const result=await scan({last:'192.168.4.23',onPhase:p=>phases.push(p),probeFn:async(url,options)=>{seen.push(url);assert.equal(options.timeout,650);return {url,verified:true,model:'BOOX'}}});
 assert.deepEqual(seen,['http://192.168.4.23:8085']);assert.deepEqual(phases,['reconnect']);assert.equal(result.length,1);
});
test('Fast pass probes all addresses with bounded 32-way concurrency',async()=>{
 let active=0,max=0;const seen=[],progress=[];
 await scan({permission:false,onProgress:n=>progress.push(n),probeFn:async(url,options)=>{seen.push([url,options.timeout]);max=Math.max(max,++active);await new Promise(r=>setTimeout(r,1));--active;return null}});
 assert.equal(new Set(seen.map(x=>x[0])).size,254);assert.equal(seen.length,508);assert.equal(progress.at(-1),254);assert.equal(max,32);assert.ok(seen.slice(0,254).every(x=>x[1]===450));assert.ok(seen.slice(254).every(x=>x[1]===1600));
});
test('First responsive opaque candidate opens immediately and aborts remaining work',async()=>{
 const seen=[],found=[];let aborted=0;
 const result=await scan({onFound:x=>found.push(x),probeFn:async(url,{signal})=>{
  seen.push(url);if(url.includes('.23:'))return {url,verified:false};
  return new Promise(resolve=>{require('node:events').setMaxListeners(100,signal);signal.addEventListener('abort',()=>{aborted++;resolve(null)},{once:true})});
 }});
 assert.equal(result.length,1);assert.equal(found[0].verified,false);assert.ok(seen.length<=32);assert.ok(aborted>0);assert.ok(seen.length<254);
});
test('Slow device missed by fast pass is found by retry pass',async()=>{
 const phases=[];let fast=0,slow=0;
 const hits=await scan({onPhase:p=>phases.push(p),probeFn:async(url,{timeout})=>{if(timeout===450)fast++;else slow++;return timeout===1600&&url.includes('.23:')?{url,verified:true}:null}});
 assert.deepEqual(phases,['fast','retry']);assert.equal(fast,254);assert.ok(slow>0);assert.equal(hits.length,1);
});
test('Permission wait is excluded from the device timeout',async()=>{
 let allow,respond;
 const permissionReady=new Promise(r=>allow=r);
 const result=probe('192.168.4.23',{timeout:5,permissionReady,fetcher:(_,o)=>new Promise((r,j)=>{
  respond=()=>r({ok:true,json:async()=>({type:'server',model:'BOOX'})});o.signal.addEventListener('abort',()=>j(Error('aborted')));
 })});
 await new Promise(r=>setTimeout(r,20));respond();allow();assert.equal((await result).verified,true);
});
test('Permission grant starts the normal timeout for an unreachable device',async()=>{
 let allow;const permissionReady=new Promise(r=>allow=r);
 const result=probe('192.168.4.23',{timeout:5,permissionReady,fetcher:(_,o)=>new Promise((r,j)=>o.signal.addEventListener('abort',()=>j(Error('aborted'))))});
 allow();assert.equal(await result,null);
});
test('Stopping scan prevents new work and late results',async()=>{
 const controller=new AbortController();let calls=0;const found=[];
 await scan({permission:true,signal:controller.signal,onFound:x=>found.push(x),probeFn:async url=>{calls++;controller.abort();return {url,verified:true}}});
 assert.equal(calls,1);assert.equal(found.length,0);
});
