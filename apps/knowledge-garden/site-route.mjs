const chatB64=bytes=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
// Knowledge Garden uses the existing owner-private Site and native Karakeep
// cookie session. Provider keys never enter URLs or persisted page assets.
export async function knowledgeRoute(request,env,knowledgeAssets){
  const connection=await knowledgeConnection(request,env);if(connection)return connection;
  const url=new URL(request.url),path=url.pathname;
  if(!path.startsWith('/knowledge')&&!path.startsWith('/__pt_knowledge/'))return null;
  if(!request.headers.get('oai-authenticated-user-id')){
    if(request.method==='GET'&&path.startsWith('/knowledge'))return Response.redirect(url.origin+'/signin-with-chatgpt?return_to='+encodeURIComponent(path+url.search),302);
    return Response.json({error:'请登录原有工具中心后使用知识库。'},{status:401});
  }
  const noStore={'cache-control':'private,no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'};
  if(path==='/knowledge')return Response.redirect(url.origin+'/knowledge/'+url.search,308);
  if(path.startsWith('/knowledge/')){
    if(!['GET','HEAD'].includes(request.method))return new Response('Read only',{status:405});
    const file=path==='/knowledge/'?'index.html':path.slice('/knowledge/'.length),asset=Object.hasOwn(knowledgeAssets,file)?knowledgeAssets[file]:null;
    if(!asset)return new Response('Not found',{status:404});
    return new Response(request.method==='HEAD'?null:asset.body,{headers:{...noStore,'content-type':asset.type,'content-security-policy':"default-src 'self';script-src 'self';style-src 'self' 'unsafe-inline';img-src 'self' data:;connect-src 'self';worker-src 'self';object-src 'none';base-uri 'self';frame-ancestors 'self'"}});
  }
  const operation=path.slice('/__pt_knowledge/'.length);
  if(!['providers','models','chat'].includes(operation))return new Response('Not found',{status:404});
  const api='https://pt-universe-api.summer07-nanjolno.workers.dev/api/anythingllm/';
  if(operation==='providers'){
    if(request.method!=='GET')return new Response('GET only',{status:405});
    const r=await fetch(api+'providers');return new Response(r.body,{status:r.status,headers:{...noStore,'content-type':'application/json'}});
  }
  if(request.method!=='POST')return new Response('POST only',{status:405});
  if(request.headers.get('origin')!==url.origin||request.headers.get('x-pt-knowledge')!=='1')return Response.json({error:'Same-origin request required'},{status:403});
  if(Number(request.headers.get('content-length')||0)>140000)return new Response('Too large',{status:413});
  let body;try{const text=await request.text();if(text.length>140000)return new Response('Too large',{status:413});body=JSON.parse(text);if(!body||typeof body!=='object'||Array.isArray(body))throw Error();}catch{return Response.json({error:'Invalid JSON'},{status:400});}
  // Only the shared, already free-tier-restricted PT chat router is used.
  // Clients cannot supply arbitrary upstream URLs or mint a reusable token.
  const payload={provider:body.provider,apiKey:body.apiKey||'',accountId:body.accountId||''};
  if(body.provider==='gemini'&&!body.apiKey){
    if(!env.CHAT_CONNECT_PRIVATE_JWK)return Response.json({error:'后台 Gemini 连接尚未配置'},{status:503});
    const now=Math.floor(Date.now()/1000),encode=value=>chatB64(new TextEncoder().encode(JSON.stringify(value)));
    const unsigned=encode({alg:'ES256',typ:'JWT'})+'.'+encode({iss:'https://pt-vps-tools.h1nano.chatgpt.site',aud:'pt-universe-anythingllm',sub:'pt-backend-owner',scope:'chat:gemini',iat:now,exp:now+120,nonce:chatB64(crypto.getRandomValues(new Uint8Array(24)))});
    const key=await crypto.subtle.importKey('jwk',JSON.parse(env.CHAT_CONNECT_PRIVATE_JWK),{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
    payload.backendSession=unsigned+'.'+chatB64(new Uint8Array(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key,new TextEncoder().encode(unsigned))));
  }
  if(operation==='chat')Object.assign(payload,{model:body.model,messages:body.messages,maxTokens:Math.max(128,Math.min(6000,Number(body.maxTokens)||5000)),temperature:.1,allowFreeFallback:true});
  try{
    let r;
    if(operation==='models'&&['gemini','openrouter'].includes(body.provider)&&!body.apiKey)r=await fetch(api+'models?provider='+encodeURIComponent(body.provider));
    else r=await fetch(api+operation,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload),redirect:'manual',signal:AbortSignal.timeout(170000)});
    return new Response(r.body,{status:r.status,headers:{...noStore,'content-type':r.headers.get('content-type')||'application/json','x-pt-model':r.headers.get('x-pt-model')||body.model||'','x-pt-attempts':r.headers.get('x-pt-attempts')||'1'}});
  }catch{return Response.json({error:'免费模型响应超时或连接失败，请稍后重试。'},{status:502,headers:noStore});}
}

const KNOWLEDGE_PAGES='https://ximinhu66.github.io/PT-Universe/apps/knowledge-garden/';
const KNOWLEDGE_API='https://pt-universe-api.summer07-nanjolno.workers.dev/api/knowledge';
async function knowledgeGrant(env,scope,seconds,extra={}){
 const now=Math.floor(Date.now()/1000),encode=value=>chatB64(new TextEncoder().encode(JSON.stringify(value)));
 const payload={iss:'https://pt-vps-tools.h1nano.chatgpt.site',aud:scope==='chat:gemini'?'pt-universe-anythingllm':'pt-universe-knowledge',sub:'pt-backend-owner',scope,iat:now,exp:now+seconds,nonce:chatB64(crypto.getRandomValues(new Uint8Array(24))),...extra};
 const unsigned=encode({alg:'ES256',typ:'JWT'})+'.'+encode(payload),key=await crypto.subtle.importKey('jwk',JSON.parse(env.CHAT_CONNECT_PRIVATE_JWK),{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
 return unsigned+'.'+chatB64(new Uint8Array(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key,new TextEncoder().encode(unsigned))));
}
async function knowledgeConnection(request,env){
 const url=new URL(request.url),path=url.pathname,noStore={'cache-control':'private,no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff'};
 if(request.method==='GET'&&(path==='/karakeep'||path==='/karakeep/'||path.startsWith('/karakeep/dashboard'))){
  const id=path.match(/^\/karakeep\/dashboard\/preview\/([a-zA-Z0-9_-]{6,100})$/)?.[1];return Response.redirect(KNOWLEDGE_PAGES+(id?'?source='+encodeURIComponent(id):''),302);
 }
 if(path==='/knowledge'||path.startsWith('/knowledge/')){
  if(!['GET','HEAD'].includes(request.method))return new Response('Read only',{status:405});return Response.redirect(KNOWLEDGE_PAGES+url.search,302);
 }
 if(path==='/__pt_knowledge_provision'){
  // Fixed server-to-server deployment operation behind owner-private dispatch.
  // Does not mint browser sessions, return transport secrets or accept a URL.
  if(request.method!=='POST')return new Response('POST only',{status:405});
  if(!env.CHAT_CONNECT_PRIVATE_JWK||!env.GATEWAY_ORIGIN||!env.GATEWAY_PRIVATE_JWK)return Response.json({ok:false,error:'Transport unavailable'},{status:503,headers:noStore});
  try{const config=JSON.stringify({origin:env.GATEWAY_ORIGIN,jwk:JSON.parse(env.GATEWAY_PRIVATE_JWK),siteOrigin:'https://pt-vps-tools.h1nano.chatgpt.site'}),digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(config)))].map(x=>x.toString(16).padStart(2,'0')).join('');
   const grant=await knowledgeGrant(env,'knowledge:configure',60,{digest});
   const r=await fetch(KNOWLEDGE_API+'/configure',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+grant},body:config,redirect:'manual',signal:AbortSignal.timeout(30000)});
   await r.body?.cancel();return Response.json({ok:r.ok,upstreamStatus:r.status,frontend:KNOWLEDGE_PAGES,backend:'existing-vps'},{status:r.ok?200:502,headers:noStore});
  }catch{return Response.json({ok:false,error:'PT backend provisioning unavailable'},{status:502,headers:noStore});}
 }
 if(path!=='/__pt_knowledge_connect')return null;
 if(request.method!=='GET')return new Response('GET only',{status:405});
 const nonce=url.searchParams.get('nonce')||'';if(!/^[a-f0-9]{48}$/.test(nonce))return new Response('Invalid connection request',{status:400});
 if(!request.headers.get('oai-authenticated-user-id'))return Response.redirect(url.origin+'/signin-with-chatgpt?return_to='+encodeURIComponent(path+url.search),302);
 if(!env.CHAT_CONNECT_PRIVATE_JWK)return new Response('连接尚未配置',{status:503});
 const token=await knowledgeGrant(env,'knowledge:session',86400),chat=await knowledgeGrant(env,'chat:gemini',3600);
 const target=KNOWLEDGE_PAGES+'#knowledge='+encodeURIComponent(token)+'&backend='+encodeURIComponent(chat)+'&nonce='+nonce;
 return new Response('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>返回 PT Universe</title><p>后台已连接，正在返回 PT Universe 知识库…</p><a href="'+target+'">返回 PT Universe →</a><script>location.replace('+JSON.stringify(target)+')</script></html>',{headers:{...noStore,'content-type':'text/html;charset=utf-8','content-security-policy':"default-src 'none';script-src 'unsafe-inline';base-uri 'none';frame-ancestors 'none'"}});
}
