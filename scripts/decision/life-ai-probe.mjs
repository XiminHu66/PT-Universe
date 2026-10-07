import {randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
const api='https://pt-universe-api.summer07-nanjolno.workers.dev';
const headers={'user-agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36',origin:'https://ximinhu66.github.io',accept:'application/json','content-type':'application/json'};
const token=randomBytes(32).toString('hex'),report={testedAt:new Date().toISOString(),results:[]};
function wrangler(args,input=''){return new Promise((resolve,reject)=>{const c=spawn('npx',['wrangler',...args,'--name','pt-universe-api'],{env:process.env,stdio:['pipe','pipe','pipe']});c.stdout.resume();c.stderr.resume();c.stdin.end(input);c.on('error',()=>reject(Error('Wrangler failed')));c.on('exit',code=>code===0?resolve():reject(Error('Wrangler secret operation failed')));})}
async function probe(body,auth=false){const r=await fetch(api+'/api/life/gemini-probe',{method:'POST',headers:{...headers,...(auth?{authorization:'Bearer '+token}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(90000)});return {...await r.json().catch(()=>({status:'NON_JSON_RESPONSE'})),workerHttpStatus:r.status};}
let configured=false;
try{
 for(let i=0;i<10;i++){report.unauthenticatedStatus=(await probe({phase:'meal',model:'gemini-3.5-flash-lite'})).workerHttpStatus;if(report.unauthenticatedStatus===401)break;await new Promise(r=>setTimeout(r,3000));}
 if(report.unauthenticatedStatus!==401)throw Error('Probe authentication check failed');
 await wrangler(['secret','put','RESEARCH_PROBE_AUTH'],JSON.stringify({token,expiresAt:Date.now()+15*60000}));configured=true;
 let initial;for(let i=0;i<8;i++){initial=await probe({phase:'meal',model:'gemini-3.5-flash-lite'},true);if(initial.workerHttpStatus!==401)break;await new Promise(r=>setTimeout(r,3000));}
 report.results.push(initial);
 if(!initial.selectionValid)report.results.push(await probe({phase:'meal',model:'gemini-3.8-flash'},true));
 for(const model of ['gemini-2.5-flash-lite','gemini-2.5-flash','gemini-3.5-flash-lite','gemini-3.8-flash']){const r=await probe({phase:'maps',model},true);report.results.push(r);if(r.grounded)break;}
 report.mealAvailable=report.results.some(r=>r.selectionValid);report.mapsAvailable=report.results.some(r=>r.grounded);
 // Capability failures are recorded explicitly; the classic tools remain usable.
}catch(e){report.error=e.message;process.exitCode=1}
finally{if(configured){try{await wrangler(['secret','delete','RESEARCH_PROBE_AUTH']);report.temporaryCredentialRemoved=true}catch{report.temporaryCredentialRemoved=false;report.expiresWithinMinutes=15}}
 await writeFile('/tmp/life-ai-probe.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
