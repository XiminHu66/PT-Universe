import {createAccountConnection} from './account-session.js';
import {createNativeSaver} from './native-download.js';
export function mountAccountPage(options={}){
 const doc=options.document||document,$=id=>doc.getElementById(id),origin=options.origin||location.origin;
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const bytes=n=>(Number(n||0)/1048576).toFixed(1)+' MiB';
 const note=(message,bad=false)=>{$('notice').textContent=message;$('notice').className=bad?'error':'';};
 let current={status:'unpaired'},session=null,generation=0,saver=null,disposed=false,loading=null,sending=false;
 const client=(options.createConnection||createAccountConnection)({...options.connection,origin,onState:renderState});
 function clearFiles(){saver?.dispose();saver=null;$('filesList').replaceChildren();if($('files').open)$('files').close();}
 function renderState(state){
  current=state;const approved=state.status==='approved'&&!state.unverified;
  const next=approved?state.session_id:null;
  if(next!==session){session=next;++generation;clearFiles();$('jobs').replaceChildren();$('budget').textContent='';}
  if(!approved)clearFiles();
  $('sessionStatus').textContent=state.message||(state.status==='approved'?'已登录 · 到期 '+new Date(state.expires_at).toLocaleString('zh-CN'):state.status==='pending'?'等待管理员批准 · 请在五分钟内完成配对':'尚未登录，请申请配对。');
  $('pairCode').textContent=state.pair_code?'配对编号：'+state.pair_code:'';
  $('allowances').textContent=approved?'本次登录剩余：'+state.jobs_remaining+' 项新任务 · '+state.tickets_remaining+' 张文件票据':'';
  $('pair').disabled=['approved','pending','pairing','disconnecting','logout-failed'].includes(state.status);
  $('logout').disabled=['unpaired','closed','expired','pairing','disconnecting'].includes(state.status);
  $('jobFields').disabled=!approved||!state.can_submit||sending;
  $('submitStatus').textContent=approved?(state.can_submit?'本次登录最多创建五项任务；仍可查询或重试已提交的任务。':'当前只允许查看任务，提交暂未开放。'):'登录后查看提交权限。';
  if(!approved)$('jobs').textContent='请先完成登录，网络恢复后可刷新状态。';
 }
 async function reload(){
  if(loading)return loading;
  const work=(async()=>{
   try{const state=await client.refresh();if(state.status!=='approved'||disposed)return;
    const g=generation,[jobs,quota]=await Promise.all([client.read('/jobs'),client.read('/quota')]);
    if(disposed||g!==generation)return;
    $('jobs').innerHTML=jobs.jobs.map(j=>`<article class="task-row"><strong>${esc(j.title||j.kind)}</strong><p>${esc(({queued:'排队中',running:'处理中',active:'下载中',waiting:'等待中',complete:'已完成',cancelled:'已取消',expired:'已过期',error:'失败',interrupted:'任务已中断'})[j.status]||j.status)} · ${bytes(j.completed)} / ${bytes(j.total)}</p>${j.error?'<p>'+esc(j.error)+'</p>':''}<div class="actions">${j.status==='complete'?'<button data-files="'+esc(j.id)+'">查看 / 保存文件</button>':''}${['queued','running','active','waiting'].includes(j.status)?'<button data-cancel="'+esc(j.id)+'">取消任务</button>':''}</div></article>`).join('')||'<p>账号暂无任务。</p>';
    $('budget').textContent='应用自设月预算 '+bytes(quota.limit_bytes)+' · 已传输 '+bytes(quota.transferred_bytes)+' · 已预留 '+bytes(quota.reserved_bytes)+' · 剩余 '+bytes(quota.remaining_bytes)+'；不是云服务商账单。'+(quota.tracking==='active'?'':' 文件传输当前关闭。');
   }catch(e){if(!disposed)note(e.message,true);}
  })();loading=work;try{await work;}finally{if(loading===work)loading=null;}
 }
 async function run(fn){try{await fn();}catch(e){if(!disposed)note(e.message,true);}finally{if(!disposed)renderState(client.current());}}
 $('pair').onclick=()=>run(()=>client.pair());$('logout').onclick=()=>run(()=>client.logout());$('refresh').onclick=reload;
 $('kind').onchange=()=>{const kind=$('kind').value;$('urlFields').hidden=kind==='manga';$('url').required=kind!=='manga';$('mangaFields').hidden=kind!=='manga';$('novelFields').hidden=kind!=='novel';};
 $('jobForm').onsubmit=e=>{e.preventDefault();if(sending)return;void run(async()=>{
  const kind=$('kind').value,spec={kind};
  if(kind==='manga'){spec.title=$('mangaTitle').value.trim();spec.files=$('pages').value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);if(!spec.title||spec.files.length<1||spec.files.length>20||spec.files.some(x=>!/^File:[^<>#\r\n]{2,190}\.(png|jpe?g|gif|webp)$/i.test(x)))throw Error('请填写标题与 1–20 个有效 Commons 图片文件名。');}
  else{spec.url=$('url').value.trim();if(!spec.url)throw Error('请填写来源链接。');}
  if(kind==='novel'){const values=$('indices').value.trim().split(/[,，\s]+/);if(values.length>100||values.some(x=>!/^\d+$/.test(x)||Number(x)<1||Number(x)>100001))throw Error('请输入 1–100 项有效章节序号。');spec.indices=[...new Set(values.map(x=>Number(x)-1))];}
  sending=true;renderState(current);const g=generation;
  try{const result=await client.submit(spec);if(g!==generation||disposed)return;note('任务已确认：'+result.id+(result.replayed?'（已存在，无重复创建）':''));await reload();}
  catch(e){if(g===generation&&!disposed)note(e.message+' 结果不确定时，请用原内容重试。',true);}
  finally{sending=false;}
 });};
 $('jobs').onclick=e=>{const button=e.target.closest('button');if(!button)return;
  const id=button.dataset.files||button.dataset.cancel;if(!/^[a-f0-9]{24}$/.test(id||''))return;
  void run(async()=>{
   const g=generation;button.disabled=true;
   try{if(button.dataset.cancel){await client.read('/jobs/cancel',{id});if(g===generation)await reload();return;}
    const data=await client.read('/jobs/files?id='+id);if(g!==generation||disposed)return;clearFiles();
    saver=(options.createSaver||createNativeSaver)({baseURL:origin,ticketPath:'/app-api/download-ticket',onState:s=>{if(g===generation&&!disposed)note(s.message,s.phase==='error');}});
    $('filesList').innerHTML=data.files.map((f,i)=>'<div class="file-row"><strong>'+esc(f.name)+'</strong><p>'+bytes(f.size)+'</p><button data-save="'+i+'">保存到本机</button></div>').join('')||'<p>暂无可保存文件。</p>';
    const activeSaver=saver;$('filesList').onclick=event=>{const b=event.target.closest('button');if(!b||g!==generation||disposed)return;const file=data.files[Number(b.dataset.save)];if(file)void run(()=>activeSaver.save({...file,id}));};$('files').showModal();
   }finally{button.disabled=false;}
  });
 };
 $('closeFiles').onclick=()=>{$('files').close();clearFiles();};
 // Session polling is cookie-only; task refresh is bounded to thirty seconds.

 const schedule=options.setInterval||setInterval,cancel=options.clearInterval||clearInterval;
 const timer=schedule(()=>{if(!doc.hidden)void reload();},30000);
 void reload();
 return {reload,client,dispose(){disposed=true;++generation;cancel(timer);client.dispose();clearFiles();},current:()=>current};
}
if(typeof document!=='undefined')mountAccountPage();
