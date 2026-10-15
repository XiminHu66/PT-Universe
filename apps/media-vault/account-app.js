import {createAccountConnection} from './account-session.js';
import {createNativeSaver} from './native-download.js';
import {formSpec,chapterIndices,layouts,progressText,recoveryText} from './account-form.js';
export function mountAccountPage(options={}){
 const doc=options.document||document,$=id=>doc.getElementById(id),origin=options.origin||location.origin;
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const bytes=n=>(Number(n||0)/1048576).toFixed(1)+' MiB';
 const note=(message,bad=false)=>{$('notice').textContent=message;$('notice').className=bad?'error':'';};
 let current={status:'unpaired'},session=null,generation=0,saver=null,disposed=false,loading=null,sending=false,jobsCache=[],filter='all',transferReady=false,presetKey='',catalog=[],catalogSource='',catalogLoading=false;
 const client=(options.createConnection||createAccountConnection)({...options.connection,origin,onState:renderState});
 function clearFiles(){saver?.dispose();saver=null;$('filesList').replaceChildren();if($('files').open)$('files').close();}
 function renderState(state){
  const previousReadOnly=current.read_only;current=state;const approved=state.status==='approved'&&!state.unverified;
  const next=approved?state.session_id:null;
  if(next!==session||state.read_only!==previousReadOnly){session=next;++generation;clearFiles();$('jobs').replaceChildren();$('budget').textContent='';jobsCache=[];transferReady=false;clearCatalog();$('taskSummary').textContent='';$('serviceStatus').textContent='';}
  if(!approved||state.read_only)clearFiles();
  $('sessionStatus').textContent=state.message||(state.status==='approved'?'已登录 · 到期 '+new Date(state.expires_at).toLocaleString('zh-CN'):state.status==='pending'?'等待管理员批准 · 请在五分钟内完成配对':'尚未登录，请申请配对。');
  $('pairCode').textContent=state.pair_code?'配对编号：'+state.pair_code:'';
  $('allowances').textContent=approved&&state.read_only?'只读验收 · 不开放任务操作或文件票据':approved?'本次登录剩余：'+state.jobs_remaining+' 项新任务 · '+state.tickets_remaining+' 张文件票据':'';
  $('pair').disabled=['approved','pending','pairing','disconnecting','logout-failed'].includes(state.status);
  $('logout').disabled=['unpaired','closed','expired','pairing','disconnecting'].includes(state.status);
  $('jobFields').disabled=!approved||!state.can_submit||sending;
  const pilot=approved&&state.scope==='submission-test-no-transfer';
  $('pilotFields').hidden=!pilot;$('sourceFields').hidden=pilot;
  $('url').required=!pilot&&$('kind').value!=='manga';
  const key=pilot?JSON.stringify(state.presets||[]):'';
  if(key!==presetKey){presetKey=key;$('pilotPreset').innerHTML=(state.presets||[]).map((p,i)=>'<option value="'+i+'">'+esc(p.label)+'</option>').join('');}
  if(pilot)$('submitStatus').textContent='指定样例合计最多四项，剩余 '+state.jobs_remaining+' 项。文件传输与下载票据关闭。';
  if(!pilot)$('submitStatus').textContent=approved&&state.read_only?'仅验证登录恢复、额度和退出；任务提交、取消和文件保存未开放。':approved?(state.can_submit?'本次登录最多创建五项任务；仍可查询或重试已提交的任务。':'当前只允许查看任务，提交暂未开放。'):'登录后查看提交权限。';
  if(!approved){$('jobs').textContent='请先完成登录，网络恢复后可刷新状态。';jobsCache=[];}else renderJobs();
 }
 function clearCatalog(){catalog=[];catalogSource='';$('catalogPanel').hidden=true;$('chapterList').replaceChildren();$('catalogStatus').textContent='';}
 function drawChapters(){
  let selected=[];try{selected=chapterIndices($('indices').value);}catch{}
  const query=$('catalogSearch').value.trim().toLowerCase();
  $('chapterList').innerHTML=catalog.filter(c=>!query||c.title.toLowerCase().includes(query)).map(c=>'<label class="check"><input type="checkbox" data-chapter="'+c.index+'"'+(selected.includes(c.index)?' checked':'')+'>'+esc((c.index+1)+'. '+c.title)+'</label>').join('')||'<p>没有匹配的章节。</p>';
 }
 function renderJobs(){
  const active=['queued','running','active','waiting'],attention=['error','cancelled','expired'];
  const shown=jobsCache.filter(j=>filter==='all'||filter==='active'&&active.includes(j.status)||filter==='complete'&&j.status==='complete'||filter==='attention'&&attention.includes(j.status));
  $('taskSummary').textContent=jobsCache.length+' 项 · 处理中 '+jobsCache.filter(j=>active.includes(j.status)).length+' · 已完成 '+jobsCache.filter(j=>j.status==='complete').length;
  $('jobs').innerHTML=shown.map(j=>`<article class="task-row"><div class="task-heading"><strong>${esc(j.title||j.kind)}</strong><span class="status-badge">${esc(({queued:'排队中',running:'处理中',active:'下载中',waiting:'等待中',complete:'已完成',cancelled:'已取消',expired:'已过期',error:'失败',interrupted:'任务已中断'})[j.status]||j.status)}</span></div><p>${esc(progressText(j))}</p>${j.error?'<p class="task-error">'+esc(j.error)+'</p>':''}${recoveryText(j)?'<p class="caption">'+esc(recoveryText(j))+'</p>':''}${j.source_expires_at?'<p class="caption">临时源文件清理时间参考：'+esc(new Date(j.source_expires_at).toLocaleString('zh-CN'))+'（约 24 小时；传输中的文件会保留）</p>':''}<div class="actions">${j.status==='complete'&&!current.read_only?'<button data-files="'+esc(j.id)+'">查看文件'+(transferReady?' / 保存到本机':'（传输关闭）')+'</button>':''}${!current.read_only&&current.can_submit&&active.includes(j.status)?'<button data-cancel="'+esc(j.id)+'">取消任务</button>':''}${!current.read_only&&current.can_submit&&current.scope!=='submission-test-no-transfer'&&attention.includes(j.status)?'<button data-retry="'+esc(j.id)+'">重建任务（使用新额度）</button>':''}</div></article>`).join('')||'<p>'+ (jobsCache.length?'此分类暂无任务。':'账号暂无任务。')+'</p>';
 }
 async function reload(){
  if(loading)return loading;
  const work=(async()=>{
   try{const state=await client.refresh();if(state.status!=='approved'||disposed)return;
    const g=generation,[jobs,quota]=await Promise.all([client.read('/jobs'),client.read('/quota')]);
    if(disposed||g!==generation)return;
    jobsCache=jobs.jobs;transferReady=quota.tracking==='active'&&current.can_download!==false;renderJobs();
    $('serviceStatus').textContent=transferReady?'文件传输已开放。临时文件约保留 24 小时，请及时保存到本机。':'后台任务可独立完成；文件传输当前关闭，暂不能保存到本机。';
    $('budget').textContent='应用自设月预算 '+bytes(quota.limit_bytes)+' · 已传输 '+bytes(quota.transferred_bytes)+' · 已预留 '+bytes(quota.reserved_bytes)+' · 剩余 '+bytes(quota.remaining_bytes)+'；不是云服务商账单。'+(quota.tracking==='active'?'':' 文件传输当前关闭。');
   }catch(e){if(!disposed)note(e.message,true);}
  })();loading=work;try{await work;}finally{if(loading===work)loading=null;}
 }
 async function run(fn){try{await fn();}catch(e){if(!disposed)note(e.message,true);}finally{if(!disposed)renderState(client.current());}}
 $('pair').onclick=()=>run(()=>client.pair());$('logout').onclick=()=>run(()=>client.logout());$('refresh').onclick=reload;
 $('kind').onchange=()=>{const kind=$('kind').value;$('urlFields').hidden=kind==='manga';$('url').required=kind!=='manga'&&current.scope!=='submission-test-no-transfer';$('mangaFields').hidden=kind!=='manga';$('novelFields').hidden=kind!=='novel';};
 $('layout').onchange=()=>{const p=layouts[$('layout').value]||layouts.compact;$('layoutPreview').style.cssText='font-size:'+p.fontScale+'%;line-height:'+p.lineHeight;for(const el of $('layoutPreview').querySelectorAll('p'))el.style.cssText='text-indent:'+p.indent+'em;margin:0 0 '+p.paragraphGap+'em';};
 $('loadCatalog').onclick=()=>run(async()=>{
  if(catalogLoading)return;catalogLoading=true;$('loadCatalog').disabled=true;
  const source=$('url').value.trim(),g=generation;$('catalogStatus').textContent='正在读取目录…';
  try{const data=await client.read('/novel/catalog?'+new URLSearchParams({url:source}));if(g!==generation||disposed||source!==$('url').value.trim())return;
   catalog=data.chapters;catalogSource=source;$('catalogPanel').hidden=false;$('catalogStatus').textContent=data.title+' · '+data.total+' 章'+(data.truncated?'（目录显示前 5000 章，其他章节可输入序号）':'')+' · 每项最多选 100 章';drawChapters();
  }catch(e){if(g===generation&&!disposed){clearCatalog();$('catalogStatus').textContent=e.message;}}
  finally{catalogLoading=false;$('loadCatalog').disabled=false;}
 });
 $('url').oninput=()=>{if(catalogSource&&catalogSource!==$('url').value.trim())clearCatalog();};
 $('catalogSearch').oninput=drawChapters;
 $('indices').onchange=drawChapters;
 $('selectRange').onclick=()=>run(async()=>{chapterIndices($('indices').value);drawChapters();});
 $('clearChapters').onclick=()=>{$('indices').value='';drawChapters();};
 $('chapterList').onchange=e=>{const input=e.target;if(input.dataset?.chapter===undefined)return;let selected=[];try{selected=chapterIndices($('indices').value);}catch{}
  const index=Number(input.dataset.chapter),set=new Set(selected);if(input.checked)set.add(index);else set.delete(index);
  if(set.size>100){input.checked=false;note('每项最多选择 100 章。',true);return;}
  $('indices').value=[...set].sort((a,b)=>a-b).map(i=>i+1).join(',');
 };
 $('taskFilter').onchange=()=>{filter=$('taskFilter').value;renderJobs();};
 $('jobForm').onsubmit=e=>{e.preventDefault();if(sending)return;void run(async()=>{
  const spec=current.scope==='submission-test-no-transfer'?structuredClone(current.presets?.[Number($('pilotPreset').value)]?.spec):formSpec({kind:$('kind').value,url:$('url').value,indices:$('indices').value,textOnly:$('textOnly').checked,layout:$('layout').value,title:$('mangaTitle').value,pages:$('pages').value});
  if(!spec)throw Error('请先选择本轮指定样例。');
  sending=true;renderState(current);const g=generation;
  try{const result=await client.submit(spec);if(g!==generation||disposed)return;note('任务已确认：'+result.id+(result.replayed?'（已存在，无重复创建）':''));await reload();}
  catch(e){if(g===generation&&!disposed)note(e.message+' 结果不确定时，请用原内容重试。',true);}
  finally{sending=false;}
 });};
 $('jobs').onclick=e=>{if(current.read_only)return;const button=e.target.closest('button');if(!button)return;
  const id=button.dataset.files||button.dataset.cancel||button.dataset.retry;if(!/^[a-f0-9]{24}$/.test(id||''))return;
  void run(async()=>{
   const g=generation;button.disabled=true;
   try{if(button.dataset.retry){const result=await client.submit({retry_of:id});if(g===generation){note('重建任务已确认：'+result.id);await reload();}return;}
    if(button.dataset.cancel){await client.read('/jobs/cancel',{id});if(g===generation)await reload();return;}
    const data=await client.read('/jobs/files?id='+id);if(g!==generation||disposed)return;clearFiles();
    saver=(options.createSaver||createNativeSaver)({baseURL:origin,ticketPath:'/app-api/download-ticket',onState:s=>{if(g===generation&&!disposed)note(s.message,s.phase==='error');}});
    $('filesList').innerHTML=data.files.map((f,i)=>'<div class="file-row"><strong>'+esc(f.name)+'</strong><p>'+bytes(f.size)+'</p><button data-save="'+i+'"'+(transferReady?'':' disabled')+'>'+(transferReady?'保存到本机':'文件传输未开放')+'</button></div>').join('')||'<p>暂无可保存文件。</p>';
    const activeSaver=saver;$('filesList').onclick=event=>{const b=event.target.closest('button');if(!b||g!==generation||disposed||!transferReady||current.can_download===false)return;const file=data.files[Number(b.dataset.save)];if(file)void run(()=>activeSaver.save({...file,id}));};$('files').showModal();
   }finally{button.disabled=false;}
  });
 };
 $('closeFiles').onclick=()=>{$('files').close();clearFiles();};
 // Session polling is cookie-only; task refresh is bounded to thirty seconds.

 const schedule=options.setInterval||setInterval,cancel=options.clearInterval||clearInterval;
 const timer=schedule(()=>{if(!doc.hidden)void reload();},30000);
 $('kind').onchange();$('layout').onchange();
 void reload();
 return {reload,client,dispose(){disposed=true;++generation;cancel(timer);client.dispose();clearFiles();},current:()=>current};
}
if(typeof document!=='undefined')mountAccountPage();
