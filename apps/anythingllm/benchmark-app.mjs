import {esc,consumeChat} from './core.mjs?v=4';
import {BENCH_TEMPLATES,checkSchemaDefinition,evaluateAnswer,runStats,recommendedModels} from './benchmark-core.mjs';
const $=q=>document.querySelector(q), API='https://pt-universe-api.summer07-nanjolno.workers.dev/api/anythingllm', KEY='anythingllm.bench.v1';
const read=(s,k,d)=>{try{return JSON.parse(s.getItem(k))||d}catch{return d}};
let store=read(localStorage,KEY,{runs:[]}), providers=[], busy=false,stop=null;
if(!Array.isArray(store.runs))store={runs:[]};
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(store))}catch{$('#bm-status').textContent='存储不足，请导出历史'}};
const main=$('main'), button=document.createElement('button');
button.id='bm-toggle';button.textContent='◈ 模型评测';$('.top-actions').prepend(button);
const root=document.createElement('section');root.id='benchmark-lab';root.hidden=true;
root.innerHTML='<header class="bm-head"><div><small>MODEL BENCHMARK LAB</small><h1>模型评测实验室</h1><p>同任务、同参数，真正比较已配置的免费模型。</p></div><button id="bm-back">返回聊天 ×</button></header>'+
'<div class="bm-layout"><article class="bm-panel"><h2>01 · 评测任务</h2><label>模板<select id="bm-task"></select></label><label>系统提示词<textarea id="bm-system" rows="2"></textarea></label><label>提示词（{{input}} 作为输入变量）<textarea id="bm-prompt" rows="3"></textarea></label><label>测试输入<textarea id="bm-input" rows="3"></textarea></label><label>JSON Schema（可选）<textarea id="bm-schema" rows="3"></textarea></label><label>必须出现的文本（每行一个，可选）<textarea id="bm-reference" rows="2"></textarea></label><div class="bm-line"><label>Temperature<input id="bm-temp" type="number" min="0" max="2" step=".1" value="0"></label><label>最大 Tokens<input id="bm-tokens" type="number" min="64" max="8192" value="1024"></label><label>重复次数<select id="bm-repeat"><option>1</option><option>2</option><option>3</option></select></label></div></article>'+
'<article class="bm-panel"><h2>02 · 参测模型</h2><p>仅复用已经配置的后端；逐个请求、禁用回退，不自动调用裁判模型。单批最多 12 次调用。</p><div id="bm-models"></div><p id="bm-plan"></p><div class="bm-buttons"><button id="bm-refresh">刷新模型</button><button class="primary" id="bm-run">开始评测</button><button id="bm-stop" disabled>停止</button></div><p id="bm-status" role="status"></p></article>'+
'<article class="bm-panel bm-wide"><h2>03 · 真实结果与人工评分</h2><select id="bm-history"></select><div id="bm-stats"></div><div id="bm-results"></div><div class="bm-buttons"><button id="bm-json">导出历史 JSON</button><button id="bm-csv">导出 CSV</button></div></article>'+
'<article class="bm-panel bm-wide"><h2>04 · 任务—模型映射</h2><div id="bm-map"></div></article></div>';
main.append(root);
function template(){const t=BENCH_TEMPLATES.find(x=>x.id===$('#bm-task').value)||BENCH_TEMPLATES[0];for(const [a,b] of [['bm-system','system'],['bm-prompt','prompt'],['bm-input','input'],['bm-schema','schema'],['bm-reference','reference']])$('#'+a).value=t[b]}
$('#bm-task').innerHTML=BENCH_TEMPLATES.map(t=>'<option value="'+t.id+'">'+esc(t.name)+'</option>').join('');$('#bm-task').onchange=template;template();
function configured(){const c=read(localStorage,'anythingllm.config.v1',{}),k=read(sessionStorage,'anythingllm.keys.v1',{}),session=read(sessionStorage,'anythingllm.backend.session',{});return {c,k,session}}
async function refresh(){
 const selected=new Set([...root.querySelectorAll('input[data-choice]:checked')].map(x=>x.value));
 const {c,k,session}=configured();
 try{providers=(await(await fetch('./providers.json')).json()).providers}catch{$('#bm-status').textContent='目录加载失败';return}
 const rows=[];
 for(const p of providers){
 if(p.kind!=='free')continue;
 const conf=c[p.id]||{},key=k[p.id]||'';
 if(!key&&!(p.id==='gemini'&&conf.shared&&session.token))continue;
 const ids=[...new Set([conf.model,...(p.freeModels||p.models||[])])].filter(Boolean);
 for(const model of ids)rows.push({provider:p.id,model,name:p.name});
 }
 root._rows=rows;
 $('#bm-models').innerHTML=rows.length?rows.map((p,i)=>'<label class="bm-choice"><input data-choice type="checkbox" value="'+i+'" '+(selected.has(String(i))?'checked':'')+'><span>'+esc(p.model)+'<small>'+esc(p.name)+'</small></span></label>').join(''):'<p>暂时没有已连接的模型，请先在聊天的「后端设置」中添加。</p>';
 if(rows.length&&!selected.size)root.querySelector('input[data-choice]').checked=true;
 plan();
}
function choices(){return [...root.querySelectorAll('input[data-choice]:checked')].map(x=>root._rows[Number(x.value)]).filter(Boolean)}
function plan(){const count=choices().length*Number($('#bm-repeat').value);$('#bm-plan').textContent='计划 '+count+' 次真实 API 请求（最多 12 次）';$('#bm-run').disabled=busy||count<1||count>12}
function config(){const schemaText=$('#bm-schema').value.trim(),schema=schemaText?checkSchemaDefinition(JSON.parse(schemaText)):null,temperature=Number($('#bm-temp').value),maxTokens=Number($('#bm-tokens').value),repeat=Number($('#bm-repeat').value);
 if(temperature<0||temperature>2||!Number.isFinite(temperature)||!Number.isInteger(maxTokens)||maxTokens<64||maxTokens>8192)throw Error('参数超出范围');
 if(!$('#bm-prompt').value.trim()||!choices().length||choices().length*repeat>12)throw Error('请填写提示词，并选择 1–12 次请求');
 return {schema,temperature,maxTokens,repeat,system:$('#bm-system').value,prompt:$('#bm-prompt').value,input:$('#bm-input').value,reference:$('#bm-reference').value}}
async function call(p,s,signal){
 const {c,k,session}=configured(),conf=c[p.provider]||{},messages=[...(s.system?[{role:'system',content:s.system}]:[]),{role:'user',content:s.prompt.replaceAll('{{input}}',s.input)}];
 if(messages.reduce((n,m)=>n+m.content.length,0)>60000)throw Error('提示词过长');
 const pair=read(localStorage,'ptu.sync.config',{});
 const body={provider:p.provider,model:p.model,apiKey:k[p.provider]||'',messages,temperature:s.temperature,maxTokens:s.maxTokens,allowPaid:false,allowFreeFallback:false};
 if(p.provider==='gemini'&&conf.shared&&session.token){body.backendSession=session.token;body.owner=pair.id||''}
 const res=await fetch(API+'/chat',{method:'POST',headers:{'content-type':'application/json',...(body.owner&&pair.token?{authorization:'Bearer '+pair.token}:{})},body:JSON.stringify(body),signal});
 return res;
}
async function run(){
 let s;try{s=config()}catch(e){$('#bm-status').textContent=e.message;return}
 busy=true;stop=new AbortController();$('#bm-stop').disabled=false;plan();
 const t=BENCH_TEMPLATES.find(t=>t.id===$('#bm-task').value),r={id:crypto.randomUUID(),createdAt:new Date().toISOString(),taskId:t.id,taskName:t.name,settings:{...s,schema:undefined,schemaText:$('#bm-schema').value},entries:[]};
 store.runs.unshift(r);store.runs=store.runs.slice(0,50);save();render(r.id);
 const items=choices();let n=0;
 outer:for(let repeat=0;repeat<s.repeat;repeat++)for(const p of items){
 if(stop.signal.aborted)break outer;
 $('#bm-status').textContent='正在评测 '+(++n)+' / '+(items.length*s.repeat)+'：'+p.model;
 const begin=performance.now(),e={id:crypto.randomUUID(),provider:p.provider,model:p.model,status:'error',rating:null,content:''};
 try{
 const signal=AbortSignal.any([stop.signal,AbortSignal.timeout(120000)]);
 const response=await call(p,s,signal),actual=response.headers.get('x-pt-model')||p.model,fallback=response.headers.get('x-pt-fallback-from');
 const result=await consumeChat(response,()=>{});
 e.actualModel=result.model||actual;e.content=result.content;e.usage=result.usage;e.substituted=!!fallback||e.actualModel!==p.model;e.status=e.substituted?'substituted':'ok';
 e.checks=evaluateAnswer(e.content,{schema:s.schema,reference:s.reference});
 if(e.substituted)e.error='实际模型与指定模型不一致，不计入成绩';
 }catch(err){e.error=err.message||String(err);e.status=stop.signal.aborted?'cancelled':'error'}
 e.elapsedMs=Math.round(performance.now()-begin);r.entries.push(e);save();render(r.id);
 }
 busy=false;stop=null;$('#bm-stop').disabled=true;plan();$('#bm-status').textContent='评测结束：'+r.entries.length+' 次调用';
}
function render(id){
 const rows=store.runs;
 $('#bm-history').innerHTML=rows.length?rows.map(r=>'<option value="'+esc(r.id)+'">'+esc(new Date(r.createdAt).toLocaleString()+' · '+r.taskName)+'</option>').join(''):'<option>尚无评测</option>';
 if(rows.some(r=>r.id===id))$('#bm-history').value=id;
 const run=rows.find(r=>r.id===$('#bm-history').value),entries=run?.entries||[],stats=runStats(entries);
 $('#bm-stats').textContent=run?'有效成功 '+stats.ok+'/'+stats.n+' · 平均延迟 '+(stats.latencyMs===null?'未返回':(stats.latencyMs/1000).toFixed(2)+'s')+' · Tokens '+(stats.tokens===null?'未返回':stats.tokens.toFixed(0))+' · Schema '+(stats.schema?stats.schema.passed+'/'+stats.schema.total:'未设置'):'尚无真实评测数据';
 $('#bm-results').innerHTML=entries.map(e=>'<article class="bm-entry"><strong>'+esc(e.provider+'/'+e.model)+'</strong><small>'+esc(e.status)+' · '+(e.elapsedMs/1000).toFixed(2)+'s · Schema '+(e.checks?.schemaPass==null?'—':e.checks.schemaPass?'通过':'失败')+' · Tokens '+(e.usage?.total_tokens??'未返回')+'</small>'+(e.error?'<p>'+esc(e.error)+'</p>':'')+'<pre>'+esc(e.content||'无输出')+'</pre><label>人工质量 <select data-rating="'+e.id+'"><option value="">未评分</option>'+[1,2,3,4,5].map(n=>'<option '+(n===e.rating?'selected':'')+'>'+n+'</option>').join('')+'</select></label></article>').join('');
 root.querySelectorAll('[data-rating]').forEach(el=>el.onchange=()=>{entries.find(e=>e.id===el.dataset.rating).rating=el.value?Number(el.value):null;save();renderMap()});
 renderMap();
}
function renderMap(){
 const ids=[...new Set(store.runs.map(r=>r.taskId))];
 $('#bm-map').innerHTML=ids.length?ids.map(id=>'<h3>'+esc(store.runs.find(r=>r.taskId===id).taskName)+'</h3>'+recommendedModels(store.runs,id).map(x=>'<div class="bm-rank"><strong>'+esc(x.key)+'</strong><span>成功 '+x.ok+'/'+x.n+' · 人工 '+(x.rating==null?'未评分':x.rating.toFixed(1)+'/5')+' · '+(x.latencyMs==null?'—':(x.latencyMs/1000).toFixed(1)+'s')+'</span></div>').join('')).join(''):'运行评测后自动汇总。';
}
function download(name,txt,mime){const u=URL.createObjectURL(new Blob([txt],{type:mime})),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)}
$('#bm-json').onclick=()=>download('anythingllm-benchmark.json',JSON.stringify(store,null,2),'application/json');
$('#bm-csv').onclick=()=>{const quote=s=>'"'+String(s??'').replaceAll('"','""')+'"',rows=[['date','task','provider','model','status','latency_ms','tokens','schema','reference','human_rating','answer','error']];for(const r of store.runs)for(const e of r.entries)rows.push([r.createdAt,r.taskName,e.provider,e.model,e.status,e.elapsedMs,e.usage?.total_tokens,e.checks?.schemaPass,e.checks?.referencePass,e.rating,e.content,e.error]);download('anythingllm-benchmark.csv','\uFEFF'+rows.map(row=>row.map(quote).join(',')).join('\r\n'),'text/csv;charset=utf-8')};
$('#bm-history').onchange=()=>render($('#bm-history').value);
$('#bm-refresh').onclick=refresh;$('#bm-models').onchange=plan;$('#bm-repeat').onchange=plan;$('#bm-run').onclick=run;$('#bm-stop').onclick=()=>stop?.abort();
function show(open){main.classList.toggle('benchmark-mode',open);root.hidden=!open;button.textContent=open?'◈ 返回聊天':'◈ 模型评测';if(open){refresh();render()}}
button.onclick=()=>show(!main.classList.contains('benchmark-mode'));$('#bm-back').onclick=()=>show(false);
render();
