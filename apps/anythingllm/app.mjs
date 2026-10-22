import {esc,markdown,consumeChat,directBase,normalizeBackup} from './core.mjs?v=1';
const API='https://pt-universe-api.summer07-nanjolno.workers.dev/api/anythingllm';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const read=(key,fallback,storage=localStorage)=>{try{return JSON.parse(storage.getItem(key))??fallback}catch{return fallback}};
const stateKey='anythingllm.state.v1',configKey='anythingllm.config.v1',keyKey='anythingllm.keys.v1';
const defaults={version:1,workspaces:[{id:'general',name:'日常对话',icon:'◌',system:'你是一位清晰、诚实、有帮助的助手。默认使用中文回答。',temperature:.7,maxTokens:2048},{id:'research',name:'研究与阅读',icon:'◈',system:'你是一位研究助手。清楚区分证据、推断与未知。解释问题、机制、证据与局限，给出可执行的下一步。没有联网工具时不要声称已检索。默认中文。',temperature:.3,maxTokens:4096},{id:'code',name:'代码与构建',icon:'⌘',system:'你是一位务实的软件工程伙伴。先解释问题与最小修复，再给出可运行的代码。明确假设与验证方法。默认中文。',temperature:.3,maxTokens:4096}],chats:[]};
let state=read(stateKey,structuredClone(defaults)),configs=read(configKey,{}),keys=read(keyKey,{},sessionStorage),workspaceId=read('anythingllm.workspace','general'),chatId=read('anythingllm.chat',''),providers=[],providerId=read('anythingllm.provider','gemini'),busy=false,controller=null,files=[],models={},saveTimer=null;
if(!state.workspaces?.length||!Array.isArray(state.chats))state=structuredClone(defaults);
if(!state.workspaces.some(w=>w.id===workspaceId))workspaceId=state.workspaces[0].id;
for(const c of state.chats)for(const m of c.messages||[])if(m.status==='streaming')m.status='stopped';
const labels={free:'持续免费额度',evaluation:'开发评估',trial:'限时试用',conditional:'资格 / 活动',paid:'已无免费额度',retired:'已退役',local:'本地自建',custom:'自定义'};
const provider=()=>providers.find(p=>p.id===providerId),workspace=()=>state.workspaces.find(w=>w.id===workspaceId),chat=()=>state.chats.find(c=>c.id===chatId&&c.workspace===workspaceId),cfg=(id=providerId)=>configs[id]||{},pair=()=>read('ptu.sync.config',null);
function persist(){try{localStorage.setItem(stateKey,JSON.stringify(state));localStorage.setItem('anythingllm.workspace',JSON.stringify(workspaceId));localStorage.setItem('anythingllm.chat',JSON.stringify(chatId))}catch{notice('浏览器存储空间不足；请先导出备份，避免刷新后丢失内容。')}}
function saveConfig(){localStorage.setItem(configKey,JSON.stringify(configs));sessionStorage.setItem(keyKey,JSON.stringify(keys));localStorage.setItem('anythingllm.provider',JSON.stringify(providerId))}
function notice(text=''){const n=$('#notice');n.textContent=text;n.hidden=!text}
function showDialog(id){const d=$(id);if(!d.open)d.showModal()}
function closeDialogs(){$$('dialog[open]').forEach(d=>d.close())}
function ask(title,text){return new Promise(resolve=>{$('#confirm-title').textContent=title;$('#confirm-text').textContent=text;const d=$('#confirm-dialog');d.showModal();let settled=false;const end=v=>{if(settled)return;settled=true;d.close();resolve(v)};$('#confirm-cancel').onclick=()=>end(false);$('#confirm-ok').onclick=()=>end(true);d.oncancel=()=>end(false)})}
function ready(id=providerId){return !!keys[id]||(id==='gemini'&&cfg(id).shared&&!!pair())||(['custom','ollama'].includes(id)&&!!cfg(id).baseUrl&&!!cfg(id).model)}
function renderSidebar(){
 $('#workspaces').innerHTML=state.workspaces.map(w=>`<button class="workspace ${w.id===workspaceId?'active':''}" data-workspace="${esc(w.id)}"><span class="workspace-icon">${esc(w.icon||'◈')}</span>${esc(w.name)}<small>${state.chats.filter(c=>c.workspace===w.id).length||''}</small></button>`).join('');
 const filter=$('#search-chats').value.toLowerCase(),list=state.chats.filter(c=>c.workspace===workspaceId&&(!filter||(c.title+' '+c.messages.map(m=>m.content).join(' ')).toLowerCase().includes(filter))).sort((a,b)=>b.updatedAt-a.updatedAt);
 $('#chat-count').textContent=list.length||'';
 $('#history').innerHTML=list.length?list.map(c=>`<button class="history-item ${c.id===chatId?'active':''}" data-chat="${esc(c.id)}"><span>↳</span><span>${esc(c.title)}</span></button>`).join(''):'<div class="empty-history">从一个问题开始，<br>让想法慢慢展开。</div>';
 $('#workspace-label').textContent=workspace().name;$('#chat-title').textContent=chat()?.title||'新对话';
 $$('[data-workspace]').forEach(b=>b.onclick=()=>{if(busy)return;workspaceId=b.dataset.workspace;chatId='';files=[];render();persist();$('#sidebar').classList.remove('open')});
 $$('[data-chat]').forEach(b=>b.onclick=()=>{if(busy)return;chatId=b.dataset.chat;files=[];render();persist();$('#sidebar').classList.remove('open')});
}
function renderModels(){
 const p=provider();if(!p)return;
 $('#provider-select').innerHTML=providers.filter(p=>p.kind!=='retired').map(p=>`<option value="${esc(p.id)}" ${p.id===providerId?'selected':''}>${esc(p.name)}${ready(p.id)?' · 已配置':''}</option>`).join('');
 $('#model-input').value=cfg().model||p.models[0]||'';
 $('#model-list').innerHTML=(models[p.id]||p.models).map(m=>`<option value="${esc(typeof m==='string'?m:m.id)}"></option>`).join('');
 const n=$('#connection');n.className='connection'+(ready()?' ready':'');n.innerHTML='<i></i>'+(ready()?(cfg().shared&&!keys[p.id]?'后台 Gemini':'已配置 · 按需调用'):'待配置');
}
function renderMessages(){
 const c=chat(),messages=c?.messages||[];$('#welcome').hidden=messages.length>0;$('#messages').hidden=!messages.length;
 $('#messages').innerHTML=messages.map((m,i)=>`<article class="message ${m.role}" data-message="${esc(m.id)}"><div class="message-header"><span class="avatar">${m.role==='user'?'你':'✳'}</span>${m.role==='user'?'你':esc(providers.find(p=>p.id===m.provider)?.name||'助手')}<span class="message-meta">${m.role==='assistant'?esc(m.model||'')+(m.status==='streaming'?' · 生成中':m.status==='stopped'?' · 已停止':''):''}</span></div><div class="message-content">${m.content?markdown(m.content):'<span class="pending">正在等待模型回答…</span>'}</div>${m.error?`<div class="message-error">${esc(m.error)}</div>`:''}<div class="message-actions"><button data-copy="${esc(m.id)}">复制</button>${m.role==='assistant'&&i===messages.length-1&&m.status!=='streaming'?'<button data-retry>重新生成</button>':''}${m.role==='user'&&i===messages.findLastIndex(m=>m.role==='user')?'<button data-edit="'+esc(m.id)+'">编辑后重发</button>':''}</div></article>`).join('');
 $$('[data-copy]').forEach(b=>b.onclick=async()=>{try{await navigator.clipboard.writeText(c.messages.find(m=>m.id===b.dataset.copy).content);b.textContent='已复制'}catch{notice('浏览器无法复制，请手动选择文字复制。')}});
 $$('[data-retry]').forEach(b=>b.onclick=()=>resend(false));
 $$('[data-edit]').forEach(b=>b.onclick=async()=>{if(busy)return;const index=c.messages.findIndex(m=>m.id===b.dataset.edit);if(!await ask('编辑并重新发送','此消息之后的回答会被移除。'))return;$('#prompt').value=c.messages[index].content;c.messages=c.messages.slice(0,index);persist();renderMessages();$('#prompt').focus()});
}
function renderFiles(){$('#attachments').innerHTML=files.map((f,i)=>`<span class="attachment">▤ ${esc(f.name)} <small>${Math.round(f.text.length/1000)}K 字符</small><button data-remove-file="${i}" aria-label="移除附件">×</button></span>`).join('');$$('[data-remove-file]').forEach(b=>b.onclick=()=>{files.splice(Number(b.dataset.removeFile),1);renderFiles()})}
function render(){renderSidebar();renderMessages();renderModels();renderFiles();setBusy(busy)}
function setBusy(value){busy=value;$('#send').hidden=value;$('#stop').hidden=!value;for(const id of ['new-chat','provider-select','model-input','refresh-models','settings-open','workspace-settings','delete-chat','add-workspace','attach'])$('#'+id).disabled=value;$$('[data-workspace],[data-chat],[data-retry],[data-edit]').forEach(b=>b.disabled=value)}
function scrollBottom(){const s=$('#scroll');s.scrollTop=s.scrollHeight}
function credentials(id,override){const config=override||cfg(id);return {provider:id,apiKey:override?.key??keys[id]??'',accountId:config.accountId||'',allowPaid:config.allowPaid===true,...(id==='gemini'&&config.shared?{owner:pair()?.id||''}:{})}}
async function request(path,body,signal){const pairConfig=pair();return fetch(API+'/'+path,{method:'POST',cache:'no-store',headers:{'content-type':'application/json',...(body.owner&&pairConfig?.token?{authorization:'Bearer '+pairConfig.token}:{})},body:JSON.stringify(body),signal})}
async function chatResponse(id,config,messages,signal,override){
 const payload={model:config.model,messages,temperature:workspace().temperature,max_tokens:override?128:workspace().maxTokens,stream:true};
 if(['custom','ollama'].includes(id)){
  const base=directBase(config.baseUrl||(id==='ollama'?'http://localhost:11434/v1':''));
  return fetch(base+'/chat/completions',{method:'POST',headers:{'content-type':'application/json',...((override?.key??keys[id])?{authorization:'Bearer '+(override?.key??keys[id])}:{})},body:JSON.stringify(payload),signal,redirect:'error'});
 }
 return request('chat',{...credentials(id,override),model:payload.model,messages,maxTokens:payload.max_tokens,temperature:payload.temperature},signal);
}
async function send(textOverride){
 if(busy)return;
 const prompt=$('#prompt'),text=(textOverride??prompt.value).trim();if(!text&&!files.length)return;
 if(!provider()||!cfg().model){notice('请先选择后端与模型，再发送消息。');openSettings();return}
 if(!ready()){notice('先连接此后端：填写个人 API Key，或选择原有后台 Gemini。');openSettings();return}
 const attached=files.map(f=>`\n\n--- 附件：${f.name} ---\n${f.text}\n--- 附件结束 ---`).join(''),content=text+attached;
 if(content.length>60000){notice('消息与附件超过 60,000 字符，请减少内容。');return}
 let c=chat();if(!c){c={id:crypto.randomUUID(),workspace:workspaceId,title:(text||files[0]?.name||'新对话').slice(0,28),updatedAt:Date.now(),messages:[]};state.chats.push(c);chatId=c.id}
 c.messages.push({id:crypto.randomUUID(),role:'user',content,status:'done'});c.updatedAt=Date.now();prompt.value='';prompt.style.height='';files=[];persist();renderSidebar();renderFiles();await generate(c);
}
async function generate(c){
 const id=providerId,config={...cfg()},output={id:crypto.randomUUID(),role:'assistant',provider:id,model:config.model,content:'',status:'streaming'};
 const complete=c.messages.filter(m=>m.status==='done'&&m.content).slice(-40).map(m=>({role:m.role,content:m.content}));
 const messages=[...(workspace().system?[{role:'system',content:workspace().system}]:[]),...complete];
 if(messages.reduce((n,m)=>n+m.content.length,0)>120000){notice('当前对话超过 120,000 字符，请新建对话后继续。');return}
 c.messages.push(output);controller=new AbortController();const timeout=setTimeout(()=>controller?.abort('timeout'),150000),started=Date.now();notice();renderMessages();setBusy(true);persist();scrollBottom();
 let lastRender=0;
 try{
  const response=await chatResponse(id,config,messages,controller.signal);
  const result=await consumeChat(response,(delta,meta)=>{output.content+=delta;if(meta.model)output.model=meta.model;const now=Date.now();if(now-lastRender>80){const nearBottom=$('#scroll').scrollHeight-$('#scroll').scrollTop-$('#scroll').clientHeight<160;const element=document.querySelector(`[data-message="${output.id}"] .message-content`);if(element)element.innerHTML=markdown(output.content);if(nearBottom)scrollBottom();lastRender=now}if(!saveTimer)saveTimer=setTimeout(()=>{saveTimer=null;persist()},600)});
  output.status='done';output.model=result.model||config.model;output.usage=result.usage;const tokens=result.usage?.total_tokens;$('#usage').textContent=`${((Date.now()-started)/1000).toFixed(1)} 秒${tokens?' · '+tokens+' tokens':''} · ${output.model}`;
 }catch(e){const aborted=controller.signal.aborted;output.status=aborted?'stopped':'error';output.error=aborted?(controller.signal.reason==='timeout'?'等待超时，已保留收到的内容。':'已停止生成，收到的内容已保留。'):(typeof e.message==='string'?e.message:'请求失败');if(!aborted&&e instanceof TypeError)output.error='无法连接后端。自建接口请检查 CORS、本地网络权限与 HTTPS；云端接口请稍后重试。';if(e.retryAfter)output.error+=`（建议 ${e.retryAfter} 秒后重试）`;
 }finally{clearTimeout(timeout);if(saveTimer){clearTimeout(saveTimer);saveTimer=null}controller=null;c.updatedAt=Date.now();persist();setBusy(false);renderSidebar();renderMessages();scrollBottom()}
}
async function resend(){if(busy)return;const c=chat();if(!c)return;const last=c.messages.at(-1);if(last?.role==='assistant'){if(!await ask('重新生成回答','将替换最后一条回答，使用顶部当前选择的后端和模型。'))return;c.messages.pop()}await generate(c)}
function openSettings(id=providerId){
 const p=providers.find(p=>p.id===id);if(!p||p.kind==='retired')return;
 const config=cfg(id);$('#setting-provider').value=id;$('#settings-title').textContent=p.name;$('#provider-description').innerHTML=esc(p.quota)+'<small>'+esc(p.requirements)+'<br>'+esc(p.note)+'</small>';
 $('#provider-links').innerHTML=(p.signup?`<a href="${esc(p.signup)}" target="_blank" rel="noopener noreferrer">注册 / 获取 Key ↗</a>`:'')+(p.docs?`<a href="${esc(p.docs)}" target="_blank" rel="noopener noreferrer">官方说明 ↗</a>`:'');
 $('#api-key').value=keys[id]||'';$('#account-field').hidden=id!=='cloudflare';$('#account-id').value=config.accountId||'';$('#base-field').hidden=!['custom','ollama'].includes(id);$('#base-url').value=config.baseUrl||p.base||'';$('#setting-model').value=config.model||p.models[0]||'';
 $('#shared-row').hidden=id!=='gemini';$('#use-shared').checked=!!config.shared;$('#allow-paid').checked=!!config.allowPaid;
 $('#shared-info').hidden=id!=='gemini';$('#shared-info').textContent=pair()?'已检测到本浏览器的 PT 配对码。后台资格需连接测试确认。':'未检测到 PT 配对码。可在 Daily Nexus「备份与同步」连接原有配对码，或直接填写个人 Gemini Key。';$('#test-result').textContent='';showDialog('#settings-dialog');
}
function formConfig(){const id=$('#setting-provider').value;return {id,key:$('#api-key').value.trim(),model:$('#setting-model').value.trim(),accountId:$('#account-id').value.trim(),baseUrl:['custom','ollama'].includes(id)?$('#base-url').value.trim():'',shared:id==='gemini'&&$('#use-shared').checked,allowPaid:$('#allow-paid').checked}}
function validateConfig(c){const p=providers.find(p=>p.id===c.id);if(!c.model)throw Error('请填写模型 ID');if(!c.key&&!c.shared&&!['custom','ollama'].includes(c.id))throw Error('请填写 API Key');if(c.shared&&!c.key&&!pair())throw Error('未连接原有 PT 配对码；请连接或填写个人 Key');if(c.id==='cloudflare'&&!/^[a-f0-9]{32}$/i.test(c.accountId))throw Error('Account ID 应为 32 位');if(['custom','ollama'].includes(c.id))directBase(c.baseUrl);if(!c.allowPaid&&['trial','evaluation','conditional','paid'].includes(p.kind))throw Error('请先核对该后端额度，再勾选使用资格确认');if(!c.allowPaid&&p.freeModels&&!p.freeModels.includes(c.model))throw Error('模型不在已核实的免费清单中，请核对价格后勾选允许其他模型');if(!c.allowPaid&&c.id==='openrouter'&&c.model!=='openrouter/free'&&!c.model.endsWith(':free'))throw Error('免费模式只接受 openrouter/free 或 :free 型号')}
function renderCatalog(){
 const query=$('#provider-search').value.toLowerCase(),filter=$('#kind-filter').value;
 const list=providers.filter(p=>(filter==='all'||filter==='recommended'&&!['paid','retired','custom','local'].includes(p.kind)||filter==='local'&&['local','custom'].includes(p.kind)||p.kind===filter)&&JSON.stringify(p).toLowerCase().includes(query));
 $('#catalog-summary').textContent=`${list.length} 个入口 · ${providers.filter(p=>p.kind==='free').length} 家提供持续免费额度`;
 $('#provider-grid').innerHTML=list.map(p=>`<article class="provider-card"><div class="provider-card-top"><span class="provider-icon">${esc(p.name[0])}</span><span class="badge ${p.kind==='free'?'free':''}">${esc(labels[p.kind])}</span></div><h3>${esc(p.name)}</h3><p class="quota">${esc(p.quota)}</p><p>${esc(p.requirements)}</p><p>${esc(p.note)}</p><div class="card-bottom">${p.docs?`<a href="${esc(p.docs)}" target="_blank" rel="noopener noreferrer">官方说明 ↗</a>`:'<span></span>'}${p.kind==='retired'?'<span class="badge">不可调用</span>':`<button data-configure="${esc(p.id)}">${ready(p.id)?'管理连接':'配置连接'} →</button>`}</div></article>`).join('')||'<p class="field-note">没有匹配的后端。</p>';
 $$('[data-configure]').forEach(b=>b.onclick=()=>openSettings(b.dataset.configure));
}
function openCatalog(){renderCatalog();showDialog('#providers-dialog')}
function newChat(){if(busy)return;chatId='';files=[];notice();$('#prompt').value='';persist();render();$('#sidebar').classList.remove('open');$('#prompt').focus()}
function download(name,text,type='text/plain'){const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function openWorkspace(){const w=workspace();$('#workspace-name').value=w.name;$('#system-prompt').value=w.system;$('#temperature').value=w.temperature;$('#max-tokens').value=w.maxTokens;showDialog('#workspace-dialog')}
function exportBackup(){download('AnythingLLM-backup-'+new Date().toISOString().slice(0,10)+'.json',JSON.stringify({version:1,workspaces:state.workspaces,chats:state.chats},null,2),'application/json')}
$('#new-chat').onclick=newChat;$('#search-chats').oninput=renderSidebar;$('#provider-open').onclick=openCatalog;$('#welcome-free').onclick=openCatalog;$('#welcome-connect').onclick=()=>openSettings();$('#settings-open').onclick=()=>openSettings();$('#workspace-settings').onclick=openWorkspace;
$$('[data-close]').forEach(b=>b.onclick=()=>b.closest('dialog').close());$$('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close()}}));
$('#provider-search').oninput=renderCatalog;$('#kind-filter').onchange=renderCatalog;
$('#provider-form').onsubmit=e=>{e.preventDefault();try{const c=formConfig();validateConfig(c);const {key,id,...config}=c;keys[id]=key;configs[id]=config;providerId=id;saveConfig();renderModels();$('#settings-dialog').close();$('#providers-dialog').close();notice('后端已保存。可先测试对话或直接发送消息。')}catch(e){$('#test-result').textContent=e.message}};
$('#test-provider').onclick=async()=>{
 const button=$('#test-provider'),result=$('#test-result');button.disabled=true;result.textContent='正在用小额度请求验证真实回答…';
 try{const c=formConfig();validateConfig(c);const r=await chatResponse(c.id,c,[{role:'user',content:'只回复 OK。'}],AbortSignal.timeout(45000),c);const answer=await consumeChat(r,()=>{});result.textContent='连接成功 · '+(answer.model||c.model)+'：'+answer.content.slice(0,150)}catch(e){result.textContent='连接失败：'+e.message}finally{button.disabled=false}
};
$('#forget-key').onclick=async()=>{const id=$('#setting-provider').value;if(!await ask('移除此后端 Key','只移除当前标签页保存的 Key，对话记录会保留。'))return;delete keys[id];$('#api-key').value='';saveConfig();renderModels();$('#test-result').textContent='Key 已移除。'};
$('#provider-select').onchange=()=>{if(busy)return;providerId=$('#provider-select').value;const p=provider();if(!cfg().model)configs[p.id]={...cfg(),model:p.models[0]||''};saveConfig();renderModels();if(!ready())openSettings()};
$('#model-input').onchange=()=>{configs[providerId]={...cfg(),model:$('#model-input').value.trim()};saveConfig()};
$('#refresh-models').onclick=async()=>{
 const button=$('#refresh-models');button.disabled=true;
 try{let response;if(['custom','ollama'].includes(providerId)){const base=directBase(cfg().baseUrl||provider().base);response=await fetch(base+'/models',{headers:keys[providerId]?{authorization:'Bearer '+keys[providerId]}:{},signal:AbortSignal.timeout(30000),redirect:'error'})}else response=await request('models',credentials(providerId),AbortSignal.timeout(30000));
  const data=await response.json();if(!response.ok)throw Error(data.error?.message||data.error||'拉取失败');const rows=data.models||data.data||[];if(!rows.length)throw Error('后端未返回可用模型；可从官方控制台复制精确 ID 手动填写。');models[providerId]=rows;renderModels();notice('已更新 '+rows.length+' 个模型。拉取模型列表不代表每个模型都免费，请核对账户套餐。');
 }catch(e){notice('模型列表更新失败：'+e.message+'。已保留当前型号，可手动输入。')}finally{button.disabled=false}
};
$('#composer').onsubmit=e=>{e.preventDefault();send()};$('#prompt').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();send()}};$('#prompt').oninput=()=>{const p=$('#prompt');p.style.height='auto';p.style.height=Math.min(200,p.scrollHeight)+'px'};
$('#stop').onclick=()=>controller?.abort('user');document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();if(!$$('dialog[open]').length)newChat()}});
$$('[data-prompt]').forEach(b=>b.onclick=()=>{$('#prompt').value=b.dataset.prompt;$('#prompt').focus()});
$('#menu').onclick=()=>$('#sidebar').classList.toggle('open');$('#scroll').onclick=()=>$('#sidebar').classList.remove('open');
$('#theme').onclick=()=>{document.body.classList.toggle('dark');localStorage.setItem('anythingllm.theme',document.body.classList.contains('dark')?'dark':'light')};document.body.classList.toggle('dark',localStorage.getItem('anythingllm.theme')==='dark');
$('#attach').onclick=()=>$('#file-input').click();$('#file-input').onchange=async()=>{
 const input=$('#file-input');for(const f of input.files){if(files.length>=5){notice('每轮最多 5 个文本附件。');break}if(f.size>150000){notice(f.name+' 超过 150KB，请截取重点内容。');continue}try{const text=await f.text();if(text.includes('\0')||/\.(pdf|docx?|xlsx?|zip|png|jpg|epub)$/i.test(f.name))throw Error('请选择文本文件；PDF / Word 请先转换为文本');if(text.length+files.reduce((n,f)=>n+f.text.length,0)>55000)throw Error('附件总内容超过 55,000 字符');files.push({name:f.name.replace(/[\r\n]/g,' '),text})}catch(e){notice(f.name+'：'+e.message)}}input.value='';renderFiles();
};
$('#export-chat').onclick=()=>{const c=chat();if(!c?.messages.length){notice('当前还没有可导出的对话。');return}download('AnythingLLM-chat-'+new Date().toISOString().slice(0,10)+'.md','# '+c.title+'\n\n'+c.messages.map(m=>'## '+(m.role==='user'?'你':m.provider+' / '+m.model)+'\n\n'+m.content+(m.error?'\n\n> '+m.error:'')).join('\n\n---\n\n'),'text/markdown')};
$('#delete-chat').onclick=async()=>{const c=chat();if(!c||busy)return;if(!await ask('删除当前对话','删除后无法恢复，建议先导出需要保留的内容。'))return;state.chats=state.chats.filter(x=>x.id!==c.id);newChat()};
$('#add-workspace').onclick=()=>{if(busy)return;const id=crypto.randomUUID();state.workspaces.push({id,name:'新工作区',icon:'◈',system:defaults.workspaces[0].system,temperature:.7,maxTokens:2048});workspaceId=id;chatId='';persist();render();openWorkspace()};
$('#workspace-form').onsubmit=e=>{e.preventDefault();const w=workspace();w.name=$('#workspace-name').value.trim()||'工作区';w.system=$('#system-prompt').value.trim();w.temperature=Number($('#temperature').value);w.maxTokens=Number($('#max-tokens').value);persist();renderSidebar();$('#workspace-dialog').close()};
$('#backup-all').onclick=exportBackup;$('#import-all').onclick=()=>$('#import-input').click();$('#import-input').onchange=async()=>{try{const f=$('#import-input').files[0];if(!f)return;if(f.size>10000000)throw Error('备份文件超过 10MB');const value=normalizeBackup(JSON.parse(await f.text()));if(!await ask('导入对话备份','当前 '+state.chats.length+' 段对话将被此备份替换。请先保存当前备份。'))return;state=value;workspaceId=state.workspaces[0].id;chatId='';persist();closeDialogs();render()}catch(e){notice('导入失败：'+e.message);closeDialogs()}finally{$('#import-input').value=''}};
window.addEventListener('pagehide',()=>{if(controller)controller.abort('user');persist()});
async function init(){
 try{const response=await fetch('./providers.json?v=20261022');if(!response.ok)throw Error('目录加载失败');providers=(await response.json()).providers;if(!providers.some(p=>p.id===providerId&&p.kind!=='retired'))providerId='gemini';if(!cfg().model)configs[providerId]={...cfg(),model:provider().models[0]||''};if(providerId==='gemini'&&pair()&&!keys.gemini&&cfg().shared===undefined)configs.gemini={...cfg(),shared:true};$('#provider-count').textContent=providers.length;render();if(chat())scrollBottom();if(cfg().shared&&!keys.gemini){const r=await request('status',credentials('gemini'),AbortSignal.timeout(10000));if(!r.ok){const data=await r.json();notice('后台 Gemini：'+data.error+'。也可在后端设置中填写个人 API Key。')}}}catch(e){notice('后端目录 / 状态暂时无法加载：'+e.message+'。请刷新后重试。');renderSidebar();renderMessages()}
}
init();
