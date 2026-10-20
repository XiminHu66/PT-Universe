import {mountPikPak} from './pikpak-account.js';
import {createAccountConnection} from './account-session.js?v=3';
import {createNativeSaver} from './native-download.js';
import {formSpec,chapterIndices,layouts,progressText,recoveryText} from './account-form.js';
export function mountAccountPage(options={}){
 const doc=options.document||document,$=id=>doc.getElementById(id),origin=options.origin||location.origin;
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const bytes=n=>(Number(n||0)/1048576).toFixed(1)+' MiB';
 const note=(message,bad=false)=>{$('notice').textContent=message;$('notice').className=bad?'error':'';};
 let pikpak;
 let current={status:'unpaired'},session=null,generation=0,saver=null,disposed=false,loading=null,sending=false,jobsCache=[],filter='all',transferReady=false,presetKey='',catalog=[],catalogSource='',catalogLoading=false,catalogEpoch=0,catalogTotal=0,pendingAction=null;
 const client=(options.createConnection||createAccountConnection)({...options.connection,origin,onState:renderState});
 pikpak=mountPikPak({client,$,note,current:()=>current,reload});
 function clearFiles(){saver?.dispose();saver=null;$('filesList').replaceChildren();if($('files').open)$('files').close();}
 function renderState(state){
  const previousReadOnly=current.read_only;current=state;pikpak?.render(state);const approved=state.status==='approved'&&!state.unverified;
  const next=approved?state.session_id:null;
  if(next!==session||state.read_only!==previousReadOnly){if(approved)note('');clearAction();session=next;++generation;clearFiles();$('jobs').replaceChildren();$('budget').textContent='';jobsCache=[];transferReady=false;clearCatalog();$('taskSummary').textContent='';$('serviceStatus').textContent='';}
  if(!approved||state.read_only)clearFiles();
  $('sessionStatus').textContent=state.message||(state.status==='approved'?'已登录 · 到期 '+new Date(state.expires_at).toLocaleString('zh-CN'):state.status==='pending'?'等待管理员批准 · 请在五分钟内完成配对':'尚未登录，请申请配对。');
  $('pairCode').textContent=state.pair_code?'配对编号：'+state.pair_code:'';
  $('allowances').textContent=approved&&state.read_only?'只读验收 · 不开放任务操作或文件票据':approved?'本次登录剩余：'+state.jobs_remaining+' 项新任务 · '+state.tickets_remaining+' 张文件票据':'';
  $('pair').disabled=['approved','pending','pairing','disconnecting','logout-failed'].includes(state.status);
  $('logout').disabled=['unpaired','closed','expired','pairing','disconnecting'].includes(state.status);
  $('jobFields').disabled=!approved||!state.can_submit||sending;
  const pilot=approved&&state.scope==='submission-test-no-transfer';
  const fileTest=approved&&state.scope==='three-file-save-test';
  $('pilotFields').hidden=!pilot;$('sourceFields').hidden=pilot||fileTest;
  const novel=approved&&state.scope==='novel-ux-no-transfer';
  if(novel){$('kind').value='novel';$('url').value=state.novel_scope.url;$('textOnly').checked=true;if($('indices').value==='1-3')$('indices').value='1-2';}
  $('kind').disabled=novel;$('url').readOnly=novel;$('textOnly').disabled=novel;
  $('url').required=!pilot&&$('kind').value!=='manga';
  $('novelFields').hidden=$('kind').value!=='novel';$('mangaFields').hidden=$('kind').value!=='manga';$('pikpakFields').hidden=$('kind').value!=='pikpak';$('urlFields').hidden=$('kind').value==='manga';
  const key=pilot?JSON.stringify(state.presets||[]):'';
  if(key!==presetKey){presetKey=key;$('pilotPreset').innerHTML=(state.presets||[]).map((p,i)=>'<option value="'+i+'">'+esc(p.label)+'</option>').join('');}
  if(pilot)$('submitStatus').textContent='指定样例合计最多四项，剩余 '+state.jobs_remaining+' 项。文件传输与下载票据关闭。';
  if(!pilot)$('submitStatus').textContent=approved&&state.read_only?'仅验证登录恢复、额度和退出；任务提交、取消和文件保存未开放。':approved?(state.can_submit?'本次登录最多创建 '+state.job_limit+' 项任务；重建会使用新额度。':'当前只允许查看任务，提交暂未开放。'):'登录后查看提交权限。';
  if(novel)$('submitStatus').textContent='30 分钟小说操作验收 · 固定来源前两章 · 仅文字 · 三种排版 · 全账号最多四项任务（含重建） · 零下载票据。';
  if(fileTest)$('submitStatus').textContent='仅保存三个指定文件，不创建或修改任务。整个账号最多三张票据，每个文件仅一次；失败后请记录结果，勿重复请求。';
  if(!approved){$('jobs').textContent='请先完成登录，网络恢复后可刷新状态。';jobsCache=[];}else renderJobs();
 }
 function clearCatalog(){++catalogEpoch;catalogTotal=0;catalog=[];catalogSource='';$('catalogPanel').hidden=true;$('chapterList').replaceChildren();$('catalogStatus').textContent='';$('selectedCount').textContent='';}
 function selectedChapters(){
  const indices=chapterIndices($('indices').value),max=current.novel_scope?.max_chapter||catalogTotal;
  if(max&&indices.some(i=>i>=max))throw Error('章节序号不能超过 '+max+'。');
  return indices;
 }
 function visibleChapters(){const query=$('catalogSearch').value.trim().toLowerCase();return catalog.filter(c=>(!query||c.title.toLowerCase().includes(query))&&(!current.novel_scope||c.index<current.novel_scope.max_chapter));}
 function drawChapters(){
  let selected=[];try{selected=selectedChapters();$('selectedCount').textContent='已选 '+selected.length+' 章'+(current.novel_scope?' · 本轮仅前两章':' · 每项最多 10,000 章');}catch(e){$('selectedCount').textContent=$('indices').value.trim()?e.message:'尚未选择章节';}
  const selectedSet=new Set(selected);
  $('chapterList').innerHTML=visibleChapters().map(c=>'<label class="check"><input type="checkbox" data-chapter="'+c.index+'"'+(selectedSet.has(c.index)?' checked':'')+'>'+esc((c.index+1)+'. '+c.title)+'</label>').join('')||'<p>没有匹配的章节。</p>';
 }
 function renderJobs(){
  const active=['queued','running','active','waiting'],attention=['error','cancelled','expired'];
  const shown=jobsCache.filter(j=>filter==='all'||filter==='active'&&active.includes(j.status)||filter==='complete'&&j.status==='complete'||filter==='attention'&&attention.includes(j.status));
  $('taskSummary').textContent=jobsCache.length+' 项 · 处理中 '+jobsCache.filter(j=>active.includes(j.status)).length+' · 已完成 '+jobsCache.filter(j=>j.status==='complete').length;
  $('jobs').innerHTML=shown.map(j=>`<article class="task-row"><div class="task-heading"><strong>${esc(j.title||j.kind)}</strong><span class="status-badge">${esc(({queued:'排队中',running:'处理中',active:'下载中',waiting:'等待中',complete:j.kind==='pikpak-account'?'账号已连接':j.kind==='pikpak-cleanup'?'清理已完成':'文件已生成',cancelled:'已取消',expired:'已过期',error:'失败',interrupted:'任务已中断'})[j.status]||j.status)}</span></div><p>${esc(progressText(j))}</p>${j.error?'<p class="task-error">'+esc(j.error)+'</p>':''}${recoveryText(j)?'<p class="caption">'+esc(recoveryText(j))+'</p>':''}${j.source_expires_at?'<p class="caption">临时源文件清理时间参考：'+esc(new Date(j.source_expires_at).toLocaleString('zh-CN'))+'（约 24 小时；传输中的文件会保留）</p>':''}<div class="actions">${j.cleanup_target&&current.can_submit&&!current.read_only?'<button data-purge="'+esc(j.id)+'">永久删除云端副本（释放空间）</button>':''}${j.status==='complete'&&!['pikpak-account','pikpak-cleanup'].includes(j.kind)&&!current.read_only?'<button data-files="'+esc(j.id)+'">查看文件'+(transferReady?' / 保存到本机':'（传输关闭）')+'</button>':''}${!current.read_only&&current.can_submit&&active.includes(j.status)?'<button data-cancel="'+esc(j.id)+'">取消任务</button>':''}${!current.read_only&&current.can_submit&&current.scope!=='submission-test-no-transfer'&&attention.includes(j.status)&&!['pikpak-account','pikpak-cleanup'].includes(j.kind)?'<button data-retry="'+esc(j.id)+'">重建任务（使用新额度）</button>':''}</div></article>`).join('')||'<p>'+ (jobsCache.length?'此分类暂无任务。':'账号暂无任务。')+'</p>';
 }
 async function reload(){
  if(loading)return loading;
  const work=(async()=>{
   try{const state=await client.refresh();if(state.status!=='approved'||disposed)return;
    const g=generation,[jobs,quota,health]=await Promise.all([client.read('/jobs'),client.read('/quota'),client.read('/health')]);
    if(disposed||g!==generation)return;
    if(current.scope==='personal-vps-downloads')await pikpak.refresh();
    jobsCache=jobs.jobs;transferReady=quota.tracking==='active'&&current.can_download!==false&&health.channel==='ready';renderJobs();
    $('serviceStatus').textContent=transferReady?'出站下载通道已响应，可保存到本机；是否保存完成请查看浏览器下载列表。':health.channel==='busy'?'正在传输另一份文件，请等浏览器下载完成后刷新。':health.channel==='offline'?'出站下载通道未连接或未响应，暂不能保存；刷新状态不会消耗下载票据。':'后台文件可独立生成；文件传输当前关闭，暂不能保存到本机。';
    $('budget').textContent='应用自设月预算 '+bytes(quota.limit_bytes)+' · 已传输 '+bytes(quota.transferred_bytes)+' · 已预留 '+bytes(quota.reserved_bytes)+' · 剩余 '+bytes(quota.remaining_bytes)+'；不是云服务商账单。'+(quota.tracking==='active'?'':' 文件传输当前关闭。');
   }catch(e){if(!disposed)note(e.message,true);}
  })();loading=work;try{await work;}finally{if(loading===work)loading=null;}
 }
 async function run(fn){try{await fn();}catch(e){if(!disposed)note(e.message,true);}finally{if(!disposed)renderState(client.current());}}
 if(!options.document&&location.hash){
  const incoming=new URLSearchParams(location.hash.slice(1)),kind=incoming.get('kind'),url=incoming.get('url')||'';
  if(['video','torrent','pikpak'].includes(kind)&&url.length<=2048){$('kind').value=kind;$('url').value=url;}
  history.replaceState(null,'',location.pathname+location.search);
 }
 $('pair').onclick=()=>run(()=>client.pair());$('logout').onclick=()=>run(()=>client.logout());$('refresh').onclick=reload;
 $('mangaProvider').onchange=()=>{const md=$('mangaProvider').value==='mangadex';$('mangaChapterFields').hidden=!md;$('commonsPageFields').hidden=md;};
 $('kind').onchange=()=>{clearCatalog();const kind=$('kind').value;$('urlFields').hidden=kind==='manga';$('url').required=kind!=='manga'&&current.scope!=='submission-test-no-transfer';$('mangaFields').hidden=kind!=='manga';$('novelFields').hidden=kind!=='novel';$('pikpakFields').hidden=kind!=='pikpak';};
 $('layout').onchange=()=>{const p=layouts[$('layout').value]||layouts.compact;$('layoutPreview').style.cssText='font-size:'+p.fontScale+'%;line-height:'+p.lineHeight;for(const el of $('layoutPreview').querySelectorAll('p'))el.style.cssText='text-indent:'+p.indent+'em;margin:0 0 '+p.paragraphGap+'em';};
 $('loadCatalog').onclick=()=>run(async()=>{
  if(catalogLoading)return;catalogLoading=true;$('loadCatalog').disabled=true;
  const source=$('url').value.trim(),g=generation,epoch=++catalogEpoch;$('catalogStatus').textContent='正在读取目录…';
  try{const data=await client.read('/novel/catalog?'+new URLSearchParams({url:source}));if(g!==generation||disposed||source!==$('url').value.trim()||epoch!==catalogEpoch||$('kind').value!=='novel')return;
   catalog=data.chapters;catalogTotal=data.total;catalogSource=source;$('catalogPanel').hidden=false;$('catalogStatus').textContent=data.title+' · '+data.total+' 章'+(data.truncated?'（目录显示前 5000 章，其他章节可输入序号）':'')+' · 每项最多选 10,000 章';drawChapters();
  }catch(e){if(g===generation&&epoch===catalogEpoch&&!disposed){clearCatalog();$('catalogStatus').textContent=e.message;}}
  finally{catalogLoading=false;$('loadCatalog').disabled=false;}
 });
 $('url').oninput=clearCatalog;
 $('catalogSearch').oninput=drawChapters;
 $('indices').onchange=drawChapters;
 $('selectRange').onclick=()=>run(async()=>{selectedChapters();drawChapters();});
 $('selectVisible').onclick=()=>{const selected=visibleChapters().slice(0,10000);$('indices').value=selected.map(c=>c.index+1).join(',');drawChapters();if(visibleChapters().length>10000)note('已选筛选结果的前 10,000 章。');};
 $('clearChapters').onclick=()=>{$('indices').value='';drawChapters();};
 $('chapterList').onchange=e=>{const input=e.target;if(input.dataset?.chapter===undefined)return;let selected=[];try{selected=chapterIndices($('indices').value);}catch{}
  const index=Number(input.dataset.chapter),set=new Set(selected);if(input.checked)set.add(index);else set.delete(index);
  if(set.size>10000){input.checked=false;note('每项最多选择 10,000 章。',true);return;}
  $('indices').value=[...set].sort((a,b)=>a-b).map(i=>i+1).join(',');drawChapters();
 };
 $('taskFilter').onchange=()=>{filter=$('taskFilter').value;renderJobs();};
 $('jobForm').onsubmit=e=>{e.preventDefault();if(sending)return;void run(async()=>{
  const spec=current.scope==='submission-test-no-transfer'?structuredClone(current.presets?.[Number($('pilotPreset').value)]?.spec):formSpec({kind:$('kind').value,url:$('url').value,indices:$('indices').value,textOnly:$('textOnly').checked,layout:$('layout').value,title:$('mangaTitle').value,pages:$('pages').value,mangaProvider:$('mangaProvider').value,mangaChapter:$('mangaChapter').value,pikpakProfile:$('pikpakProfile').value,pikpakCleanup:$('pikpakCleanup').checked});
  if(spec?.kind==='novel')selectedChapters();
  if(!spec)throw Error('请先选择本轮指定样例。');
  sending=true;renderState(current);const g=generation;
  try{const result=await client.submit(spec);if(g!==generation||disposed)return;note('任务已确认：'+result.id+(result.replayed?'（已存在，无重复创建）':''));await reload();}
  catch(e){if(g===generation&&!disposed)note(e.message+' 结果不确定时，请用原内容重试。',true);}
  finally{sending=false;}
 });};
 function clearAction(){pendingAction=null;if($('actionConfirm').open)$('actionConfirm').close();}
 function confirmAction(action){pendingAction=action;$('actionMessage').textContent=action.purge?'永久删除 PikPak 云端文件「'+action.target.name+'」（'+bytes(action.target.bytes)+'，文件 ID：'+action.target.file_id+'）。VPS 副本会保留；云端删除不可恢复。确认只删除这个文件？':action.retry?'按原任务的来源、章节与排版新建任务，将使用一项新额度。继续重建？':'取消后后台将停止此任务。之后重新提交或重建会使用新额度。继续取消？';$('actionConfirm').showModal();}
 $('dismissAction').onclick=clearAction;$('actionConfirm').oncancel=clearAction;
 $('confirmAction').onclick=()=>{const action=pendingAction;clearAction();if(action&&action.generation===generation&&current.can_submit)void run(()=>mutateJob(action));};
 async function mutateJob(action){const g=generation;const result=action.purge?await client.submit({kind:'pikpak-cleanup',...action.target,confirm_permanent:true}):action.retry?await client.submit({retry_of:action.id}):await client.read('/jobs/cancel',{id:action.id});if(g===generation&&!disposed){note(action.purge?'永久删除请求已提交：'+result.id+'；请查看清理任务结果。':action.retry?'重建任务已确认：'+result.id:'任务已取消。');await reload();}}
 $('jobs').onclick=e=>{if(current.read_only)return;const button=e.target.closest('button');if(!button)return;
  const id=button.dataset.files||button.dataset.cancel||button.dataset.retry||button.dataset.purge;if(!/^[a-f0-9]{24}$/.test(id||''))return;
  if(button.dataset.purge){const target=jobsCache.find(j=>j.id===id)?.cleanup_target;if(target&&current.can_submit)confirmAction({id,purge:true,target,generation});return;}
  if(button.dataset.retry||button.dataset.cancel){if(current.can_submit)confirmAction({id,retry:!!button.dataset.retry,generation});return;}
  void run(async()=>{
   const g=generation;button.disabled=true;
   try{
    const data=await client.read('/jobs/files?id='+id);if(g!==generation||disposed)return;clearFiles();
    saver=(options.createSaver||createNativeSaver)({baseURL:origin,ticketPath:'/app-api/download-ticket',onState:s=>{if(g===generation&&!disposed)note(s.message,s.phase==='error');}});
    $('filesList').innerHTML=data.files.map((f,i)=>'<div class="file-row"><strong>'+esc(f.name)+'</strong><p>'+bytes(f.size)+'</p><button data-save="'+i+'"'+(transferReady?'':' disabled')+'>'+(transferReady?'保存到本机':'文件传输未开放')+'</button></div>').join('')||'<p>暂无可保存文件。</p>';
    const activeSaver=saver;$('filesList').onclick=event=>{const b=event.target.closest('button');if(!b||g!==generation||disposed||!transferReady||current.can_download===false)return;const file=data.files[Number(b.dataset.save)];if(file){b.disabled=true;void run(async()=>{try{await activeSaver.save({...file,id});b.textContent='已交给浏览器，请在下载列表确认';await reload();}catch(e){b.disabled=false;await reload();throw e;}});}};$('files').showModal();
   }finally{button.disabled=false;}
  });
 };
 $('closeFiles').onclick=()=>{$('files').close();clearFiles();};
 // Session polling is cookie-only; task refresh is bounded to thirty seconds.

 const schedule=options.setInterval||setInterval,cancel=options.clearInterval||clearInterval;
 const timer=schedule(()=>{if(!doc.hidden)void reload();},30000);
 $('kind').onchange();$('layout').onchange();
 void reload();
 return {reload,client,dispose(){disposed=true;++generation;cancel(timer);client.dispose();clearFiles();clearAction();},current:()=>current};
}
if(typeof document!=='undefined')mountAccountPage();
