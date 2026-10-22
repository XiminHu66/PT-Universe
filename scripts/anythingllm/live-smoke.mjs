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
 const catalog=await fetch(api+'/api/anythingllm/providers',{headers,signal:AbortSignal.timeout(30000)});assert.equal(catalog.status,200);const providers=(await catalog.json()).providers;assert.ok(providers.length>=11);assert.ok(providers.every(p=>p.kind==='free'));report.providers=providers.length;
 const modelResponse=await fetch(api+'/api/anythingllm/models?provider=gemini',{headers,signal:AbortSignal.timeout(90000)});assert.equal(modelResponse.status,200);const modelReport=await modelResponse.json();assert.equal(modelReport.fallback,false);assert.equal(modelReport.source,'google-pricing-and-models');assert.ok(modelReport.models.length>2);assert.ok(!modelReport.models.some(m=>/tts|live|image|embedding/.test(m.id)));report.freeModels=modelReport;
 const body={provider:'gemini',model:'gemini-3.5-flash-lite',owner:id,messages:[{role:'system',content:'你是一位清晰、诚实、有帮助的助手。默认使用中文回答。'},{role:'user',content:'你是什么模型'}],maxTokens:2048,temperature:0.7};
 assert.equal((await post('/api/anythingllm/chat',body)).status,401);report.unauthorizedBlocked=true;
 await secret(['secret','put','RESEARCH_PROBE_AUTH'],JSON.stringify({token:deployToken,expiresAt:Date.now()+10*60000}));configured=true;
 assert.equal((await post('/api/sync/register',{id,token})).status,201);registered=true;
 assert.equal((await post('/api/anythingllm/chat',body,token)).status,403);report.unenrolledBlocked=true;
 let grant;for(let i=0;i<4;i++){grant=await admin('grant-test');if(grant.status===200)break;if(grant.status!==401)break;await new Promise(r=>setTimeout(r,3000))}assert.equal(grant.status,200);granted=true;
 report.browserCases=[];
 async function browserCase(name,payload){
  try{const r=await post('/api/anythingllm/chat',payload,token);const status=r.status;const errorBody=!r.ok?await r.clone().text():null;const answer=await consumeChat(r,()=>{});assert.ok(answer.content.trim());const row={name,ok:true,status,model:answer.model||payload.model,characters:answer.content.length};report.browserCases.push(row);console.log(JSON.stringify(row));return answer.content}catch(e){const row={name,ok:false,model:payload.model,error:e.message,status:e.status};report.browserCases.push(row);console.log(JSON.stringify(row));return ''}
 }
 await browserCase('daily-workspace-system-and-2048-tokens-lite',body);
 const alternative=modelReport.models.find(m=>m.id==='gemini-3.8-flash')||modelReport.models.find(m=>m.id!==body.model);assert.ok(alternative);
 const answer=await browserCase('screenshot-model-and-question',{...body,model:alternative.id});
 if(answer)await browserCase('multi-turn-with-system',{...body,model:alternative.id,messages:[...body.messages,{role:'assistant',content:answer},{role:'user',content:'请用一句话告诉我你能帮我做什么。'}]});
 const gemma=modelReport.models.find(m=>m.id.startsWith('gemma-'));if(gemma)await browserCase('gemma-with-default-workspace',{...body,model:gemma.id});
 assert.ok(report.browserCases.every(x=>x.ok),'One or more actual browser payloads failed');
 assert.equal((await post('/api/anythingllm/chat',{...body,model:'paid-unapproved-model',allowPaid:true},token)).status,400);report.sharedPaidModelBlocked=true;report.ok=true;
}catch(e){report.error=e.message;process.exitCode=1}
finally{
 if(registered){try{if(!granted){const r=await admin('grant-test');granted=r.ok}if(granted){const r=await admin('revoke-test');assert.ok(r.ok);report.testAccountRemoved=true}else{report.testAccountRemoved=false;process.exitCode=1}}catch{report.testAccountRemoved=false;process.exitCode=1}}
 if(configured){try{await secret(['secret','delete','RESEARCH_PROBE_AUTH']);report.temporaryCredentialRemoved=true}catch{report.temporaryCredentialRemoved=false;process.exitCode=1}}
 await writeFile('/tmp/anythingllm-live.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}
