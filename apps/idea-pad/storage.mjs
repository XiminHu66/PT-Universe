import {empty,normalize,today} from './model.mjs';
const NAME='pt-idea-pad-notes',STORE='documents';let dbPromise,revision=0;
function open(){return dbPromise??=new Promise((resolve,reject)=>{const r=indexedDB.open(NAME,1);r.onupgradeneeded=()=>r.result.createObjectStore(STORE);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
async function read(key){const db=await open();return new Promise((resolve,reject)=>{const r=db.transaction(STORE).objectStore(STORE).get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
export async function load(adopt=true){const db=await open(),result=await new Promise((resolve,reject)=>{const tx=db.transaction(STORE),store=tx.objectStore(STORE),s=store.get('state'),r=store.get('revision');tx.oncomplete=()=>resolve({value:s.result,revision:r.result||0});tx.onerror=()=>reject(tx.error)});if(adopt)revision=result.revision;const value=result.value;if(!value)return empty();try{return normalize(value)}catch(e){await quarantine(value);throw Error('已有数据格式异常，已保留原件。请在备份中下载检查：'+e.message)}}
export async function quarantine(value){const db=await open();return new Promise((resolve,reject)=>{const t=db.transaction(STORE,'readwrite');t.objectStore(STORE).put({at:new Date().toISOString(),data:value},'corrupt');t.oncomplete=resolve;t.onerror=()=>reject(t.error)})}
export async function save(state,reason='edit'){
 const db=await open();return new Promise((resolve,reject)=>{const t=db.transaction(STORE,'readwrite'),store=t.objectStore(STORE),v=store.get('revision');let conflict=false;
 v.onsuccess=()=>{if((v.result||0)!==revision){conflict=true;t.abort();return}const r=store.get('state');r.onsuccess=()=>{const old=r.result,b=store.get('backups');b.onsuccess=()=>{let xs=b.result||[];if(old&&(!xs.some(x=>x.date===today())||reason==='import'||reason==='cloud'||reason==='restore'))xs.push({date:today(),at:new Date().toISOString(),reason,data:old});xs=xs.slice(-30);store.put(xs,'backups');store.put(state,'state');store.put(revision+1,'revision')}}};
 t.oncomplete=()=>{revision++;resolve()};t.onerror=()=>reject(t.error);t.onabort=()=>reject(conflict?Error('另一标签页已更新数据。请下载本机备份，再读取新版'):t.error||Error('保存被中断'))})
}
export const backups=()=>read('backups');export const corrupt=()=>read('corrupt');
export async function meta(value){if(value===undefined)return (await read('cloud'))||{};const db=await open();return new Promise((resolve,reject)=>{const t=db.transaction(STORE,'readwrite');t.objectStore(STORE).put(value,'cloud');t.oncomplete=resolve;t.onerror=()=>reject(t.error)})}
