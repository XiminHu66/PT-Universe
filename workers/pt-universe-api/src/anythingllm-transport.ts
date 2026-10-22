export const TRANSIENT=new Set([500,502,503,504,520,522,524]);
const sleep=(ms:number,signal?:AbortSignal)=>new Promise<void>((resolve,reject)=>{
 if(signal?.aborted){reject(signal.reason);return}
 const abort=()=>{clearTimeout(timer);reject(signal?.reason||Error('Aborted'))};
 const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve()},ms);
 signal?.addEventListener('abort',abort,{once:true});
});
export async function fetchChatWithRetry(url:string,options:RequestInit,pause=sleep){
 let attempts=0;
 while(true){
  attempts++;
  try{
   const response=await fetch(url,options);
   if(!TRANSIENT.has(response.status)||attempts>=3)return {response,attempts};
   await response.body?.cancel();
  }catch(e){if(options.signal?.aborted||attempts>=3)throw e}
  // Only retry before returning a stream, on the same provider and model.
  // Never retry quota, auth or request errors, or replay an emitted answer.
  await pause(1000*2**(attempts-1)+Math.floor(Math.random()*200),options.signal||undefined);
 }
}
export function geminiCompatiblePayload(payload:any){
 const out={...payload},version=/^gemini-(\d+)(?:\.(\d+))?-/.exec(payload.model);
 // Google no longer accepts custom sampling for 3.6+ and later models.
 if(version&&(Number(version[1])>=4||(Number(version[1])===3&&Number(version[2]||0)>=6)))delete out.temperature;
 return out;
}
