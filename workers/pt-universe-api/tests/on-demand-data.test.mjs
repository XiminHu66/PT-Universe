import assert from 'node:assert/strict';import {build} from 'esbuild';
async function load(path){const built=await build({entryPoints:[path],bundle:true,format:'esm',platform:'node',write:false});return import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));}
const D=await load('src/on-demand-data.ts'),calls=[];
const transport=async(_,path,method)=>{calls.push({path,method});return Response.json({state:'fresh',data:{price:123}})};
const req=(path,method='GET',origin='https://ximinhu66.github.io')=>new Request('https://api.example'+path,{method,headers:{origin}});
assert.equal((await D.onDemandRoute(req('/api/on-demand/stock?symbol=%5EGSPC','POST'),{},transport)).status,200);
assert.equal(calls[0].path,'/hub/api/on-demand/stock?symbol=%5EGSPC');
assert.equal((await D.onDemandRoute(req('/api/on-demand/3c','POST','https://evil'),{},transport)).status,403);
assert.throws(()=>D.publicDatasetPath(req('/api/on-demand/stock?symbol=NVDA&url=https://evil')));
assert.equal((await D.onDemandRoute(req('/api/on-demand/3c','DELETE'),{},transport)).status,405);
assert.equal(calls.length,1);
const H=await load('src/content-hub.ts'),keys=[];
const env={PT_UNIVERSE_DATA:{async get(key){keys.push(key);return {checked_at:new Date().toISOString(),items:[],days:[]}}}};
await H.hubTick(env);
assert.ok(keys.length);assert.ok(keys.every(k=>!/^hub\/(topics|assets|discover)/.test(k)),'scheduled prewarm must never read or collect selected directories');
assert.ok(keys.some(k=>k.includes('calendar')));assert.ok(keys.some(k=>k.includes('anime1')));
console.log('PASS: public dataset boundary and scheduled hub excludes selected sources while retaining Anime1/calendar');
