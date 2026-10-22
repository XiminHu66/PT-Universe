import * as M from './model.mjs';
import * as V from './views.mjs?v=2';
import * as T from './triage.mjs?v=2';
import {CONNECTORS,weather} from './sources.mjs';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)],KEY='pt.intelligence.v1';
const labels={task:'任务',project:'项目',decision:'决策',note:'笔记',event:'日程',article:'资讯',paper:'论文',game:'游戏',watch:'监控',stock:'股票',system:'系统'};
const statuses={inbox:'待安排',today:'今天',upcoming:'计划中',someday:'以后',completed:'已完成',active:'进行中',paused:'已暂停',archived:'已归档'};
const navs=[['today','today','今天'],['inbox','inbox','收件箱'],['tasks','tasks','任务'],['projects','projects','项目'],['library','library','记录']];
let s=M.blank(),blocked=false,view=location.hash.slice(1)||'today',taskFilter='inbox',inboxFilter='focus',projectFilter='all',query='',selected=new Set(),searchIndex=0,searchResults=[],refreshing=false,w=null,limit=60,lastSaved=0,inlineId='',sourceFilter='',libraryFilter='all',todayMode='plan',undoLast=null,selectionMode=false;
try{const raw=localStorage.getItem(KEY);if(raw)s=M.normalize(JSON.parse(raw));lastSaved=s.revision||0}catch(e){blocked=true;$('#save-error').hidden=false;$('#save-error').textContent='本机数据无法读取，已暂停写入。请在设置中导出原始数据后恢复。'}
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safe=x=>{try{const u=new URL(x,location.href);return ['http:','https:'].includes(u.protocol)?u.href:'#'}catch{return '#'}};
const txt=x=>String(x||'').trim();
const all=()=>[...s.entities,...s.inbox.map(x=>M.viewItem(s,x))];
const get=id=>all().find(x=>x.id===id);
const projects=()=>M.projects(s);
const badge=(x,cls='')=>`<span class="badge ${cls}">${esc(x)}</span>`;
const button=(label,act,extra='',cls='')=>`<button class="${cls}" data-act="${act}" ${extra}>${label}</button>`;
const when=x=>{if(!x)return '日期未提供';const n=Date.parse(x);if(!Number.isFinite(n))return '日期无效';return new Intl.DateTimeFormat('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'America/Los_Angeles'}).format(new Date(n))};
const ago=x=>{const n=Date.now()-Date.parse(x);return !Number.isFinite(n)?'未提供':n<36e5?'1 小时内':n<864e5?Math.floor(n/36e5)+' 小时前':Math.floor(n/864e5)+' 天前'};
const empty=(title,body,act='',label='')=>`<div class="empty"><b>${title}</b>${body}${act?'<br>'+button(label,act):''}</div>`;
const isStale=x=>x&&Date.now()-Date.parse(x)>36*36e5;
function toast(message,undo=false){$('#toast').innerHTML='<span>'+esc(message)+'</span>'+(undo?V.btn('撤销','undo-last'):'');$('#toast').classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').classList.remove('show'),undo?6500:3000)}
function persist(reason='edit'){
 if(blocked)throw Error('写入已暂停，请先导出并恢复');
 const raw=localStorage.getItem(KEY),remote=raw?JSON.parse(raw):null;if(remote&&(remote.revision||0)!==lastSaved){blocked=true;$('#save-error').hidden=false;$('#save-error').textContent='另一标签页已更新数据，当前写入已暂停。请导出当前记录，再刷新读取最新数据。';throw Error('检测到另一标签页更新；请刷新后重试')}
 const next=M.normalize({...s,revision:lastSaved+1});
 try{if(reason==='import'&&raw)localStorage.setItem(KEY+'.backup',raw);localStorage.setItem(KEY,JSON.stringify(next));s=next;lastSaved=s.revision;$('#save-error').hidden=true}catch(e){$('#save-error').hidden=false;$('#save-error').textContent='保存失败：存储空间不足或不可用。当前改动未安全保存，请立即导出备份。';throw e}
}
function activity(text,id){s.activity.unshift({at:M.stamp(),text,id});s.activity=s.activity.slice(0,150)}
function mutate(fn,message){try{fn();persist();render();if(message)toast(message);return true}catch(e){toast(e.message);return false}}
function nav(to){if(to==='decisions'){to='library';libraryFilter='decision'}if(to==='brief'){to='today';todayMode='brief'}view=navs.some(x=>x[0]===to)||to==='settings'?to:'today';location.hash=view;document.body.classList.remove('menu');query='';selected.clear();selectionMode=false;inlineId='';limit=60;render();window.scrollTo(0,0)}
function context(){return {s,view,taskFilter,inboxFilter,projectFilter,query,selected,selectionMode,inlineId,sourceFilter,libraryFilter,todayMode,w,limit,get,all,ago,when,safe}}
function snapshot(){s.snapshots||={};s.snapshots[M.day()]=Object.fromEntries(s.inbox.map(x=>[x.id,M.hash(x.title+'|'+x.body)]));const keep=Object.keys(s.snapshots).sort().slice(-8);for(const k of Object.keys(s.snapshots))if(!keep.includes(k))delete s.snapshots[k]}
function today(){return V.today(context())}
function inbox(){return V.inbox(context())}
function taskList(){return V.tasks(context())}
function projectList(){return V.projects(context())}
function decisions(){return V.library(context())}
function brief(){return V.brief(context())}
function settings(){return V.settings(context())}
function render(){
 const draft=$('#quick-task [name=title]')?.value,active=document.activeElement,quickFocused=active?.matches('#quick-task [name=title]'),scroll=$('.feed-scroll')?.scrollTop||0,focused=active?.id,caret=active?.matches('input[type=text],input:not([type])')?active.selectionStart:null;
 document.body.dataset.density=s.settings.density;document.body.dataset.view=view;document.body.dataset.selection=selectionMode||selected.size?'on':'off';
 $('#nav').innerHTML=V.navigation(context());$('#mobile-nav').innerHTML=V.navigation(context());
 $('#crumb').textContent=navs.find(x=>x[0]===view)?.[2]||'设置';document.title='PT · '+$('#crumb').textContent;
 $('#main').innerHTML=({today,inbox,tasks:taskList,projects:projectList,library:decisions,settings}[view]||today)();
 $('#sync-label').textContent=refreshing?'正在更新':s.lastRefresh?'更新于 '+when(s.lastRefresh):'';
 const issues=T.sourceIssues(s).length;$('#source-health').innerHTML='<i class="health-dot '+(issues?'warning':'')+'"></i>来源'+(issues?' · '+issues+' 项需检查':'正常');
 $('#refresh-button').classList.toggle('spinning',refreshing);$('#refresh-button').setAttribute('aria-busy',String(refreshing));
 bindForms();wireDrag();if(draft!==undefined&&$('#quick-task [name=title]')){$('#quick-task [name=title]').value=draft;if(quickFocused)$('#quick-task [name=title]').focus({preventScroll:true})}if($('.feed-scroll'))$('.feed-scroll').scrollTop=scroll;
 if(focused&&$('#'+focused)&&!$('dialog[open]')){$('#'+focused).focus({preventScroll:true});if(caret!=null)try{$('#'+focused).setSelectionRange(caret,caret)}catch{}}
}
function newEntity(type,original=null,defaults={}){
 const x=original||{type,...defaults};if(x.readonly)return toast('原始记录为只读。可新建 PoC 任务或在原工具中编辑。');
 if($('#detail').open)$('#detail').close();$$('details.menu[open]').forEach(d=>d.open=false);
 $('#editor-body').innerHTML=V.editor(context(),type,x,original);
 $('#entity-form').onsubmit=e=>{e.preventDefault();const form=e.currentTarget,fd=new FormData(form),existing=form.dataset.id?get(form.dataset.id):null;const value={...existing,id:existing?.id||M.uid(),type,title:txt(fd.get('title')),updatedAt:M.stamp(),createdAt:existing?.createdAt||M.stamp(),timestamp:existing?.timestamp||M.stamp(),source:'PT Intelligence',related:fd.getAll('related')};if(!value.title)return;for(const k of ['body','goal','version','milestone','github','status','due','kind','recurring','context','options','decision','reasoning','expected','reviewDate','outcome','lessons','projectId','url','date','time'])if(fd.has(k))value[k]=txt(fd.get(k));value.priority=Number(fd.get('priority'));value.tags=txt(fd.get('tags')).split(/[,，]/).map(txt).filter(Boolean);if(value.projectId&&!value.related.includes(value.projectId))value.related.push(value.projectId);if(type==='task'){value.order=existing?.order??M.tasks(s).length;value.subtasks=txt(fd.get('subtasks')).split('\n').map(txt).filter(Boolean).map(title=>({title,done:existing?.subtasks?.find(t=>t.title===title)?.done||false}))}if(type==='article')value.action_required=fd.has('action_required');const ok=mutate(()=>{const list=type==='article'?s.inbox:s.entities,at=list.findIndex(t=>t.id===value.id);if(at<0)list.push(value);else list[at]=value;activity((existing?'更新':'创建')+labels[type]+'：'+value.title,value.id);if(value.projectId){const p=s.entities.find(p=>p.id===value.projectId&&!p.readonly);if(p)p.updatedAt=M.stamp()}},'已保存');if(ok)$('#editor').close()};$('#editor').showModal();setTimeout(()=>$('#entity-form [name=title]').focus(),0)
}
function openDetail(id){
 let x=get(id);if(!x)return;const inboxItem=s.inbox.some(i=>i.id===id);if($('#search').open)$('#search').close();
 if(inboxItem){if($('#detail').open)$('#detail').close();
  if(view!=='inbox'){view='inbox';location.hash=view;query='';document.body.classList.remove('menu')}
  if(!T.inboxItems(s,inboxFilter,query,sourceFilter).some(i=>i.id===id)){query='';sourceFilter='';inboxFilter=x.archived?'archived':x.snoozeUntil>M.stamp()?'snoozed':x.saved?'saved':'active'}
  inlineId=id;if(!x.read)mutate(()=>patchMeta(id,{read:true}));else render();
 }else{$('#detail-body').innerHTML=V.detail(context(),x);$('#detail').dataset.id=id;if(!$('#detail').open)$('#detail').showModal();bindForms()}
}
function searchOpen(){searchIndex=0;$('#search-type').innerHTML='<option value="">所有类型</option>'+Object.entries(labels).map(([k,l])=>`<option value="${k}">${l}</option>`).join('');$('#search-project').innerHTML='<option value="">所有项目</option>'+projects().map(p=>`<option value="${esc(p.id)}">${esc(p.title)}</option>`).join('');if($('#detail').open)$('#detail').close();$('#search').showModal();runSearch();$('#search-input').focus()}
function runSearch(){const q=$('#search-input').value.trim();searchResults=M.search(s,q,{type:$('#search-type').value,project:$('#search-project').value,after:$('#search-after').value});if(!q&&!$('#search-type').value&&!$('#search-project').value&&!$('#search-after').value){$('#search-results').innerHTML=`<div class="recent">最近搜索<br>${(s.recentSearches||[]).map(q=>button(esc(q),'recent',`data-query="${esc(q)}"`)).join('')||'<p>输入关键词，搜索所有已收录对象。匹配标题、笔记、理由与结果。</p>'}</div>`;searchResults=[];return}searchIndex=Math.min(searchIndex,Math.max(0,searchResults.length-1));$('#search-results').innerHTML=searchResults.length?searchResults.map((x,i)=>`<button class="search-result ${i===searchIndex?'active':''}" data-act="search-result" data-id="${esc(x.id)}" data-index="${i}">${badge(labels[x.type])}<span><b>${esc(x.title)}</b><small>${esc(x.reasoning||x.body||x.source||'').slice(0,120)}</small></span><small>↵</small></button>`).join(''):empty('没有找到匹配内容','换一个关键词或清除筛选。')}
function close(){for(const id of ['editor','detail','search'])if($('#'+id).open){$('#'+id).close();return}}
function patchMeta(id,patch){const entity=s.entities.find(x=>x.id===id);if(entity&&!entity.readonly)Object.assign(entity,patch);else s.meta[id]={...s.meta[id],...patch}}
function reorderTask(id,delta){const xs=M.tasks(s).filter(t=>!t.readonly).sort((a,b)=>(a.order||0)-(b.order||0)),i=xs.findIndex(t=>t.id===id),j=i+delta;if(i<0||j<0||j>=xs.length)return;[xs[i],xs[j]]=[xs[j],xs[i]];xs.forEach((x,i)=>x.order=i)}
function download(name,data){const a=document.createElement('a'),url=URL.createObjectURL(new Blob([data],{type:'application/json'}));a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
async function loadSource(id){const c=CONNECTORS.find(c=>c.id===id);if(!c)return;s.sources[id]={...s.sources[id],state:'loading'};render();try{const r=await c.load();s.inbox=M.mergeInbox(s.inbox,r.items);if(r.legacy)s.entities=[...s.entities.filter(x=>!x.readonly||x.source!=='PT Todo · 只读快照'),...r.legacy];s.sources[id]={state:'ok',checkedAt:M.stamp(),updatedAt:r.updatedAt||null,count:r.items.length+(r.legacy?.length||0),warning:r.warning||null,detail:r.detail||null};snapshot();persist();return true}catch(e){s.sources[id]={...s.sources[id],state:'error',checkedAt:M.stamp(),error:e.name==='AbortError'?'读取超时；保留已有内容':e.message};try{persist()}catch{}return false}finally{if(!$('#editor').open)render()}}
async function refresh(){if(refreshing)return;refreshing=true;render();await Promise.allSettled(CONNECTORS.map(c=>loadSource(c.id)));s.lastRefresh=M.stamp();try{persist()}catch(e){toast(e.message)}refreshing=false;render()}
function bindForms(){const more=$('#inbox-more');if(more)more.onchange=e=>{if(e.target.value){inboxFilter=e.target.value;inlineId='';selected.clear();render()}};const sf=$('#source-filter');if(sf)sf.onchange=e=>{sourceFilter=e.target.value;inlineId='';render()};const queryInput=$('#list-query');if(queryInput)queryInput.oninput=e=>{const pos=e.target.selectionStart;query=e.target.value;render();const n=$('#list-query');n?.focus();n?.setSelectionRange(pos,pos)};const q=$('#quick-task');if(q)q.onsubmit=e=>{e.preventDefault();const title=txt(new FormData(q).get('title'));if(!title)return;q.querySelector('[name=title]').value='';mutate(()=>{const t={id:M.uid(),type:'task',title,status:view==='today'?'today':['all','completed'].includes(taskFilter)?'inbox':taskFilter,body:'',createdAt:M.stamp(),updatedAt:M.stamp(),priority:1,order:M.tasks(s).length,related:[],source:'PT Intelligence'};s.entities.push(t);activity('添加任务：'+title,t.id)},'已添加任务');$('#quick-task [name=title]')?.focus()};const p=$('#preferences');if(p)p.onsubmit=e=>{e.preventDefault();const fd=new FormData(p);mutate(()=>{s.settings={...s.settings,keywords:txt(fd.get('keywords')),muted:txt(fd.get('muted')),density:fd.get('density'),hideEmpty:s.settings.hideEmpty,modules:s.settings.modules}},'偏好已保存')};$$('[data-select]').forEach(c=>c.onchange=()=>{c.checked?selected.add(c.dataset.select):selected.delete(c.dataset.select);selectionMode=true;render()});$$('[data-subtask]').forEach(c=>c.onchange=()=>{mutate(()=>{const t=s.entities.find(t=>t.id===c.dataset.id);if(t&&!t.readonly){t.subtasks[+c.dataset.subtask].done=c.checked;t.updatedAt=M.stamp()}},'子任务已保存')})}
function wireDrag(){$$('[data-section-drag]').forEach(el=>{el.ondragstart=e=>{e.dataTransfer.setData('text/pt-section',el.dataset.sectionDrag);e.dataTransfer.effectAllowed='move'}});$$('[data-section]').forEach(el=>{el.ondragover=e=>{if([...e.dataTransfer.types].includes('text/pt-section')){e.preventDefault();el.classList.add('dragover')}};el.ondragleave=()=>el.classList.remove('dragover');el.ondrop=e=>{const id=e.dataTransfer.getData('text/pt-section'),target=el.dataset.section;if(!id||id===target)return;e.preventDefault();mutate(()=>{const xs=s.settings.order,i=xs.indexOf(id),j=xs.indexOf(target);xs.splice(i,1);xs.splice(j,0,id)},'首页顺序已保存')}});$$('[data-row][draggable]').forEach(el=>{el.ondragstart=e=>{e.dataTransfer.setData('text/pt-task',el.dataset.row);e.dataTransfer.effectAllowed='move'};el.ondragover=e=>{e.preventDefault();el.classList.add('dragover')};el.ondragleave=()=>el.classList.remove('dragover');el.ondrop=e=>{e.preventDefault();el.classList.remove('dragover');const id=e.dataTransfer.getData('text/pt-task'),target=el.dataset.row;if(!id||id===target)return;mutate(()=>{const xs=M.tasks(s).filter(x=>!x.readonly).sort((a,b)=>(a.order||0)-(b.order||0)),i=xs.findIndex(x=>x.id===id),j=xs.findIndex(x=>x.id===target);if(i<0||j<0)return;const [moving]=xs.splice(i,1);xs.splice(j,0,moving);xs.forEach((x,i)=>x.order=i)},'排序已更新')}})}
const actions={
 nav:b=>nav(b.dataset.view),search:searchOpen,close,new:()=>newEntity(view==='projects'?'project':view==='library'?'note':view==='inbox'?'article':'task'),
 'new-task':()=>newEntity('task'),'new-project':()=>newEntity('project'),'new-decision':()=>newEntity('decision'),'new-note':()=>newEntity('note'),'new-inbox':()=>newEntity('article'),'new-event':()=>newEntity('event'),
 detail:b=>{openDetail(b.dataset.id);bindForms()},edit:b=>{const x=get(b.dataset.id);newEntity(x.type,x)},
 'project-task':b=>newEntity('task',null,{projectId:b.dataset.id,related:[b.dataset.id]}),'project-note':b=>newEntity('note',null,{projectId:b.dataset.id,related:[b.dataset.id]}),'project-decision':b=>newEntity('decision',null,{projectId:b.dataset.id,related:[b.dataset.id]}),
 complete:b=>{const id=b.dataset.id;if(get(id)?.readonly)return;mutate(()=>{M.complete(s,id);const t=get(id);activity((t.status==='completed'?'完成':'重新打开')+'任务：'+t.title,id);if(t.projectId){const p=s.entities.find(p=>p.id===t.projectId&&!p.readonly);if(p)p.updatedAt=M.stamp()}},'任务状态已更新');if($('#detail').open){openDetail(id);bindForms()}},
 save:b=>{const x=get(b.dataset.id);mutate(()=>patchMeta(x.id,{saved:!x.saved}),x.saved?'已取消稍后读':'已加入稍后读');if($('#detail').open)openDetail(x.id)},
 archive:b=>{const x=get(b.dataset.id);mutate(()=>patchMeta(x.id,{archived:!x.archived}),x.archived?'已恢复到 Inbox':'已归档，可在归档列表恢复');if($('#detail').open)$('#detail').close()},
 important:b=>{const x=get(b.dataset.id);mutate(()=>patchMeta(x.id,{important:!x.important}),'重要性已更新');openDetail(x.id)},
 'action-required':b=>{const x=get(b.dataset.id);mutate(()=>patchMeta(x.id,{action_required:!x.action_required}),'行动标记已更新');openDetail(x.id)},
 read:b=>{const x=get(b.dataset.id);mutate(()=>patchMeta(x.id,{read:!x.read}));$('#detail').close()},
 unsnooze:b=>{const x=get(b.dataset.id);mutate(()=>patchMeta(x.id,{snoozeUntil:null}),'已恢复');if($('#detail').open)openDetail(x.id)},
 snooze:b=>{const x=get(b.dataset.id);mutate(()=>patchMeta(x.id,{snoozeUntil:M.morning(M.nextDue(M.day(),'daily')),snoozeCount:(x.snoozeCount||0)+1}),'已推迟到明天早晨');if($('#detail').open)$('#detail').close()},
 convert:b=>{const x=get(b.dataset.id);newEntity('task',null,{title:x.title,body:x.body,url:x.url,related:[x.id],projectId:x.projectId})},
 'convert-note':b=>{const x=get(b.dataset.id);newEntity('note',null,{title:x.title,body:x.body,url:x.url,related:[x.id],projectId:x.projectId})},
 'feedback-up':b=>feedback(b.dataset.id,1),'feedback-down':b=>feedback(b.dataset.id,-1),
 'task-up':b=>{mutate(()=>reorderTask(b.dataset.id,-1),'已上移');if($('#detail').open)openDetail(b.dataset.id)},'task-down':b=>{mutate(()=>reorderTask(b.dataset.id,1),'已下移');if($('#detail').open)openDetail(b.dataset.id)},
 'section-up':b=>moveSection(b.dataset.id,-1),'section-down':b=>moveSection(b.dataset.id,1),
 density:()=>mutate(()=>{s.settings.density=s.settings.density==='compact'?'comfortable':'compact'},'已切换信息密度'),
 'inbox-filter':b=>{inboxFilter=b.dataset.value;selected.clear();render()},'task-filter':b=>{taskFilter=b.dataset.value;render()},'project-filter':b=>{projectFilter=b.dataset.value;render()},
 more:()=>{limit+=60;render()},'select-all':()=>{$$('[data-select]').forEach(el=>selected.add(el.dataset.select));render()},
 'bulk-archive':()=>{if(!selected.size)return toast('请先勾选要归档的信息');mutate(()=>{for(const id of selected)patchMeta(id,{archived:true});activity('批量归档 '+selected.size+' 条信息');selected.clear()},'已归档，可在归档列表恢复')},
 refresh,source:b=>loadSource(b.dataset.id),
 export:()=>download('pt-intelligence-'+M.day()+'.json',blocked?(localStorage.getItem(KEY)||JSON.stringify(s)):JSON.stringify(s,null,2)),
 import:()=>{$('#import-file').dataset.mode='poc';$('#import-file').click()},'legacy-import':()=>{$('#import-file').dataset.mode='legacy';$('#import-file').click()},
 restore:()=>{const raw=localStorage.getItem(KEY+'.backup');if(!raw)return toast('尚无导入前备份');try{const next=M.normalize(JSON.parse(raw));const old=s;s=next;if(!mutate(()=>activity('恢复导入前备份'),'备份已恢复'))s=old}catch(e){toast(e.message)}},
 'search-result':b=>chooseSearch(b.dataset.id),recent:b=>{$('#search-input').value=b.dataset.query;runSearch()}
};
function feedback(id,n){const x=get(id);mutate(()=>{s.feedback[x.source]=Math.max(-5,Math.min(5,(s.feedback[x.source]||0)+n))},'来源偏好已更新：'+s.feedback[x.source]);openDetail(id)}
function moveSection(id,delta){mutate(()=>{const xs=s.settings.order,i=xs.indexOf(id),j=i+delta;if(j>=0&&j<xs.length)[xs[i],xs[j]]=[xs[j],xs[i]]},'首页顺序已保存')}
function chooseSearch(id){const q=txt($('#search-input').value);if(q)mutate(()=>{s.recentSearches=[q,...(s.recentSearches||[]).filter(x=>x!==q)].slice(0,8)});openDetail(id);bindForms()}
$('#import-file').onchange=async e=>{try{const f=e.target.files[0];if(!f)return;if(f.size>10e6)throw Error('文件超过 10 MB');const raw=JSON.parse(await f.text());let next;if(e.target.dataset.mode==='legacy'){if(!Array.isArray(raw.nodes)||!Array.isArray(raw.tasks))throw Error('需要原 PT Todo 的 worklog.json');next=M.normalize({...M.blank(),entities:M.fromLegacy(raw).map(x=>({...x,source:'PT Todo · 导入备份'}))})}else next=M.normalize(raw);const previous=structuredClone(s);const merge=(a,b)=>{const m=new Map(a.map(x=>[x.id,x]));for(const x of b){const old=m.get(x.id);if(!old||String(x.updatedAt||x.timestamp||'')>String(old.updatedAt||old.timestamp||''))m.set(x.id,x)}return [...m.values()]};s={...s,entities:merge(s.entities,next.entities),inbox:merge(s.inbox,next.inbox),meta:{...s.meta,...next.meta},settings:next.settings,feedback:{...s.feedback,...next.feedback},recentSearches:next.recentSearches};activity('导入备份：'+f.name);try{persist('import');render();toast('备份已校验并合并')}catch(err){s=previous;throw err}}catch(err){toast('导入失败：'+err.message)}finally{e.target.value=''}};
function readerBack(){if($('#detail').open){$('#detail').close();return}inlineId='';render()}
function updateInfo(id,patch,message,advance=false){
 const previous=structuredClone(s.meta[id]||{}),previousFilter=inboxFilter,oldItems=T.inboxItems(s,inboxFilter,query,sourceFilter),position=oldItems.findIndex(x=>x.id===id);
 if(!mutate(()=>patchMeta(id,patch)))return;
 undoLast={metas:[[id,previous]],filter:previousFilter,selected:id};
 if(advance&&inlineId===id){const next=T.inboxItems(s,inboxFilter,query,sourceFilter);inlineId=next[Math.min(Math.max(position,0),next.length-1)]?.id||'';if(inlineId)patchMeta(inlineId,{read:true});try{persist()}catch(e){toast(e.message)}}
 render();toast(message,true);
}
function addToday(id){const x=get(id);if(!x)return;const before=new Map(M.tasks(s).map(t=>[t.id,structuredClone(t)])),meta=structuredClone(s.meta[id]||{});let result;
 const current=T.inboxItems(s,inboxFilter,query,sourceFilter),position=current.findIndex(t=>t.id===id),inInbox=s.inbox.some(t=>t.id===id);
 if(!mutate(()=>{result=T.addToday(s,x);if(inInbox)patchMeta(id,{archived:true,read:true});activity('加入今日：'+x.title,result.task.id)}))return;
 undoLast={metas:inInbox?[[id,meta]]:[],filter:inboxFilter,selected:id,taskId:result.task.id,oldTask:before.get(result.task.id)||null};
 if(inlineId===id){const next=T.inboxItems(s,inboxFilter,query,sourceFilter);inlineId=next[Math.min(Math.max(position,0),next.length-1)]?.id||'';if(inlineId){patchMeta(inlineId,{read:true});try{persist()}catch(e){toast(e.message)}}}
 if($('#detail').open)$('#detail').close();render();toast(inInbox?'已加入今日，原信息已归档':'已加入今日',true);
}
Object.assign(actions,{
 'menu-close':()=>document.body.classList.remove('menu'),
 'view-changes':()=>{nav('inbox');inboxFilter='changes';render()},
 'reader-back':readerBack,'add-today':b=>addToday(b.dataset.id),
 'plan-today':b=>{const x=get(b.dataset.id);if(!x||x.readonly)return;mutate(()=>{const t=s.entities.find(t=>t.id===x.id);t.status='today';t.snoozeUntil=null;t.updatedAt=M.stamp()},'已安排到今天');if($('#detail').open)openDetail(x.id)},
 'pick-tasks':()=>{taskFilter='inbox';nav('tasks')},'today-mode':b=>{todayMode=b.dataset.value;render()},
 'library-filter':b=>{libraryFilter=b.dataset.value;render()},
 'inbox-filter':b=>{inboxFilter=b.dataset.value;inlineId='';selected.clear();selectionMode=false;render()},
 'toggle-selection':()=>{selectionMode=!selectionMode;selected.clear();render()},
 'clear-selection':()=>{selected.clear();selectionMode=false;render()},
 'bulk-archive':()=>{if(!selected.size)return;const ids=[...selected];undoLast={metas:ids.map(id=>[id,structuredClone(s.meta[id]||{})]),filter:inboxFilter,selected:inlineId};if(mutate(()=>{ids.forEach(id=>patchMeta(id,{archived:true}));activity('归档 '+ids.length+' 条信息');selected.clear();inlineId=''}))toast('已归档 '+ids.length+' 条信息',true)},
 archive:b=>{const x=get(b.dataset.id);if(!x)return;updateInfo(x.id,{archived:!x.archived},x.archived?'已恢复到收件箱':'已归档',!x.archived)},
 save:b=>{const x=get(b.dataset.id);if(!x)return;updateInfo(x.id,{saved:!x.saved},x.saved?'已取消稍后读':'已保存到稍后读',inboxFilter==='focus'&&!x.saved)},
 snooze:b=>{const x=get(b.dataset.id);if(!x)return;if(s.inbox.some(t=>t.id===x.id))updateInfo(x.id,{snoozeUntil:M.morning(M.nextDue(M.day(),'daily')),snoozeCount:(x.snoozeCount||0)+1},'明天 9 点再看',true);else{mutate(()=>patchMeta(x.id,{snoozeUntil:M.morning(M.nextDue(M.day(),'daily')),snoozeCount:(x.snoozeCount||0)+1}),'已推迟到明天');if($('#detail').open)$('#detail').close()}},
 unsnooze:b=>{const x=get(b.dataset.id);updateInfo(x.id,{snoozeUntil:null},'已取消推迟')},
 important:b=>{const x=get(b.dataset.id);updateInfo(x.id,{important:!x.important},'重要性已更新')},
 'action-required':b=>{const x=get(b.dataset.id);updateInfo(x.id,{action_required:!x.action_required},'待处理标记已更新')},
 read:b=>{const x=get(b.dataset.id);updateInfo(x.id,{read:!x.read},x.read?'已标记未读':'已标记已读');inlineId='';render()},
 'undo-last':()=>{const previous=undoLast;if(!previous)return;if(mutate(()=>{for(const [id,meta]of previous.metas)s.meta[id]=meta;if(previous.taskId){s.entities=s.entities.filter(x=>x.id!==previous.taskId);if(previous.oldTask)s.entities.push(previous.oldTask)}inboxFilter=previous.filter;inlineId=previous.selected;undoLast=null},'已撤销'))render()}
});
document.addEventListener('click',e=>{if(e.target.matches('input[type=checkbox]'))return;const b=e.target.closest('[data-act]');if(!b)return;const fn=actions[b.dataset.act];if(fn){e.preventDefault();b.closest('details.menu')?.removeAttribute('open');try{Promise.resolve(fn(b)).catch(err=>toast(err.message))}catch(err){toast(err.message)}}});
$('#mobile-menu').onclick=()=>document.body.classList.toggle('menu');
$('#search-input').oninput=()=>{searchIndex=0;runSearch()};for(const el of [$('#search-type'),$('#search-project'),$('#search-after')])el.onchange=()=>{searchIndex=0;runSearch()};
$('#search').onkeydown=e=>{if(e.isComposing)return;if(['ArrowDown','ArrowUp'].includes(e.key)&&searchResults.length){e.preventDefault();searchIndex=(searchIndex+(e.key==='ArrowDown'?1:-1)+searchResults.length)%searchResults.length;runSearch();$('.search-result.active')?.scrollIntoView({block:'nearest'})}else if(e.key==='Enter'&&searchResults.length){e.preventDefault();chooseSearch(searchResults[searchIndex].id)}};
document.addEventListener('keydown',e=>{if(e.isComposing)return;const mod=e.metaKey||e.ctrlKey,editing=e.target.matches('input,textarea,select,[contenteditable=true]');if(mod&&e.key.toLowerCase()==='k'){e.preventDefault();if(!$('#editor').open&&!$('#search').open)searchOpen()}else if(mod&&e.key==='Enter'&&$('#editor').open){e.preventDefault();$('#entity-form').requestSubmit()}else if((mod&&e.key.toLowerCase()==='n'||e.key.toLowerCase()==='n'&&!editing&&!mod)&&!$('dialog[open]')){e.preventDefault();actions.new()}else if(view!=='inbox'&&!editing&&!$('dialog[open]')&&['ArrowUp','ArrowDown'].includes(e.key)){const rows=$$('[data-row]');if(!rows.length)return;let i=rows.indexOf(document.activeElement);i=(i+(e.key==='ArrowDown'?1:-1)+rows.length)%rows.length;e.preventDefault();rows[i].focus()}else if(e.key==='Enter'&&e.target.matches('[data-row]')){e.preventDefault();openDetail(e.target.dataset.row);bindForms()}});
document.addEventListener('keydown',e=>{if(e.isComposing||e.ctrlKey||e.metaKey||e.altKey||e.target.matches('input,textarea,select,[contenteditable=true]')||$('dialog[open]')||view!=='inbox')return;const key=e.key.toLowerCase(),xs=T.inboxItems(s,inboxFilter,query,sourceFilter);if(['j','k','arrowdown','arrowup'].includes(key)&&xs.length){e.preventDefault();const i=xs.findIndex(x=>x.id===inlineId),forward=['j','arrowdown'].includes(key),next=xs[i<0?(forward?0:xs.length-1):(i+(forward?1:-1)+xs.length)%xs.length];openDetail(next.id);document.querySelector('.feed-row.selected')?.scrollIntoView({block:'nearest'})}else if(key==='escape'&&inlineId){readerBack()}else if(inlineId&&['e','l','h'].includes(key)){e.preventDefault();actions[{e:'archive',l:'save',h:'snooze'}[key]]({dataset:{id:inlineId}})}});
addEventListener('hashchange',()=>{const next=location.hash.slice(1)||'today';if(next!==view)nav(next)});
addEventListener('storage',e=>{if(e.key===KEY&&e.newValue){if($('dialog[open]')){toast('另一标签页更新了数据，关闭编辑后刷新读取。');return}try{s=M.normalize(JSON.parse(e.newValue));lastSaved=s.revision;render()}catch{toast('另一标签页记录格式异常')}}});
addEventListener('beforeunload',e=>{if(!$('#save-error').hidden){e.preventDefault();e.returnValue=''}});
if(view==='decisions'){view='library';libraryFilter='decision'}if(view==='brief'){view='today';todayMode='brief'}render();if(!blocked)refresh();weather().then(value=>{w=value;if(view==='today'&&!$('dialog[open]'))render()}).catch(()=>{});
setInterval(()=>{if(document.visibilityState==='visible'&&!$('dialog[open]')&&!blocked)refresh()},15*60e3);
if('serviceWorker' in navigator&&location.protocol==='https:')navigator.serviceWorker.register('./sw.js',{scope:'./'}).catch(()=>{});
