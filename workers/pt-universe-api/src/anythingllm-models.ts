import {parseDocument} from 'htmlparser2';
import {findAll,textContent} from 'domutils';
import catalog from '../../../apps/anythingllm/providers.json';

export const GEMINI_PRICING='https://ai.google.dev/gemini-api/docs/pricing?hl=en';
const NATIVE_MODELS='https://generativelanguage.googleapis.com/v1beta/models';
const plain=(node:any)=>textContent(node).replace(/\s+/g,' ').trim();
export const textChatModel=(id:string)=>!/(?:embedding|embed-|(?:^|-)tts(?:-|$)|(?:^|-)live(?:-|$)|native-audio|transcrib|translate|image|banana|lyria|streaming)/i.test(id);
type PriceModel={id:string;name:string;family?:boolean};
export function parseGeminiFreePricing(html:string):PriceModel[]{
 const found:PriceModel[]=[];
 // Sections can be nested inside pricing-card wrappers: sibling traversal
 // would miss the tables. Only the first (Standard) table is authoritative.
 for(const section of html.split(/<h2\b/i).slice(1)){
  const doc=parseDocument('<h2 '+section),all=findAll(()=>true,doc.children);
  const heading=all.find((n:any)=>n.name==='h2'),table=all.find((n:any)=>n.name==='table');
  if(!heading||!table)continue;
  const rows=findAll((n:any)=>n.name==='tr',[table]).map((row:any)=>findAll((n:any)=>['td','th'].includes(n.name),row.children).map(plain));
  const freeColumn=rows[0]?.findIndex((s:string)=>/^Free Tier$/i.test(s));
  if(freeColumn===undefined||freeColumn<1)continue;
  const free=(kind:string)=>rows.some(row=>new RegExp('^'+kind+' price','i').test(row[0]||'')&&/^Free of charge$/i.test(row[freeColumn]||''));
  if(!free('Input')||!free('Output'))continue;
  const name=plain(heading),before=section.split(/<table\b/i)[0],codeDoc=parseDocument(before);
  const ids=findAll((n:any)=>n.name==='code',codeDoc.children).map(plain).filter(id=>/^(?:gemini|gemma)-[\w.-]+$/.test(id));
  for(const id of ids)found.push({id,name});
  // Gemma's pricing is stated for the whole version family, without IDs.
  const gemma=/^Gemma (\d+)$/i.exec(name);if(gemma&&!ids.length)found.push({id:'gemma-'+gemma[1]+'-',name,family:true});
 }
 const unique=[...new Map(found.map(m=>[m.id,m])).values()];
 if(!unique.some(m=>textChatModel(m.id)&&m.id.startsWith('gemini-')))throw Error('无法解析官方免费输入 / 输出价格，保留上次清单');
 return unique;
}
export function intersectGeminiModels(prices:PriceModel[],native:any[]){
 const models:any[]=[],unsupported:any[]=[];
 for(const item of native){
  const id=String(item.name||item.id||'').replace(/^models\//,'');
  if(!/^[\w.-]+$/.test(id))continue;
  const price=prices.find(p=>p.family?id.startsWith(p.id):id===p.id);if(!price)continue;
  const model={id,name:String(item.displayName||price.name||id).slice(0,180)};
  if(!textChatModel(id)||!item.supportedGenerationMethods?.includes('generateContent'))unsupported.push({...model,reason:'此型号需要语音、图片、嵌入或专用接口'});
  else models.push(model);
 }
 return {models:[...new Map(models.map(m=>[m.id,m])).values()],unsupported};
}
let priceCache:{until:number;rows:PriceModel[]}|undefined,pricePending:Promise<PriceModel[]>|undefined;
async function prices(){
 if(priceCache&&priceCache.until>Date.now())return priceCache.rows;
 if(pricePending)return pricePending;
 pricePending=(async()=>{const response=await fetch(GEMINI_PRICING,{redirect:'manual',signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error('官方价格页暂时不可用');const rows=parseGeminiFreePricing(await response.text());priceCache={until:Date.now()+3600000,rows};return rows})();
 try{return await pricePending}finally{pricePending=undefined}
}
const modelCache=new Map<string,{until:number;report:any}>(),pending=new Map<string,Promise<any>>();
export async function geminiFreeModels(key:string){
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(key))),n=>n.toString(16).padStart(2,'0')).join('');
 const cached=modelCache.get(hash);if(cached&&cached.until>Date.now())return cached.report;
 if(pending.has(hash))return pending.get(hash);
 const operation=(async()=>{
  const priceRows=await prices(),native:any[]=[];let pageToken='',pageCount=0;const seen=new Set<string>();
  do{
   const url=new URL(NATIVE_MODELS);url.searchParams.set('pageSize','1000');if(pageToken)url.searchParams.set('pageToken',pageToken);
   const response=await fetch(url.toString(),{headers:{'x-goog-api-key':key},redirect:'manual',signal:AbortSignal.timeout(20000)});
   if(!response.ok)throw Error('Gemini 模型接口暂时不可用（'+response.status+'）');
   const data:any=await response.json();native.push(...(Array.isArray(data.models)?data.models:[]));
   pageToken=typeof data.nextPageToken==='string'?data.nextPageToken:'';
   if(pageToken&&(seen.has(pageToken)||++pageCount>=10))throw Error('模型分页未完整返回');seen.add(pageToken);
  }while(pageToken);
  const result=intersectGeminiModels(priceRows,native);
  const report={...result,checkedAt:new Date().toISOString(),source:'google-pricing-and-models',pricingUrl:GEMINI_PRICING,scope:'free-tier-text-chat',fallback:false};
  if(modelCache.size>=20)modelCache.delete(modelCache.keys().next().value!);
  modelCache.set(hash,{until:Date.now()+600000,report});return report;
 })();pending.set(hash,operation);
 try{return await operation}finally{pending.delete(hash)}
}
export function geminiModelFallback(){
 const p=catalog.providers.find(p=>p.id==='gemini')!;
 return {models:p.models.map(id=>({id,name:id})),unsupported:[],checkedAt:p.checkedAt,source:'last-verified-catalog',fallback:true,scope:'free-tier-text-chat',warning:'实时清单暂时不可用，显示最近核实的免费型号；稍后会自动重试。'};
}

// Discovery is advisory metadata and must not hold a completion indefinitely.
// Keep the existing last-verified free catalog policy on failure or timeout.
export async function boundedDiscovery<T>(operation:()=>Promise<T>,fallback:()=>T,timeoutMs=8000):Promise<T>{
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{
  return await Promise.race([Promise.resolve().then(operation),new Promise<T>((_,reject)=>{timer=setTimeout(()=>reject(Error('model-discovery-timeout')),timeoutMs)})]);
 }catch{return fallback()}
 finally{if(timer!==undefined)clearTimeout(timer)}
}
export function availableGeminiModels(key:string,timeoutMs=8000){
 return boundedDiscovery(()=>geminiFreeModels(key),geminiModelFallback,timeoutMs);
}
