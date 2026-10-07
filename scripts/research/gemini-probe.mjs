import {randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {writeFile} from 'node:fs/promises';

// Runs in the deployment job. The Gemini key never leaves the Worker.
const api='https://pt-universe-api.summer07-nanjolno.workers.dev';
const token=randomBytes(32).toString('hex');
const report={testedAt:new Date().toISOString(),kind:'fixed public-paper deployment probe',results:[]};
const path=process.env.GEMINI_PROBE_REPORT||'/tmp/research-gemini-probe.json';
function wrangler(args,input=''){
  return new Promise((resolve,reject)=>{
    const child=spawn('npx',['wrangler',...args,'--name','pt-universe-api'],{env:process.env,stdio:['pipe','pipe','pipe']});
    // Capture and discard CLI output so the temporary credential cannot enter logs.
    child.stdout.resume();child.stderr.resume();child.stdin.end(input);
    child.on('error',()=>reject(Error('Wrangler process failed')));
    child.on('exit',code=>code===0?resolve():reject(Error('Wrangler secret operation failed')));
  });
}
async function probe(phase,model){
  const r=await fetch(api+'/api/workbench/gemini-probe',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({phase,model}),signal:AbortSignal.timeout(100_000)});
  let data;try{data=await r.json()}catch{data={status:'NON_JSON_RESPONSE'}}
  return {...data,workerHttpStatus:r.status};
}
let configured=false;
try{
  const denied=await fetch(api+'/api/workbench/gemini-probe',{method:'POST',headers:{'content-type':'application/json'},body:'{"phase":"connection"}'});
  if(denied.status!==401)throw Error('Diagnostic endpoint must require authentication');
  await wrangler(['secret','put','RESEARCH_PROBE_AUTH'],JSON.stringify({token,expiresAt:Date.now()+15*60_000}));configured=true;
  let connection;
  for(let attempt=0;attempt<8;attempt++){
    connection=await probe('connection');
    if(connection.workerHttpStatus!==401)break;
    await new Promise(resolve=>setTimeout(resolve,3000));
  }
  report.results.push(connection);
  if(!connection.ok)throw Error('Worker Gemini connection failed: '+(connection.status||connection.workerHttpStatus));
  // Try only allowlisted models that Google actually advertises to this key.
  const preferred=['gemini-3.8-flash','gemini-2.5-flash','gemini-2.5-flash-lite','gemini-3.5-flash-lite'];
  let selected;
  for(const model of preferred.filter(m=>connection.models.some(x=>x.name===m))){
    const extraction=await probe('extract',model);report.results.push(extraction);
    if(extraction.ok){selected=model;break}
    // Never retry the same generation or stress-test the account to discover limits.
    if(![400,404,429].includes(extraction.httpStatus))break;
  }
  if(selected){
    for(const phase of ['compare','topic'])report.results.push(await probe(phase,selected));
    report.selectedModel=selected;
  }else report.generationAvailable=false;
}catch(e){report.error=e.message;process.exitCode=1}
finally{
  if(configured){try{await wrangler(['secret','delete','RESEARCH_PROBE_AUTH']);report.temporaryCredentialRemoved=true}catch{report.temporaryCredentialRemoved=false;report.temporaryCredentialExpiresWithinMinutes=15}}
  await writeFile(path,JSON.stringify(report,null,2));
  // Results contain only usage counts, fixed source labels and validation statistics.
  console.log(JSON.stringify(report,null,2));
}
