const PUBLIC_KEY:JsonWebKey={key_ops:['verify'],ext:true,kty:'EC',x:'K8ov89BUOrCoAYzYMnjz6OTnwsnCHiQwBiS6vU56SwA',y:'xPOB1n3kM9SKbq6KMnNrTN1pfn1fXSfVAgvcqXFfDr4',crv:'P-256'};
const unb64=(s:string)=>Uint8Array.from(atob(s.replaceAll('-','+').replaceAll('_','/')+'==='.slice((s.length+3)%4)),c=>c.charCodeAt(0));
export async function verifyBackendSession(token:unknown,now=Date.now(),publicKey:JsonWebKey=PUBLIC_KEY){
 try{
  if(typeof token!=='string'||token.length>3000)return null;
  const [a,b,c,...rest]=token.split('.');if(rest.length||!a||!b||!c)return null;
  const header=JSON.parse(new TextDecoder().decode(unb64(a))),payload=JSON.parse(new TextDecoder().decode(unb64(b)));
  const probe=payload.scope==='chat:gemini:probe'&&payload.sub==='pt-backend-probe';
  if(header.alg!=='ES256'||header.typ!=='JWT'||payload.iss!=='https://pt-vps-tools.h1nano.chatgpt.site'||payload.aud!=='pt-universe-anythingllm'||(!probe&&(payload.sub!=='pt-backend-owner'||payload.scope!=='chat:gemini')))return null;
  const seconds=Math.floor(now/1000);
  if(!Number.isFinite(payload.exp)||!Number.isFinite(payload.iat)||payload.exp<=seconds||payload.iat>seconds+30||payload.exp-payload.iat>3600||payload.iat<seconds-3600||!/^[-\w]{24,80}$/.test(payload.nonce||''))return null;
  const key=await crypto.subtle.importKey('jwk',publicKey,{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
  if(probe&&payload.exp-payload.iat>60)return null;
  return await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key,unb64(c),new TextEncoder().encode(a+'.'+b))?{owner:probe?'pt-backend-probe':'pt-backend-owner',probe,expiresAt:payload.exp*1000}:null;
 }catch{return null}
}
