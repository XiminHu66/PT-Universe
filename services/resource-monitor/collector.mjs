import {actionsUsage} from './actions.mjs';
import {cloudflareDatasets} from './cloudflare.mjs';
// Read-only, request-driven collection. No cron, telemetry or model calls.
const OWNER='XiminHu66',HOUR=3600000;
const memory=new Map(),running=new Map();
const nonnegative=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
const clone=v=>structuredClone(v);
export function automaticConnections(env={}){return [
 {id:'github',name:'GitHub 仓库 / 工作流 / 产物',mode:env.RESOURCE_GITHUB_TOKEN?'已配置私有读取':'公开数据自动读取；私有数据待授权',needs:env.RESOURCE_GITHUB_TOKEN?null:'一次性授权仓库 Metadata / Actions 读取权限；账单另需账户 Plan 读取权限'},
 {id:'billing',name:'GitHub Actions 用量',mode:env.RESOURCE_GITHUB_TOKEN?'准备通过官方 API 核验权限':'缺少一次性只读授权',needs:env.RESOURCE_GITHUB_TOKEN?null:'GitHub 账户 Plan: read'},
 {id:'cloudflare',name:'Cloudflare Workers / KV / D1',mode:env.RESOURCE_CF_TOKEN&&env.RESOURCE_CF_ACCOUNT_ID?'已配置，等待核验':'缺少一次性只读授权',needs:env.RESOURCE_CF_TOKEN&&env.RESOURCE_CF_ACCOUNT_ID?null:'一次性配置 Cloudflare 账户与 Analytics 只读授权'},
 {id:'browser',name:'Cloudflare Browser 时长',mode:'复用现有 binding 读取会话历史下限',needs:null},
 {id:'vps',name:'Oracle VPS 采样',mode:'已复用现有自动采样',needs:null},
 {id:'oci-egress',name:'Oracle 月度流量',mode:'未接通账户 Usage API',needs:'需要单独的 OCI 用量只读身份；网卡瞬时速度不能代替月度流量'},

];}
export class ResourceCollector{
 constructor({fetcher=fetch,clock=Date.now,cache=memory,inflight=running}={}){this.fetcher=(url,options)=>fetcher.call(globalThis,url,options);this.clock=clock;this.cache=cache;this.inflight=inflight;}
 async cached(id,ttl,scope,collect){
  const key=id+':'+scope,now=this.clock(),previous=this.cache.get(key);
  if(previous&&now-previous.at<ttl)return {...clone(previous.value),cacheHit:true};
  if(this.inflight.has(key))return this.inflight.get(key);
  const pending=(async()=>{try{const value=await collect();this.cache.set(key,{at:now,value:clone(value)});return value;}catch(e){
   console.error(JSON.stringify({event:'resource_read_failed',provider:id,errorType:e.name||'Error',code:e.code||'upstream_unavailable'}));
   const retryAt=now+(e.retryAfter||300)*1000,status={provider:id,state:previous&&['repositories','quotas','billing'].some(k=>previous.value[k])?'last_good':'unavailable',checkedAt:new Date(now).toISOString(),error:e.code||'upstream_unavailable',retryAt:new Date(retryAt).toISOString()};
   // Back off even after failures; repeated page visits must not hammer APIs.
   const result={...(previous?clone(previous.value):{}),status};this.cache.set(key,{at:now-ttl+Math.min(ttl,retryAt-now),value:clone(result)});return result;
  }finally{this.inflight.delete(key);}})();this.inflight.set(key,pending);return pending;
 }
 async json(url,headers={},options={}){
  const response=await this.fetcher(url,{...options,headers,redirect:'manual',signal:AbortSignal.timeout(12000)});
  if(!response.ok){await response.body?.cancel();const e=Error('upstream');e.code=[401,403].includes(response.status)?'authorization_required':response.status===429?'rate_limited':'upstream_unavailable';e.retryAfter=response.status===429?Math.min(21600,Math.max(300,Number(response.headers.get('retry-after'))||3600)):300;throw e;}
  const length=Number(response.headers.get('content-length')||0);if(length>2000000)throw Object.assign(Error('oversize'),{code:'response_too_large'});
  const raw=await response.text();if(raw.length>2000000)throw Object.assign(Error('oversize'),{code:'response_too_large'});return JSON.parse(raw);
 }
 ghHeaders(env){return {accept:'application/vnd.github+json','X-GitHub-Api-Version':'2026-03-10','user-agent':'PT-Universe-resource-monitor',...(env.RESOURCE_GITHUB_TOKEN?{authorization:'Bearer '+env.RESOURCE_GITHUB_TOKEN}:{})};}
 async githubInventory(snapshot,env){
  return this.cached('github-inventory',6*HOUR,env.RESOURCE_GITHUB_TOKEN||'public',async()=>{
   const h=this.ghHeaders(env),path=env.RESOURCE_GITHUB_TOKEN?'/user/repos?affiliation=owner&per_page=100&sort=pushed':'/users/'+OWNER+'/repos?per_page=100&sort=pushed';
   const rows=await this.json('https://api.github.com'+path,h);if(!Array.isArray(rows))throw Error('invalid-repositories');
   const owned=rows.filter(r=>r.owner?.login?.toLowerCase()===OWNER.toLowerCase()),bounded=owned.slice(0,35),out=[],deadline=this.clock()+25000;let failures=0;
   // Three at a time; <=36 total subrequests, including the repository list.
   for(let i=0;i<bounded.length;i+=3){if(this.clock()>deadline){failures++;break;}await Promise.all(bounded.slice(i,i+3).map(async r=>{
    const old=snapshot.repositories.find(x=>x.name===r.name),item={...(old||{}),name:r.name,visibility:r.private?'private':'public',url:'https://github.com/'+OWNER+'/'+encodeURIComponent(r.name),updatedAt:r.pushed_at,inventoryObservedAt:new Date(this.clock()).toISOString(),note:(r.private?'私有':'公开')+'仓库 · 自动读取',workflows:old?.workflows||[]};
    delete item.artifacts;delete item.cache;
    try{const result=await this.json('https://api.github.com/repos/'+OWNER+'/'+encodeURIComponent(r.name)+'/actions/workflows?per_page=100',h);if(!Array.isArray(result.workflows))throw Error('invalid-workflows');item.workflows=result.workflows.map(w=>{const prior=old?.workflows?.find(x=>x.path===w.path);return {...prior,name:w.name,path:w.path,state:w.state,url:w.html_url,events:prior?.events||[],crons:prior?.crons||[],runners:prior?.runners||[],note:prior?'状态自动更新；触发规则来自源码盘点':'新发现工作流；触发规则尚未读取',observedAt:new Date(this.clock()).toISOString()};});item.workflowsPartial=result.total_count>100;}
    catch{failures++;item.note+='；工作流读取失败，保留上次结果';}
    out.push(item);
   }));}
   const touched=new Set(out.map(r=>r.name)),kept=snapshot.repositories.filter(r=>!touched.has(r.name));
   return {repositories:[...out,...kept],status:{provider:'github-inventory',state:failures||owned.length>35||rows.length===100?'partial':'ok',coverage:env.RESOURCE_GITHUB_TOKEN?'当前令牌可见仓库':'公开仓库；私有项目保留最近盘点',checkedAt:new Date(this.clock()).toISOString(),observedAt:new Date(this.clock()).toISOString(),requestsBound:36}};
  });
 }
 async githubStorage(snapshot,env){
  return this.cached('github-storage',HOUR,env.RESOURCE_GITHUB_TOKEN||'public',async()=>{
   const h=this.ghHeaders(env),path=env.RESOURCE_GITHUB_TOKEN?'/user/repos?affiliation=owner&per_page=100&sort=pushed':'/users/'+OWNER+'/repos?per_page=100&sort=pushed',listing=await this.json('https://api.github.com'+path,h);
   if(!Array.isArray(listing))throw Error('invalid-repositories');
   const eligible=listing.filter(r=>r.owner?.login?.toLowerCase()===OWNER.toLowerCase()).map(r=>({name:r.name,visibility:r.private?'private':'public'})).filter(r=>{const known=snapshot.repositories.find(x=>x.name===r.name);return !known||known.workflows?.length;});
   const repos=eligible.slice(0,20),items=[],deadline=this.clock()+25000;let failures=eligible.length>20?1:0;
   for(let i=0;i<repos.length;i+=3){if(this.clock()>deadline){failures++;break;}await Promise.all(repos.slice(i,i+3).map(async repo=>{
    const base='https://api.github.com/repos/'+OWNER+'/'+encodeURIComponent(repo.name),results=await Promise.allSettled([this.json(base+'/actions/artifacts?per_page=100',h),this.json(base+'/actions/cache/usage',h)]),row={name:repo.name};
    if(results[0].status==='fulfilled'&&Array.isArray(results[0].value.artifacts)){const d=results[0].value,a=d.artifacts.filter(x=>!x.expired);row.artifacts={bytes:a.reduce((n,x)=>n+(nonnegative(x.size_in_bytes)?x.size_in_bytes:0),0),count:a.length,partial:d.total_count>100,observedAt:new Date(this.clock()).toISOString()};}else failures++;
    if(results[1].status==='fulfilled'&&nonnegative(results[1].value.active_caches_size_in_bytes))row.cache={bytes:results[1].value.active_caches_size_in_bytes,count:results[1].value.active_caches_count,observedAt:new Date(this.clock()).toISOString()};else failures++;
    items.push(row);
   }));}
   return {repositories:items,status:{provider:'github-storage',state:failures?'partial':'ok',coverage:env.RESOURCE_GITHUB_TOKEN?'有工作流的可见仓库及新仓库，最多20个':'有工作流的公开仓库及新仓库；私有产物待授权',observedAt:new Date(this.clock()).toISOString(),checkedAt:new Date(this.clock()).toISOString(),requestsBound:41}};
  });
 }
 async githubBilling(snapshot,env){
  if(!env.RESOURCE_GITHUB_TOKEN)return {status:{provider:'github-billing',state:'needs_authorization',checkedAt:new Date(this.clock()).toISOString()}};
  return this.cached('github-billing',HOUR,env.RESOURCE_GITHUB_TOKEN+new Date(this.clock()).toISOString().slice(0,7),async()=>{
   const d=new Date(this.clock()),query=`year=${d.getUTCFullYear()}&month=${d.getUTCMonth()+1}`,base=`https://api.github.com/users/${OWNER}/settings/billing/usage`,h=this.ghHeaders(env),at=d.toISOString();
   const results=await Promise.allSettled([this.json(base+'/summary?'+query+'&product=actions',h),this.json(base+'?'+query,h),this.json('https://api.github.com/user/repos?affiliation=owner&per_page=100&sort=pushed',h)]);
   let usage=null,billing;
   if(results[1].status==='fulfilled'&&results[2].status==='fulfilled')try{usage=actionsUsage(results[1].value,results[2].value,snapshot,at);}catch{}
   if(results[0].status==='fulfilled'&&Array.isArray(results[0].value.usageItems)){
    const rows=results[0].value.usageItems.filter(x=>String(x.product).toLowerCase()==='actions').map(x=>({sku:String(x.sku||'').slice(0,100),unit:String(x.unitType||''),quantity:nonnegative(x.grossQuantity)?x.grossQuantity:null,grossUSD:nonnegative(x.grossAmount)?x.grossAmount:null,discountUSD:nonnegative(x.discountAmount)?x.discountAmount:null,netUSD:nonnegative(x.netAmount)?x.netAmount:null}));
    billing={rows,grossUSD:rows.reduce((n,r)=>n+(r.grossUSD||0),0),netUSD:rows.reduce((n,r)=>n+(r.netUSD||0),0),observedAt:at,note:'计费详情；应付金额与免费额度消耗分开。GB-hours 不代表当前文件占用。'};
   }
   if(!usage&&!billing)throw Object.assign(Error('usage-unavailable'),{code:results.some(r=>r.status==='rejected'&&r.reason?.code==='authorization_required')?'authorization_required':'upstream_unavailable'});
   return {actionUsage:usage,...(billing?{billing}:{}),status:{provider:'github-billing',state:!usage||usage.coveragePartial?'partial':'ok',coverage:usage?'私有运行用量与附带额度占比；公共标准运行单列，不占免费池':'用量报告暂不可读；账单不代替额度消耗',requestsBound:3,checkedAt:at,observedAt:at}};
  });
 }
 async cloudflare(snapshot,env){
  if(!env.RESOURCE_CF_TOKEN||!/^[a-f0-9]{32}$/i.test(env.RESOURCE_CF_ACCOUNT_ID||''))return {status:{provider:'cloudflare',state:'needs_authorization',checkedAt:new Date(this.clock()).toISOString()}};
  return this.cached('cloudflare',HOUR,env.RESOURCE_CF_TOKEN+env.RESOURCE_CF_ACCOUNT_ID+new Date(this.clock()).toISOString().slice(0,10),async()=>{
   const at=new Date(this.clock()).toISOString(),account=env.RESOURCE_CF_ACCOUNT_ID,h={authorization:'Bearer '+env.RESOURCE_CF_TOKEN,'content-type':'application/json'},updates=[],checks=[],groups=cloudflareDatasets(at);
   for(let i=0;i<groups.length;i+=3)await Promise.all(groups.slice(i,i+3).map(async g=>{try{
    const r=await this.json('https://api.cloudflare.com/client/v4/graphql',h,{method:'POST',body:JSON.stringify({query:`query { viewer { accounts(filter: {accountTag: "${account}"}) { ${g.body} } } }`})});
    if(r.errors?.length)throw Object.assign(Error('query-denied'),{code:r.errors.some(e=>/permission|authoriz/i.test(String(e.message)))?'authorization_required':'dataset_unavailable'});
    const a=r.data?.viewer?.accounts;if(!Array.isArray(a)||a.length!==1)throw Error('account-not-visible');
    const values=g.take(a[0]);if(values.some(([,used])=>!nonnegative(used)))throw Error('invalid-usage');
    for(const [id,used]of values)updates.push({id,used,observedAt:at,source:'Cloudflare 官方 Analytics API · 自动读取',note:g.note||'UTC 当日账户聚合；上限为 Free 套餐参考，Analytics 可能有延迟。',coveragePartial:!!g.partial,maxAgeHours:g.partial?24:2});
    checks.push({id:g.key,name:g.name,ids:g.ids,state:g.partial?'partial':'ok'});
   }catch(e){checks.push({id:g.key,name:g.name,ids:g.ids,state:'unavailable',error:e.code||'dataset_unavailable'});}}));
   const failures=checks.filter(c=>c.state==='unavailable').length;
   return {quotas:updates,status:{provider:'cloudflare',state:failures===groups.length?'unavailable':failures?'partial':'ok',coverage:'Workers / KV / D1 / Queues；存储为有样本资源的峰值估计',checks,checkedAt:at,observedAt:updates.length?at:null,requestsBound:6}};
  });
 }
 async collect(provider,snapshot,env={}){const methods={'github-inventory':'githubInventory','github-storage':'githubStorage','github-billing':'githubBilling',cloudflare:'cloudflare'};if(!methods[provider])return null;return this[methods[provider]](snapshot,env);}
}
