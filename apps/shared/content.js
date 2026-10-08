/* Shared UI helpers; public snapshots never trigger generation. */
window.PTContent=(()=>{
 const API='https://pt-universe-api.summer07-nanjolno.workers.dev/api/hub/';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const url=v=>{if(!v)return '';try{const u=new URL(String(v),location.href);return ['http:','https:'].includes(u.protocol)?u.href:'';}catch{return '';}};
 const read=(k,f)=>{try{return JSON.parse(localStorage.getItem(k))??f;}catch{return f;}};
 const save=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));}catch{throw Error('本机存储已满，请导出记录后清理空间');}};
 async function get(path,{fallback=null}={}){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),24000);
  try{const r=await fetch(API+path,{signal:controller.signal,cache:'no-store'}),v=await r.json();if(!r.ok)throw Error(v.error||'读取失败');return v;}
  catch(e){if(fallback){const r=await fetch(fallback,{cache:'no-store'});if(r.ok)return {...await r.json(),stale:true,error:'实时来源暂不可用，显示最近成功快照'};}throw e;}
  finally{clearTimeout(timer);}
 }
 const date=v=>{if(!v)return '日期未提供';const d=new Date(v);return Number.isNaN(+d)?v:d.toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});};
 const img=(src,title,cls='hub-cover')=>url(src)?`<img class="${cls}" src="${esc(url(src))}" alt="${esc(title)}" loading="lazy" referrerpolicy="no-referrer">`:`<div class="${cls} hub-placeholder">${esc((title||'作品').slice(0,2))}</div>`;
 function download(name,value){const a=document.createElement('a'),u=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
 function theme(){const apply=value=>{document.documentElement.dataset.theme=value==='dark'?'dark':'light';};apply(read('ptu.theme','light'));addEventListener('message',e=>{if(e.origin!==location.origin)return;if(['nexus-theme','pt-universe-theme'].includes(e.data?.type))apply(e.data.theme);});}
 return {API,esc,url,read,save,get,date,img,download,theme};
})();
