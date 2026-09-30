import {dateIn,num} from './models.mjs';
export {dateIn,num};
export const root=new URL('../../',import.meta.url);
export const appURL=(path)=>new URL('apps/'+path,root).href;
export const $=(s,el=document)=>el.querySelector(s);
export const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const url=s=>{try{const u=new URL(s);return ['https:','http:'].includes(u.protocol)?u.href:'#'}catch{return '#'}};
export const link=(s,label)=>`<a href="${esc(url(s))}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`;
export const fmt=(n,d=2)=>num(n)===null?'—':Number(n).toLocaleString('zh-CN',{maximumFractionDigits:d});
export const stamp=s=>s&&Number.isFinite(Date.parse(s))?new Date(s).toLocaleString('zh-CN',{timeZone:'America/Los_Angeles',hour12:false})+' PT':'未提供';
export const id=()=>crypto.randomUUID();
export const read=(key,f=[])=>{try{return JSON.parse(localStorage.getItem('ptu.decision.'+key))??f}catch{return f}};
export const raw=(key,f=[])=>{try{return JSON.parse(localStorage.getItem(key))??f}catch{return f}};
export function save(key,value){try{localStorage.setItem('ptu.decision.'+key,JSON.stringify(value));dispatchEvent(new CustomEvent('decision-change',{detail:{key}}));return true}catch{toast('保存失败：本机存储已满或不可用，请先导出备份');return false}}
export const field=(name,label,type='text',value='',extra='')=>`<label>${esc(label)}<input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;
export const area=(name,label,value='',extra='')=>`<label class="d-wide">${esc(label)}<textarea name="${name}" ${extra}>${esc(value)}</textarea></label>`;
export const select=(name,label,choices,value='')=>`<label>${esc(label)}<select name="${name}">${choices.map(([v,t])=>`<option value="${esc(v)}" ${v===value?'selected':''}>${esc(t)}</option>`).join('')}</select></label>`;
export const data=form=>Object.fromEntries(new FormData(form));
export function toast(t){let e=$('#decision-toast');if(!e){e=document.createElement('div');e.id='decision-toast';e.setAttribute('role','status');document.body.append(e)}e.textContent=t;clearTimeout(e.timer);e.timer=setTimeout(()=>e.remove(),4200)}
export async function json(path){const r=await fetch(new URL(path,root),{cache:'no-store',signal:AbortSignal.timeout(18000)});if(!r.ok)throw new Error('读取失败 HTTP '+r.status);return r.json()}
export async function marketData(){const results=await Promise.allSettled([json('apps/stock-alert/data/market.json'),json('apps/stock-alert/data/quotes.json')]);if(results[0].status==='rejected')throw results[0].reason;const m=results[0].value;if(results[1].status==='fulfilled'){const q=results[1].value;for(const [symbol,quote] of Object.entries(q.symbols||{})){const old=m.symbols[symbol];if(old&&Date.parse(quote.lastTradeAt)>Date.parse(old.lastTradeAt))m.symbols[symbol]={...old,...quote};}}return m}
export async function copy(text){try{await navigator.clipboard.writeText(text);toast('已复制')}catch{download('context.txt',text,'text/plain');toast('剪贴板不可用，已下载文本')}}
export function download(name,value,type='application/json'){const blob=new Blob([typeof value==='string'?value:JSON.stringify(value,null,2)],{type}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1500)}
export function ask(title,evidence,question='请基于证据帮我判断下一步，指出缺失信息，并区分事实与推断。') {const packet={id:id(),title,evidence,question,at:new Date().toISOString()};if(!save('handoff',packet))return;const dest=appURL('ask-gpt/?handoff='+packet.id);if(new URLSearchParams(location.search).get('embedded')==='nexus')window.open(dest,'_blank','noopener');else location.href=dest;}
export function backupBar(host,keys,validate){const bar=document.createElement('div');bar.className='d-actions d-backup';bar.innerHTML='<button data-export>导出记录</button><label class="d-button">导入备份<input type="file" accept=".json" hidden data-import></label><small>本机保存 · 可用 PT 加密同步</small>';host.append(bar);$('[data-export]',bar).onclick=()=>download('pt-'+keys[0]+'-'+dateIn()+'.json',{version:1,scope:keys.join(','),records:Object.fromEntries(keys.map(k=>[k,read(k)]))});$('[data-import]',bar).onchange=async e=>{try{const f=e.target.files[0];if(!f)return;if(f.size>2000000)throw Error('备份超过 2 MB');const d=JSON.parse(await f.text());if(d.version!==1||d.scope!==keys.join(',')||!d.records)throw Error('请选择此模块导出的备份');for(const k of keys){if(JSON.stringify(d.records[k]).length>1800000||!safeRecordIds(d.records[k])||!Array.isArray(d.records[k])||d.records[k].length>3000||!validate(k,d.records[k]))throw Error('备份字段无效');}if(!confirm('导入会替换此模块的本机记录。已导出当前记录后再继续。'))return;for(const k of keys)if(!save(k,d.records[k]))return;location.reload()}catch(err){toast(err.message)}finally{e.target.value=''}};}
export function setupPage(){let theme;try{theme=JSON.parse(localStorage.getItem('ptu.theme'))}catch{}document.documentElement.dataset.theme=theme==='dark'?'dark':'light';$('#decision-theme')?.addEventListener('click',()=>{const t=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=t;localStorage.setItem('ptu.theme',JSON.stringify(t))});addEventListener('pt-sync-applied',()=>toast('已接收云端记录，刷新页面查看更新'));}
export function hookSync(render){addEventListener('storage',e=>{if(e.key?.startsWith('ptu.decision.'))render()});addEventListener('pt-sync-applied',render)}
export function errorBox(host,e){host.innerHTML=`<div class="d-empty">${esc(e.message)}。${'<button onclick="location.reload()">重新读取</button>'}</div>`}

function safeRecordIds(v){if(v&&typeof v==='object'){if('id' in v&&(typeof v.id!=='string'||! /^[A-Za-z0-9_-]{1,120}$/.test(v.id)))return false;return Object.values(v).every(safeRecordIds)}return true}
