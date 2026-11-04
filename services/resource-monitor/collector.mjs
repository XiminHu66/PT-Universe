// Read-only, request-driven collection. No cron, telemetry or model calls.
const OWNER='XiminHu66',HOUR=3600000;
const memory=new Map(),running=new Map();
const nonnegative=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
const clone=v=>structuredClone(v);
export function automaticConnections(env={}){return [
 {id:'github',name:'GitHub 仓库 / 工作流 / 产物',mode:env.RESOURCE_GITHUB_TOKEN?'已配置私有读取':'公开数据自动读取；私有数据待授权',needs:env.RESOURCE_GITHUB_TOKEN?null:'一次性授权仓库 Metadata / Actions 读取权限；账单另需账户 Plan 读取权限'},
 {id:'billing',name:'GitHub 官方账单',mode:env.RESOURCE_GITHUB_TOKEN?'准备通过官方 API 核验权限':'缺少一次性只读授权',needs:env.RESOURCE_GITHUB_TOKEN?null:'GitHub 账户 Plan: read'},
 {id:'cloudflare',name:'Cloudflare Workers / KV / D1',mode:env.RESOURCE_CF_TOKEN&&env.RESOURCE_CF_ACCOUNT_ID?'已配置，等待核验':'缺少一次性只读授权',needs:env.RESOURCE_CF_TOKEN&&env.RESOURCE_CF_ACCOUNT_ID?null:'一次性配置 Cloudflare 账户与 Analytics 只读授权'},
 {id:'openrouter',name:'OpenRouter 余额',mode:env.RESOURCE_OPENROUTER_KEY?'已配置，等待核验':'未配置余额读取',needs:env.RESOURCE_OPENROUTER_KEY?null:'一次性配置余额读取凭据；仅在后台保存，不调用模型'},
 {id:'vps',name:'Oracle VPS 采样',mode:'已复用现有自动采样',needs:null},
 {id:'serpapi',name:'SerpApi 官方余额',mode:'复用 Deal Lab 后台自动检查',needs:'若 Deal Lab 已配置 API Key，无需重复配置'},
 {id:'oci-egress',name:'Oracle 月度流量',mode:'未接通账户 Usage API',needs:'需要单独的 OCI 用量只读身份；网卡瞬时速度不能代替月度流量'},
 {id:'gemini',name:'Gemini / 其他 API',mode:'未接通官方账户用量',needs:'API Key 通常不含完整计费用量权限；需对应账户的监控只读授权'}
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
 async serpapi(snapshot,env){
  if(!env.CHAT_CONNECT_PRIVATE_JWK)return {status:{provider:'serpapi',state:'needs_authorization',checkedAt:new Date(this.clock()).toISOString()}};
  return this.cached('serpapi',HOUR,'existing-deal-lab',async()=>{
   const base='https://pt-universe-api.summer07-nanjolno.workers.dev/api/deal-lab/',available=await this.json(base+'status');
   if(!available.sources?.serpapi?.configured)return {status:{provider:'serpapi',state:'not_configured',checkedAt:new Date(this.clock()).toISOString(),coverage:'Deal Lab 尚未配置 SerpApi API Key；无需手填额度，配置后将自动读取'}};
   // Existing owner authority, short-lived and entirely server-side. The
   // only permitted operation here reads account metadata, never searches.
   const b64=b=>btoa(String.fromCharCode(...b)).replaceAll('+','-').replaceAll('/','_').replaceAll('=',''),encode=v=>b64(new TextEncoder().encode(JSON.stringify(v))),t=Math.floor(this.clock()/1000),nonce=Array.from(crypto.getRandomValues(new Uint8Array(24)),x=>x.toString(16).padStart(2,'0')).join('');
   const message=encode({alg:'ES256',typ:'JWT'})+'.'+encode({iss:'https://pt-vps-tools.h1nano.chatgpt.site',aud:'pt-universe-monitor',sub:'pt-backend-owner',scope:'monitor:manage',iat:t,exp:t+60,nonce}),key=await crypto.subtle.importKey('jwk',JSON.parse(env.CHAT_CONNECT_PRIVATE_JWK),{name:'ECDSA',namedCurve:'P-256'},false,['sign']),token=message+'.'+b64(new Uint8Array(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key,new TextEncoder().encode(message))));
   const r=await this.json(base+'query',{authorization:'Bearer '+token,'content-type':'application/json'},{method:'POST',body:JSON.stringify({provider:'serpapi',operation:'account',args:{}})}),d=r.data;
   if(!nonnegative(d?.monthlyLimit)||!nonnegative(d?.searchesLeft)||d.searchesLeft>d.monthlyLimit||!Number.isFinite(Date.parse(d?.checkedAt)))throw Error('invalid-account');
   return {quotas:[{id:'serpapi',period:'point',used:d.monthlyLimit-d.searchesLeft,limit:d.monthlyLimit||null,observedAt:d.checkedAt,source:'SerpApi 官方账户余额 · 复用 Deal Lab',note:'余额检查不执行商品搜索。官方续期日：'+(d.renewalDate||'未提供'),maxAgeHours:2}],status:{provider:'serpapi',state:'ok',observedAt:d.checkedAt,checkedAt:new Date(this.clock()).toISOString()}};
  });
 }
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
  return this.cached('github-billing',6*HOUR,env.RESOURCE_GITHUB_TOKEN+new Date(this.clock()).toISOString().slice(0,7),async()=>{
   const d=new Date(this.clock()),u=`https://api.github.com/users/${OWNER}/settings/billing/usage/summary?year=${d.getUTCFullYear()}&month=${d.getUTCMonth()+1}&product=actions`,result=await this.json(u,this.ghHeaders(env));
   if(!Array.isArray(result.usageItems))throw Error('invalid-billing');
   // Gross includes public-repository discounts. Do not mislabel it as free-pool
   // consumption, or convert ambiguous storage units into current GB occupancy.
   const rows=result.usageItems.filter(x=>String(x.product).toLowerCase()==='actions').map(x=>({sku:String(x.sku||'').slice(0,100),unit:String(x.unitType||''),quantity:nonnegative(x.grossQuantity)?x.grossQuantity:null,grossUSD:nonnegative(x.grossAmount)?x.grossAmount:null,discountUSD:nonnegative(x.discountAmount)?x.discountAmount:null,netUSD:nonnegative(x.netAmount)?x.netAmount:null}));
   return {billing:{rows,grossUSD:rows.reduce((n,r)=>n+(r.grossUSD||0),0),netUSD:rows.reduce((n,r)=>n+(r.netUSD||0),0),observedAt:new Date(this.clock()).toISOString(),note:'官方账单明细；总原价包含公共仓库折扣，不能直接充当免费计算额度消耗。GB-hours/GB-month 也不等同当前文件占用。'},status:{provider:'github-billing',state:'ok',checkedAt:new Date(this.clock()).toISOString(),observedAt:new Date(this.clock()).toISOString()}};
  });
 }
 async cloudflare(snapshot,env){
  if(!env.RESOURCE_CF_TOKEN||!/^[a-f0-9]{32}$/i.test(env.RESOURCE_CF_ACCOUNT_ID||''))return {status:{provider:'cloudflare',state:'needs_authorization',checkedAt:new Date(this.clock()).toISOString()}};
  return this.cached('cloudflare',HOUR,env.RESOURCE_CF_TOKEN+env.RESOURCE_CF_ACCOUNT_ID+new Date(this.clock()).toISOString().slice(0,10),async()=>{
   const at=new Date(this.clock()).toISOString(),today=at.slice(0,10),account=env.RESOURCE_CF_ACCOUNT_ID,h={authorization:'Bearer '+env.RESOURCE_CF_TOKEN,'content-type':'application/json'},updates=[],groups=[
    {key:'workers',body:`workersInvocationsAdaptive(limit: 10, filter: {datetime_geq: "${today}T00:00:00Z", datetime_leq: "${at}"}) { sum { requests } }`,take:a=>{const r=a.workersInvocationsAdaptive;if(!Array.isArray(r)||r.length>=10)throw Error('partial');return [['cf-requests',r.reduce((n,x)=>n+x.sum.requests,0)]];}},
    {key:'kv',body:`kvOperationsAdaptiveGroups(limit: 20, filter: {date_geq: "${today}", date_leq: "${today}"}) { sum { requests } dimensions { actionType } }`,take:a=>{const r=a.kvOperationsAdaptiveGroups;if(!Array.isArray(r)||r.length>=20)throw Error('partial');return ['read','write','delete','list'].map(action=>['cf-kv-'+action,r.filter(x=>x.dimensions?.actionType===action).reduce((n,x)=>n+x.sum.requests,0)]);}},
    {key:'d1',body:`d1AnalyticsAdaptiveGroups(limit: 10, filter: {date_geq: "${today}", date_leq: "${today}"}) { sum { rowsRead rowsWritten } }`,take:a=>{const r=a.d1AnalyticsAdaptiveGroups;if(!Array.isArray(r)||r.length>=10)throw Error('partial');return [['cf-d1-read',r.reduce((n,x)=>n+x.sum.rowsRead,0)],['cf-d1-write',r.reduce((n,x)=>n+x.sum.rowsWritten,0)]];}}
   ];let failures=0;
   for(const g of groups)try{const r=await this.json('https://api.cloudflare.com/client/v4/graphql',h,{method:'POST',body:JSON.stringify({query:`query { viewer { accounts(filter: {accountTag: "${account}"}) { ${g.body} } } }`})});if(r.errors?.length)throw Error('query-denied');const a=r.data?.viewer?.accounts;if(!Array.isArray(a)||a.length!==1)throw Error('account-not-visible');for(const [id,used]of g.take(a[0])){if(!nonnegative(used))throw Error('invalid-usage');updates.push({id,used,observedAt:at,source:'Cloudflare 官方 Analytics API · 自动读取',note:'UTC 当日账户聚合，Analytics 可能有延迟或采样；上限仍需核实账户套餐。',maxAgeHours:2});}}catch{failures++;}
   return {quotas:updates,status:{provider:'cloudflare',state:failures===groups.length?'unavailable':failures?'partial':'ok',coverage:'Workers 请求、KV 操作与 D1 行数；其余指标保留未连接',checkedAt:at,observedAt:updates.length?at:null}};
  });
 }
 async openrouter(snapshot,env){
  if(!env.RESOURCE_OPENROUTER_KEY)return {status:{provider:'openrouter',state:'needs_authorization',checkedAt:new Date(this.clock()).toISOString()}};
  return this.cached('openrouter',HOUR,env.RESOURCE_OPENROUTER_KEY,async()=>{
   const r=await this.json('https://openrouter.ai/api/v1/credits',{authorization:'Bearer '+env.RESOURCE_OPENROUTER_KEY}),d=r.data,at=new Date(this.clock()).toISOString();
   if(!nonnegative(d?.total_credits)||!nonnegative(d?.total_usage))throw Error('invalid-credit-report');
   return {quotas:[{id:'openrouter',name:'OpenRouter 账户已用 / 充值额度',period:'point',used:d.total_usage,limit:d.total_credits||null,observedAt:at,source:'OpenRouter 官方余额 API · 自动读取',note:'账户累计使用 / 累计购入积分；不是单个模型的免费每日请求额度。',maxAgeHours:2}],status:{provider:'openrouter',state:'ok',checkedAt:at,observedAt:at}};
  });
 }
 async collect(provider,snapshot,env={}){const methods={'github-inventory':'githubInventory','github-storage':'githubStorage','github-billing':'githubBilling',cloudflare:'cloudflare',openrouter:'openrouter',serpapi:'serpapi'};if(!methods[provider])return null;return this[methods[provider]](snapshot,env);}
}
