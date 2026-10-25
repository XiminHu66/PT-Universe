// Static PT Universe frontend; private records are fetched from the PT API.
export const API='https://pt-universe-api.summer07-nanjolno.workers.dev/api';
export const PAGES='https://ximinhu66.github.io/PT-Universe/apps/knowledge-garden/';
const BRIDGE='https://pt-vps-tools.h1nano.chatgpt.site/__pt_knowledge_connect';
const KEY='pt.knowledge.connection',NONCE='pt.knowledge.connect.nonce';
let connection=null;try{connection=JSON.parse(sessionStorage.getItem(KEY)||'null')}catch{}
const fragment=new URLSearchParams(location.hash.slice(1));
if(fragment.has('knowledge')){const nonce=fragment.get('nonce'),expected=sessionStorage.getItem(NONCE);history.replaceState(null,'',location.pathname+location.search);sessionStorage.removeItem(NONCE);if(nonce&&nonce===expected){connection={token:fragment.get('knowledge'),chat:fragment.get('backend')};sessionStorage.setItem(KEY,JSON.stringify(connection));}}
function alive(token){try{return JSON.parse(atob(token.split('.')[1].replaceAll('-','+').replaceAll('_','/'))).exp*1000>Date.now()+10000}catch{return false}}
export const hasConnection=()=>!!connection?.token&&alive(connection.token);
export function connectBackend(){const nonce=[...crypto.getRandomValues(new Uint8Array(24))].map(x=>x.toString(16).padStart(2,'0')).join('');sessionStorage.setItem(NONCE,nonce);location.assign(BRIDGE+'?nonce='+nonce);}
export async function backendFetch(path,options={}){let url;const headers=new Headers(options.headers);headers.delete('x-pt-knowledge');let body=options.body;
 if(path.startsWith('/karakeep/')){url=API+'/knowledge'+path;headers.set('authorization','Bearer '+(connection?.token||''));}
 else if(path==='/hub/open/karakeep'){url=API+'/knowledge/status';headers.set('authorization','Bearer '+(connection?.token||''));}
 else if(path.startsWith('/__pt_knowledge/')){const op=path.split('/').at(-1);url=API+'/anythingllm/'+op;if(body&&typeof body==='string'){const data=JSON.parse(body);if(data.provider==='gemini'&&!data.apiKey&&connection?.chat&&alive(connection.chat))data.backendSession=connection.chat;body=JSON.stringify(data);if(op==='models'&&['gemini','openrouter'].includes(data.provider)&&!data.apiKey){url+='?provider='+encodeURIComponent(data.provider);return globalThis.fetch(url,{credentials:'omit',cache:'no-store',signal:options.signal});}}}
 else if(path.startsWith('/api/knowledge/')){url=API.slice(0,-4)+path;headers.set('authorization','Bearer '+(connection?.token||''));}
 else throw Error('Unsupported PT API request');
 const response=await globalThis.fetch(url,{...options,headers,body,credentials:'omit'});if(response.status===401)document.dispatchEvent(new CustomEvent('knowledge-disconnected'));return response;
}
const tickets=new Map();
export async function assetTicket(id,page=''){let entry=tickets.get(id);if(!entry||entry.expiresAt<Date.now()+30000){const r=await backendFetch('/api/knowledge/asset-ticket',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id})});entry=await r.json();if(!r.ok)throw Error(entry.error||'无法读取原始文件');if(!entry.url.startsWith(API+'/knowledge/asset/'+id+'?ticket='))throw Error('Invalid asset response');tickets.set(id,entry);}return entry.url+(page?'#page='+Number(page):'');}
export function bindAssets(){for(const img of document.querySelectorAll('img[data-asset]')){if(img.dataset.loading)continue;img.dataset.loading='1';assetTicket(img.dataset.asset).then(url=>{if(img.isConnected)img.src=url}).catch(()=>{img.alt='预览暂不可用';});}for(const a of document.querySelectorAll('a[data-asset]')){a.onclick=async event=>{event.preventDefault();const tab=window.open('about:blank','_blank');if(tab)tab.opener=null;try{const url=await assetTicket(a.dataset.asset,a.dataset.page);if(tab)tab.location.replace(url);else{a.href=url;a.textContent='原文件已准备好，点击打开 ↗';a.onclick=null;}}catch(e){if(tab)tab.close();document.dispatchEvent(new CustomEvent('knowledge-error',{detail:e.message}));}};}}
