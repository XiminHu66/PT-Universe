const enc=new TextEncoder();
export async function sealProviderToken(token,agentSecret,scope,id){
 if(typeof token!=='string'||token.length<20||token.length>4096||/\s/.test(token))throw Error('Invalid provider token');
 if(!agentSecret||agentSecret.length<32)throw Error('Provider encryption unavailable');
 const key=await crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',enc.encode('media-vault-pikpak-v1:'+agentSecret)),{name:'AES-GCM'},false,['encrypt']);
 const iv=crypto.getRandomValues(new Uint8Array(12)),aad=enc.encode(scope+'/'+id);
 const data=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad},key,enc.encode(token)));
 const b64=bytes=>btoa(String.fromCharCode(...bytes));
 return {iv:b64(iv),data:b64(data)};
}
