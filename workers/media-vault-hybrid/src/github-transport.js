// Fixed GitHub OAuth operations over the existing authenticated outbound WSS.
// No user-supplied host, URL, header or arbitrary proxy operation is accepted.
export async function githubProviderFetch(env,url,options={}){
 if(env.MEDIA_LOGIN_TRANSPORT!=='vps')return fetch(url,options);
 let operation,payload;
 if(/^https:\/\/api\.github\.com\/app-manifests\/[A-Za-z0-9_-]{16,200}\/conversions$/.test(url)&&options.method==='POST'){
  operation='manifest';payload={code:new URL(url).pathname.split('/')[2]};
 }else if(url==='https://github.com/login/oauth/access_token'&&options.method==='POST'){
  const data=new URLSearchParams(options.body);
  if(data.get('redirect_uri')!=='https://pt-media-hybrid.summer07-nanjolno.workers.dev/media-vault-login/callback')throw Error('Invalid fixed OAuth callback');
  operation='token';payload=Object.fromEntries(['client_id','client_secret','code','code_verifier'].map(k=>[k,data.get(k)]));
 }else if(url==='https://api.github.com/user'&&!options.method){
  operation='user';payload={access_token:String(options.headers?.Authorization||'').replace(/^Bearer /,'')};
 }else if(url==='https://api.github.com/users/XiminHu66'&&!options.method){operation='probe';payload={};}
 else throw Error('Unsupported private login operation');
 if(!env.RELAY)throw Error('Private login relay unavailable');
 return env.RELAY.get(env.RELAY.idFromName('media-vault-private')).fetch('https://private/github-login',{
  method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation,payload})
 });
}
