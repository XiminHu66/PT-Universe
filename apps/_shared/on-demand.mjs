// No timers survive a refresh. GET polling only observes the one explicit job.
export const API='https://pt-universe-api.summer07-nanjolno.workers.dev';
const pending=new Map();
export function refreshData(dataset,{symbol='',force=false,onStatus=()=>{}}={}){
 const key=dataset+':'+symbol;if(pending.has(key))return pending.get(key);
 const task=(async()=>{
  const query=new URLSearchParams();if(symbol)query.set('symbol',symbol);if(force)query.set('force','1');
  const url=API+'/api/on-demand/'+dataset+'?'+query;
  async function request(method){const r=await fetch(url,{method,cache:'no-store',signal:AbortSignal.timeout(20000)});const d=await r.json();if(!r.ok)throw Error(d.error||'更新暂不可用');return d;}
  let result=await request('POST');onStatus(result);
  const deadline=Date.now()+330000;
  while(result.state==='running'&&Date.now()<deadline){await new Promise(r=>setTimeout(r,5000));result=await request('GET');onStatus(result);}
  if(result.state==='running')throw Error('采集仍在进行，可稍后再次刷新查看结果');
  if(['error','limited','busy'].includes(result.state))throw Error(result.error||'稍后重试');
  if(!result.data)throw Error('暂无可用数据');return result;
 })().finally(()=>pending.delete(key));pending.set(key,task);return task;
}
