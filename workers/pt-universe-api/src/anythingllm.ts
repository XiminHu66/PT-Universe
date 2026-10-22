import catalog from '../../../apps/anythingllm/providers.json';
import {verifyBackendSession} from './anythingllm-auth';
import {geminiFreeModels,geminiModelFallback,textChatModel} from './anythingllm-models';
import {fetchChatWithRetry,geminiCompatiblePayload,TRANSIENT} from './anythingllm-transport';

type ChatEnv={DB:D1Database;GEMINI_API_KEY?:string};
type Authenticate=(r:Request,e:any,id:string)=>Promise<boolean>;
const fail=(error:string,status=400)=>Response.json({error},{status,headers:{'cache-control':'no-store'}});
const str=(v:unknown,n=300)=>typeof v==='string'?v.trim().slice(0,n):'';
export function providerBase(id:string,accountId:unknown){
 const provider=catalog.providers.find(p=>p.id===id);
 if(!provider||!provider.base||provider.kind!=='free')throw Error('只支持已核实有持续免费额度的后端');
 if(id==='cloudflare'&&!/^[a-f0-9]{32}$/i.test(str(accountId)))throw Error('请填写 32 位 Cloudflare Account ID');
 return {provider,base:provider.base.replace('{accountId}',str(accountId))};
}
export function validateChat(body:any,provider:typeof catalog.providers[number]){
 const model=str(body.model,200);if(!model||!/^[@\w./:+-]+$/.test(model))throw Error('请选择或填写有效模型 ID');
 {
  if(['trial','evaluation','conditional','paid'].includes(provider.kind))throw Error('请先在后端设置中确认此账户的试用额度 / 使用资格');
  if(provider.id==='openrouter'&&model!=='openrouter/free'&&!model.endsWith(':free'))throw Error('免费模式只允许 OpenRouter 免费路由或 :free 模型');
  if(provider.id!=='gemini'&&provider.freeModels&&!provider.freeModels.includes(model))throw Error('该模型不在已核实的免费清单中，请刷新免费模型列表');
 }
 if(!Array.isArray(body.messages)||!body.messages.length||body.messages.length>100)throw Error('对话需包含 1–100 条消息');
 const messages=body.messages.map((m:any)=>{
  if(!m||!['system','user','assistant'].includes(m.role)||typeof m.content!=='string'||m.content.length>60000)throw Error('消息格式或长度不正确');
  return {role:m.role,content:m.content};
 });
 if(messages.reduce((n:number,m:any)=>n+m.content.length,0)>120000)throw Error('对话内容超过 120,000 字符，请新建对话或减少附件');
 if(!messages.some((m:any)=>m.role==='user'&&m.content.trim()))throw Error('请输入消息');
 const max_tokens=Number(body.maxTokens??2048),temperature=Number(body.temperature??0.7);
 if(!Number.isFinite(max_tokens)||!Number.isFinite(temperature))throw Error('生成参数必须为数字');
 return {model,messages,stream:true,max_tokens:Math.max(64,Math.min(8192,Math.trunc(max_tokens))),temperature:Math.max(0,Math.min(2,temperature))};
}
async function sharedKey(request:Request,env:ChatEnv,body:any,authenticate:Authenticate,reserve:boolean){
 const session=await verifyBackendSession(body.backendSession);
 if(session?.probe&&(!reserve||body.model!=='gemini-3.5-flash-lite'||body.maxTokens!==128||body.temperature!==0||body.messages?.length!==1||body.messages[0].role!=='user'||body.messages[0].content!=='PT Chat connection test: respond only OK.'))return fail('后台连接自检只能执行固定测试',403);
 const owner=session?.owner||str(body.owner,50);
 if(!session){
  if(!/^[\w-]{36}$/.test(owner)||!await authenticate(request,env,owner))return fail('点击「连接 PT 后台」，登录原有工具中心即可使用 Gemini，无需重填 API Key',401);
  if(!await env.DB.prepare('SELECT owner FROM research_ai_accounts WHERE owner=?').bind(owner).first())return fail('当前配对码未开通后台 AI；请点击「连接 PT 后台」完成账号连接',403);
 }
 if(!env.GEMINI_API_KEY)return fail('后台尚未配置 Gemini；请使用个人 Key',503);
 if(reserve){
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS anythingllm_usage(id TEXT PRIMARY KEY,owner TEXT NOT NULL,created_at INTEGER NOT NULL)').run();
  const now=Date.now(),day=now-now%86400000;
  const r=await env.DB.prepare('INSERT INTO anythingllm_usage(id,owner,created_at) SELECT ?,?,? WHERE (SELECT COUNT(*) FROM anythingllm_usage WHERE created_at>=?)<150 AND (SELECT COUNT(*) FROM anythingllm_usage WHERE owner=? AND created_at>=?)<60 AND (SELECT COUNT(*) FROM anythingllm_usage WHERE created_at>?)<6')
   .bind(crypto.randomUUID(),owner,now,day,owner,day,now-60000).run();
  if(r.meta.changes!==1)return fail('后台 Gemini 已达到保护额度（全站 6 次/分钟、150 次/日；每配对码 60 次/日）。请稍后重试或使用个人 Key。',429);
  await env.DB.prepare('DELETE FROM anythingllm_usage WHERE created_at<?').bind(day-86400000*7).run();
 }
 return env.GEMINI_API_KEY.trim();
}
export async function publicError(response:Response,key:string){
 let message='';
 try{const raw=await response.text();let data:any;try{data=JSON.parse(raw)}catch{}
  if(Array.isArray(data))data=data[0];
  message=str(data?.error?.message||data?.message||data?.error?.status||data?.error,700);
  if(!message&&raw.length<1500&&!/[<>]/.test(raw))message=str(raw,700);
 }catch{}
 if(key)message=message.split(key).join('[redacted]');
 message=message.replace(/(?:sk-|gsk_|nvapi-|AIza)[A-Za-z0-9_-]{12,}/g,'[redacted]');
 const prefix=response.status===400?'模型拒绝了请求参数':response.status===401?'API Key 无效':response.status===402?'额度不足或需要充值':response.status===403?'模型权限 / 地域 / 账户资格受限':response.status===404?'模型或接口不存在，请重新拉取模型':response.status===429?'后端限流或免费额度耗尽':response.status>=500?'模型服务暂时不可用':'后端请求失败';
 const result=fail(prefix+'（HTTP '+response.status+'）'+(message?'：'+message:''),response.status>=400&&response.status<600?response.status:502);
 const retry=response.headers.get('retry-after');if(retry&&/^\d{1,6}$/.test(retry))result.headers.set('retry-after',retry);
 return result;
}
export async function anythingLLMRoute(request:Request,env:ChatEnv,authenticate:Authenticate):Promise<Response|null>{
 const path=new URL(request.url).pathname;
 if(!path.startsWith('/api/anythingllm/'))return null;
 if(path==='/api/anythingllm/providers'&&request.method==='GET')return Response.json(catalog,{headers:{'cache-control':'public,max-age=300'}});
 // Model IDs and public prices contain no account data. Listing is read-only,
 // cached and separate from the authenticated completion endpoint.
 if(path==='/api/anythingllm/models'&&request.method==='GET'){
  const id=new URL(request.url).searchParams.get('provider');
  if(id==='openrouter'){
   try{const r=await fetch('https://openrouter.ai/api/v1/models',{redirect:'manual',signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error();const d:any=await r.json();return Response.json({models:(d.data||[]).filter((m:any)=>(m.id==='openrouter/free'||m.id?.endsWith(':free'))&&Number(m.pricing?.prompt)===0&&Number(m.pricing?.completion)===0).map((m:any)=>({id:m.id,name:str(m.name,180)||m.id})),checkedAt:new Date().toISOString(),source:'openrouter-zero-price-models',scope:'free-tier-text-chat',fallback:false},{headers:{'cache-control':'public,max-age=300'}})}catch{return fail('OpenRouter 免费型号查询暂时不可用',502)}
  }
  if(id!=='gemini')return fail('此后端需要先配置个人 Key',401);
  let report;try{report=env.GEMINI_API_KEY?await geminiFreeModels(env.GEMINI_API_KEY.trim()):geminiModelFallback()}catch{report=geminiModelFallback()}
  return Response.json(report,{headers:{'cache-control':report.fallback?'public,max-age=30':'public,max-age=300'}});
 }
 if(!['/api/anythingllm/chat','/api/anythingllm/models','/api/anythingllm/status','/api/anythingllm/quota'].includes(path))return fail('Not found',404);
 if(request.method!=='POST')return fail('仅支持 POST',405);
 if(Number(request.headers.get('content-length')||0)>160000)return fail('请求过大',413);
 let body:any;
 try{const raw=await request.text();if(raw.length>160000)return fail('请求过大',413);body=JSON.parse(raw);if(!body||typeof body!=='object'||Array.isArray(body))throw Error()}catch{return fail('JSON 格式不正确')}
 let target,payload;
 try{target=providerBase(str(body.provider),body.accountId);if(path.endsWith('/chat'))payload=validateChat(body,target.provider)}catch(e){return fail(e instanceof Error?e.message:'无效后端')}
 if(body.baseUrl)return fail('云端代理不接受自定义 URL；请使用浏览器直连');
 let key=str(body.apiKey,4096);
 if(!key&&target.provider.id==='gemini'){
  const shared=await sharedKey(request,env,body,authenticate,path.endsWith('/chat'));if(shared instanceof Response)return shared;key=shared;
 }
 if(!key)return fail('请在后端设置中填写 API Key',401);
 if(/[\r\n]/.test(key))return fail('API Key 格式不正确');
 if(path.endsWith('/status'))return Response.json({configured:true,shared:!body.apiKey,provider:target.provider.id},{headers:{'cache-control':'no-store'}});
 let verifiedGeminiModels:{id:string}[]=[];
 if(target.provider.id==='gemini'&&(path.endsWith('/models')||path.endsWith('/chat'))){
  let report;
  try{report=await geminiFreeModels(key)}catch{report=geminiModelFallback()}
  if(path.endsWith('/models'))return Response.json(report,{headers:{'cache-control':'no-store'}});
  verifiedGeminiModels=report.models;
  if(!report.models.some((m:any)=>m.id===payload!.model))return fail('该型号不在官方免费层且支持文字聊天的实时清单中，请刷新模型列表',400);
 }
 const url=target.base+(path.endsWith('/chat')?'/chat/completions':path.endsWith('/quota')?'/key':'/models');
 if(path.endsWith('/quota')&&target.provider.id!=='openrouter')return fail('此后端未提供统一剩余额度接口，请查看官方控制台');
 try{
  const outgoing=payload&&target.provider.id==='gemini'?geminiCompatiblePayload(payload):payload;
  const options:RequestInit={method:payload?'POST':'GET',headers:{authorization:'Bearer '+key,'content-type':'application/json'},...(outgoing?{body:JSON.stringify(outgoing)}:{}),redirect:'manual',signal:AbortSignal.any([request.signal,AbortSignal.timeout(120000)])};
  const requestId=crypto.randomUUID(),started=Date.now();
  let {response,attempts}=payload?await fetchChatWithRetry(url,options):{response:await fetch(url,options),attempts:1};
  let actualModel=payload?.model||'',fallbackFrom='';
  const fallbackModel='gemini-3.5-flash-lite';
  if(payload&&target.provider.id==='gemini'&&body.allowFreeFallback===true&&TRANSIENT.has(response.status)&&payload.model!==fallbackModel&&verifiedGeminiModels.some(m=>m.id===fallbackModel)){
   await response.body?.cancel();
   const backup=await fetchChatWithRetry(url,{...options,body:JSON.stringify(geminiCompatiblePayload({...payload,model:fallbackModel}))});
   response=backup.response;attempts+=backup.attempts;actualModel=fallbackModel;fallbackFrom=payload.model;
  }
  const diagnosticHeaders={'x-pt-request-id':requestId,'x-pt-attempts':String(attempts),'x-pt-model':actualModel,...(fallbackFrom?{'x-pt-fallback-from':fallbackFrom}:{}),'access-control-expose-headers':'retry-after,x-pt-request-id,x-pt-attempts,x-pt-model,x-pt-fallback-from'};
  if(payload)console.info(JSON.stringify({event:'pt_chat_upstream',requestId,provider:target.provider.id,model:actualModel,requestedModel:payload.model,status:response.status,attempts,elapsedMs:Date.now()-started}));
  if(!response.ok||response.status>=300){const error=await publicError(response,key);for(const [name,value]of Object.entries(diagnosticHeaders))error.headers.set(name,value);return error}
  if(path.endsWith('/chat')){
   const contentType=response.headers.get('content-type')||'';
   if(!/text\/event-stream|application\/json/i.test(contentType))return fail('后端未返回有效的聊天响应',502);
   return new Response(response.body,{headers:{'content-type':contentType,'cache-control':'no-store','x-content-type-options':'nosniff',...diagnosticHeaders}});
  }
  const data:any=await response.json();
  if(path.endsWith('/quota'))return Response.json({freeRequests:data?.data?.free_model_daily_requests??null,checkedAt:new Date().toISOString()},{headers:{'cache-control':'no-store'}});
  let models=Array.isArray(data.data)?data.data:Array.isArray(data.models)?data.models:[];
  models=models.filter((m:any)=>typeof m.id==='string'&&textChatModel(m.id));
  if(target.provider.id==='gemini')models=models.map((m:any)=>({...m,id:m.id.replace(/^models\//,'')}));
  if(target.provider.id==='openrouter')models=models.filter((m:any)=>m.id==='openrouter/free'||m.id.endsWith(':free'));
  if(target.provider.freeModels)models=models.filter((m:any)=>target.provider.freeModels!.includes(m.id));
  return Response.json({models:models.slice(0,1000).map((m:any)=>({id:m.id,name:str(m.name)||m.id})),checkedAt:new Date().toISOString()},{headers:{'cache-control':'no-store'}});
 }catch{return fail('后端连接失败或超时，请检查网络、模型和 Key 后重试',502)}
}
