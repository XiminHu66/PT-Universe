import assert from 'node:assert/strict';
import {createOnDemandData} from './gateway.mjs';
const siteOrigin='https://pt.example',calls=[];
const handler=createOnDemandData({siteOrigin,transport:async(url,init)=>{calls.push({url,method:init.method});return Response.json({state:'fresh',data:{price:123}})}});
async function request(path,method='GET',origin=siteOrigin){const res={writeHead(s){this.status=s},end(v){this.value=JSON.parse(v)}};const handled=await handler({method,headers:{origin}},res,new URL(path,siteOrigin));return {...res,handled};}
assert.equal((await request('/elsewhere')).handled,false);
assert.equal((await request('/hub/api/on-demand/stock?symbol=NVDA','POST')).status,200);
assert.equal(calls.length,1);assert.equal(calls[0].url,'http://pt-on-demand-data:8080/stock?symbol=NVDA');
for(const path of ['/hub/api/on-demand/private','/hub/api/on-demand/stock?symbol=../secret','/hub/api/on-demand/3c?url=https://evil','/hub/api/on-demand/stock'])assert.equal((await request(path,'POST')).status,400);
assert.equal((await request('/hub/api/on-demand/3c','POST','https://evil')).status,403);
assert.equal((await request('/hub/api/on-demand/3c','DELETE')).status,405);assert.equal(calls.length,1);
console.log('PASS: fixed public capabilities, Origin/method/input boundary and no arbitrary proxy');
