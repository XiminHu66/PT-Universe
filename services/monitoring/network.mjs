import https from 'node:https';
import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import {MonitorError} from './model.mjs';
export function publicAddress(ip){
 if(isIP(ip)===6)return /^[23][a-f\d]{3}:/i.test(ip)&&!/^2001:(?:0:|db8:)|^2002:/i.test(ip);
 if(isIP(ip)!==4)return false;const [a,b]=ip.split('.').map(Number);return ![0,10,127].includes(a)&&a<224&&!(a===169&&b===254)&&!(a===172&&b>=16&&b<=31)&&!(a===192&&[0,168].includes(b))&&!(a===198&&[18,19,51].includes(b))&&!(a===203&&b===0)&&!(a===100&&b>=64&&b<=127);
}
export async function safeURL(value,resolver=lookup){
 let u;try{u=new URL(value)}catch{throw new MonitorError('invalid','链接无效')};
 if(u.protocol!=='https:'||u.username||u.password||u.port||u.href.length>4096)throw new MonitorError('invalid','仅支持标准HTTPS公开网页');
 const h=u.hostname.replace(/^\[|\]$/g,'');if(!h.includes('.')||/\.(local|internal|localhost)$/i.test(h))throw new MonitorError('blocked','不支持内网地址');
 const addresses=await resolver(h,{all:true});if(!addresses.length||addresses.some(x=>!publicAddress(x.address)))throw new MonitorError('blocked','不支持内网或保留地址');return {url:u,address:addresses[0]};
}
export async function fetchPublic(value,{redirects=4,resolver=lookup}={}){
 const {url,address}=await safeURL(value,resolver);
 const result=await new Promise((resolve,reject)=>{
  const r=https.request(url,{headers:{'user-agent':'Mozilla/5.0 PTUniverseMonitor/1.0','accept':'text/html,application/xhtml+xml'},lookup:(_h,_o,cb)=>cb(null,address.address,address.family),timeout:18000},res=>{
   if(res.statusCode>=300&&res.statusCode<400){res.resume();return resolve({redirect:res.headers.location,status:res.statusCode});}
   let size=0;const chunks=[];res.on('data',b=>{size+=b.length;if(size>2*1024*1024)res.destroy(new Error('页面超过大小限制'));else chunks.push(b)});res.on('error',reject);res.on('end',()=>resolve({html:Buffer.concat(chunks).toString('utf8'),status:res.statusCode,url:url.href}));
  });r.on('timeout',()=>r.destroy(new MonitorError('timeout','网页响应超时')));r.on('error',reject);r.end();
 });
 if(result.redirect){if(redirects<=0)throw new MonitorError('redirect','网页重定向过多');return fetchPublic(new URL(result.redirect,url).href,{redirects:redirects-1,resolver});}
 if(result.status!==200)throw new MonitorError('access',`网站返回 ${result.status}，本次检查未成功`);
 if(/<title>[^<]*(?:captcha|robot|access denied|just a moment)|validateCaptcha|challenge-platform/i.test(result.html))throw new MonitorError('challenge','网站要求验证，请稍后重试');return result;
}
