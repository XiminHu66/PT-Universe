import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
import {consumeChat} from '../../apps/anythingllm/core.mjs';
const api='https://pt-universe-api.summer07-nanjolno.workers.dev',id=randomUUID(),token=randomBytes(32).toString('base64url'),deployToken=randomBytes(32).toString('hex');
const headers={origin:'https://ximinhu66.github.io','user-agent':'PT-Chat-deployment-check','content-type':'application/json'};
const report={testedAt:new Date().toISOString(),ok:false};let configured=false,registered=false,granted=false;
async function secret(args,input=''){await new Promise((resolve,reject)=>{const c=spawn('npx',['wrangler',...args,'--name','pt-universe-api'],{stdio:['pipe','pipe','pipe']});c.stdout.resume();c.stderr.resume();c.stdin.end(input);c.on('error',reject);c.on('exit',code=>code===0?resolve():reject(Error('Temporary deployment credential operation failed')))})}
async function post(path,body,bearer){return fetch(api+path,{method:'POST',headers:{...headers,...(bearer?{authorization:'Bearer '+bearer}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(100000)})}
async function admin(action){return post('/api/workbench/ai-admin',{action,owner:id},deployToken)}
try{
 const catalog=await fetch(api+'/api/anythingllm/providers',{headers,signal:AbortSignal.timeout(30000)});assert.equal(catalog.status,200);const providers=(await catalog.json()).providers;assert.ok(providers.length>=28);report.providers=providers.length;
 const body={provider:'gemini',model:'gemini-3.5-flash-lite',owner:id,messages:[{role:'user',content:'请只回复：连接正常'}],maxTokens:256};
 assert.equal((await post('/api/anythingllm/chat',body)).status,401);report.unauthorizedBlocked=true;
 await secret(['secret','put','RESEARCH_PROBE_AUTH'],JSON.stringify({token:deployToken,expiresAt:Date.now()+10*60000}));configured=true;
 assert.equal((await post('/api/sync/register',{id,token})).status,201);registered=true;
 assert.equal((await post('/api/anythingllm/chat',body,token)).status,403);report.unenrolledBlocked=true;
 let grant;for(let i=0;i<4;i++){grant=await admin('grant-test');if(grant.status===200)break;if(grant.status!==401)break;await new Promise(r=>setTimeout(r,3000))}assert.equal(grant.status,200);granted=true;
 const response=await post('/api/anythingllm/chat',body,token);const result=await consumeChat(response,()=>{});assert.ok(result.content.trim());report.gemini={model:result.model,characters:result.content.length,streamed:true};
 assert.equal((await post('/api/anythingllm/chat',{...body,model:'paid-unapproved-model',allowPaid:true},token)).status,403);report.sharedPaidModelBlocked=true;report.ok=true;
}catch(e){report.error=e.message;process.exitCode=1}
finally{
 if(registered){try{if(!granted){const r=await admin('grant-test');granted=r.ok}if(granted){const r=await admin('revoke-test');assert.ok(r.ok);report.testAccountRemoved=true}else{report.testAccountRemoved=false;process.exitCode=1}}catch{report.testAccountRemoved=false;process.exitCode=1}}
 if(configured){try{await secret(['secret','delete','RESEARCH_PROBE_AUTH']);report.temporaryCredentialRemoved=true}catch{report.temporaryCredentialRemoved=false;process.exitCode=1}}
 await writeFile('/tmp/anythingllm-live.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}
