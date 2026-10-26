const {test}=require('node:test');
const assert=require('node:assert/strict');
const {address,hosts,probe,scan}=require('../../apps/daily-nexus/boox-connector.js');
test('Private IPv4 only, port fixed; home /22 and remembered subnet are covered',()=>{
 for(const value of ['https://192.168.4.2:8085','192.168.999.1','8.8.8.8','172.32.1.2','127.0.0.1','192.168.4.2:80','192.168.4.2/a','192.168.4.2@evil.com'])assert.throws(()=>address(value));
 assert.equal(address('http://192.168.4.23:8085/'),'http://192.168.4.23:8085');
 assert.equal(hosts('192.168.4.23')[0],'http://192.168.4.23:8085');assert.equal(new Set(hosts()).size,1022);
});
test('Native page is probed before optional metadata; firmware 404 and CORS still return candidates',async()=>{
 const calls=[];
 const info=await probe('192.168.4.2',{fetcher:async(url,o)=>{calls.push([url,o.mode]);return url.endsWith('/api/device')?{ok:true,json:async()=>({type:'server',model:'Note Air'})}:{type:'opaque'}}});
 assert.equal(info.verified,true);assert.deepEqual(calls.map(x=>x[1]),['no-cors','cors']);
 assert.equal(await probe('192.168.4.2',{fetcher:async(url)=>url.endsWith('/api/device')?{ok:true,json:async()=>({type:'router',model:'Other'})}:{type:'opaque'}}),null);
 for(const metadata of [async()=>({ok:false,status:404}),async()=>({ok:true,json:async()=>{throw Error('HTML')}}),async()=>{throw Error('CORS')}]) {
  assert.equal((await probe('192.168.4.2',{fetcher:async(url,o)=>{assert.equal(o.credentials,'omit');if(url.endsWith('/api/device'))return metadata();assert.equal(o.redirect,'follow');return {type:'opaque'}}})).verified,false);
 }
});
test('A stalled metadata request cannot hide the reachable native page',async()=>{
 assert.equal((await probe('192.168.4.2',{timeout:10,fetcher:async(url,o)=>url.endsWith('/api/device')?new Promise((r,j)=>o.signal.addEventListener('abort',()=>j(Error('abort')))):{type:'opaque'}})).verified,false);
});
test('Address changes to another home subnet and manual private subnets are discoverable',async()=>{
 assert.equal(address('10.0.1.25'),'http://10.0.1.25:8085');
 assert.equal(hosts('192.168.6.2')[0],'http://192.168.6.2:8085');
 assert.equal(hosts('10.0.1.25').length,256);
 assert.ok(hosts().includes('http://192.168.5.0:8085'));
 const hits=await scan({probeFn:async(url)=>url==='http://192.168.6.42:8085'?{url,verified:true}:null});
 assert.equal(hits[0].url,'http://192.168.6.42:8085');
});
test('Abort and timeouts cancel the underlying network request',async()=>{
 let aborted=false;const fetcher=(_,o)=>new Promise((r,j)=>o.signal.addEventListener('abort',()=>{aborted=true;j(Error('aborted'))}));
 assert.equal(await probe('192.168.4.2',{fetcher,timeout:5}),null);assert.equal(aborted,true);
 const controller=new AbortController();controller.abort();let called=false;assert.equal(await probe('192.168.4.2',{signal:controller.signal,fetcher:()=>{called=true}}),null);assert.equal(called,false);
});
test('Remembered reachable device connects without a subnet scan',async()=>{
 const seen=[],phases=[];
 const result=await scan({last:'192.168.4.23',onPhase:p=>phases.push(p),probeFn:async(url,options)=>{seen.push(url);assert.equal(options.timeout,2500);return {url,verified:true,model:'BOOX'}}});
 assert.deepEqual(seen,['http://192.168.4.23:8085']);assert.deepEqual(phases,['reconnect']);assert.equal(result.length,1);
});
test('Fast pass probes all addresses with bounded 24-way concurrency',async()=>{
 let active=0,max=0;const seen=[],progress=[];
 await scan({permission:false,onProgress:n=>progress.push(n),probeFn:async(url,options)=>{seen.push([url,options.timeout]);max=Math.max(max,++active);await new Promise(r=>setTimeout(r,1));--active;return null}});
 assert.equal(new Set(seen.map(x=>x[0])).size,1022);assert.equal(seen.length,2044);assert.equal(progress.at(-1),1022);assert.equal(max,24);assert.ok(seen.slice(0,1022).every(x=>x[1]===1200));assert.ok(seen.slice(1022).every(x=>x[1]===4000));
});
test('First responsive opaque candidate opens immediately and aborts remaining work',async()=>{
 const seen=[],found=[];let aborted=0;
 const result=await scan({onFound:x=>found.push(x),probeFn:async(url,{signal})=>{
  seen.push(url);if(url.includes('.23:'))return {url,verified:false};
  return new Promise(resolve=>{require('node:events').setMaxListeners(100,signal);signal.addEventListener('abort',()=>{aborted++;resolve(null)},{once:true})});
 }});
 assert.equal(result.length,1);assert.equal(found[0].verified,false);assert.ok(seen.length<=24);assert.ok(aborted>0);assert.ok(seen.length<1022);
});
test('Slow device missed by fast pass is found by retry pass',async()=>{
 const phases=[];let fast=0,slow=0;
 const hits=await scan({onPhase:p=>phases.push(p),probeFn:async(url,{timeout})=>{if(timeout===1200)fast++;else slow++;return timeout===4000&&url.includes('.23:')?{url,verified:true}:null}});
 assert.deepEqual(phases,['fast','retry']);assert.equal(fast,1022);assert.ok(slow>0);assert.equal(hits.length,1);
});
test('Permission wait is excluded from the device timeout',async()=>{
 let allow,respond;
 const permissionReady=new Promise(r=>allow=r);
 const result=probe('192.168.4.23',{timeout:5,permissionReady,fetcher:(url,o)=>url.endsWith('/api/device')?Promise.resolve({ok:true,json:async()=>({type:'server',model:'BOOX'})}):new Promise((r,j)=>{
  respond=()=>r({type:'opaque'});o.signal.addEventListener('abort',()=>j(Error('aborted')));
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

test('Unresolved permission never fans out to the whole network',async()=>{
 let calls=0;
 await scan({permission:true,permissionReady:new Promise(()=>{}),probeFn:async()=>{calls++;return null}});
 assert.equal(calls,1);
});
