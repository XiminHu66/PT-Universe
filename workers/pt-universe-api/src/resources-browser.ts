import {history,type BrowserWorker} from '@cloudflare/playwright';
// @ts-ignore Shared pure adapter is covered by fixture tests.
import {browserHistoryPacket} from '../../../services/resource-monitor/cloudflare.mjs';
const cache=new WeakMap<object,{at:number;value:unknown}>();
export async function readResourceBrowser(binding:BrowserWorker){
 const old=cache.get(binding);if(old&&Date.now()-old.at<900000&&new Date(old.at).toISOString().slice(0,10)===new Date().toISOString().slice(0,10))return old.value;
 try{const value=browserHistoryPacket(await history({fetch:(input,init)=>binding.fetch(input,{...init,signal:AbortSignal.timeout(12000)})}));cache.set(binding,{at:Date.now(),value});return value;}
 catch{const value={status:{provider:'browser',state:'unavailable',checkedAt:new Date().toISOString(),error:'history_unavailable'}};cache.set(binding,{at:Date.now(),value});return value;}
}
