import {esc,stamp,copy,save,id,raw} from './core.js';
import {account,API} from './collector.js';
import {planMeals} from './meal-planner.mjs';
export async function runLifeAI(kind,body){
 const sync=raw('ptu.sync.config',null),a=sync?.id&&sync?.token?sync:await account(true);
 const r=await fetch(`${API}/api/life/${a.id}/${kind}`,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+a.token},body:JSON.stringify(body),signal:AbortSignal.timeout(195000)});
 const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'AI 服务返回 HTTP '+r.status);return d;
}
const metadata=d=>`${d.model} · ${(d.latencyMs/1000).toFixed(1)} 秒 · ${d.usage?.reduce((n,x)=>n+(x?.totalTokenCount||0),0)||0} tokens · ${stamp(d.at)}`;
export function mountMealAI(host,getState){
 const panel=document.createElement('section');panel.className='d-inset life-ai';
 panel.innerHTML='<h3>AI 配餐 · 试验</h3><p>按上方条件，从完整菜谱库搭配 1–3 道菜，给出理由与下厨顺序。</p><div class="d-actions"><button type="button" class="d-primary" data-ai-run>AI 搭配今晚菜单</button></div><p class="d-muted">点击才调用 Gemini；当前筛选条件和候选菜谱会发送给模型。烹饪顺序是建议，用量和做法以原菜谱为准。</p><p data-ai-status role="status" aria-live="polite"></p><div data-ai-result></div>';
 host.querySelector('#meal-options').before(panel);
 let revision=0;host.querySelector('#meal-plan-form').addEventListener('input',()=>{revision++;panel.querySelector('[data-ai-result]').replaceChildren();panel.querySelector('[data-ai-status]').textContent='条件已修改，请重新生成 AI 菜单。'});
 panel.querySelector('[data-ai-run]').onclick=async e=>{
  const button=e.currentTarget,status=panel.querySelector('[data-ai-status]'),result=panel.querySelector('[data-ai-result]');const current=revision;
  button.disabled=true;status.textContent='正在筛选菜谱并搭配菜单…';result.replaceChildren();
  try{
   const {recipes,preferences,recent}=getState(),candidates=[];
   for(let offset=0;offset<18;offset+=3){const r=planMeals(recipes,preferences,{offset,recent});for(const x of r.options)if(!candidates.some(c=>c.id===x.id))candidates.push(x);if(candidates.length>=r.total)break;}
   if(!candidates.length)throw Error('没有符合当前食材、器材与忌口条件的菜谱，请先调整条件。');
   const d=await runLifeAI('meal',{preferences,candidates:candidates.map(m=>({id:m.id,name:m.name,source:m.source,ingredients:m.ingredientsText.slice(0,650),minutes:m.minutes,equipment:m.equipment,advance:m.advance,steps:m.stepsText.slice(0,500)}))});
   if(current!==revision){status.textContent='条件已修改，请按新条件重新生成。';return;}
   const selected=d.recipeIds.map(id=>candidates.find(m=>m.id===id));if(selected.some(x=>!x))throw Error('返回的菜单不在候选菜谱中，请重试。');
   const text=selected.map(m=>m.name+'\n'+m.amounts.note+'\n'+m.amounts.text+'\n'+m.stepsText+'\n来源：'+m.source).join('\n\n')+'\n\n搭配理由：'+d.reason+'\n下厨顺序（建议）：\n'+d.steps.join('\n');
   result.innerHTML=`<h3>${selected.map(m=>esc(m.name)).join(' ＋ ')}</h3><p>${esc(d.reason)}</p><ol>${d.steps.map(s=>'<li>'+esc(s)+'</li>').join('')}</ol>${selected.map(m=>`<details><summary>${esc(m.name)} · 原菜谱</summary><p>${esc(m.amounts.note)}</p><pre>${esc(m.amounts.text+'\n\n'+m.stepsText)}</pre><a href="${esc(m.source)}" target="_blank" rel="noopener">HowToCook 原文</a></details>`).join('')}<div class="d-actions"><button data-ai-save>保存整份菜单</button><button data-ai-copy>复制菜单与清单</button></div>`;
   status.textContent=metadata(d);result.querySelector('[data-ai-copy]').onclick=()=>copy(text);
   result.querySelector('[data-ai-save]').onclick=e=>{const plans=raw('ptu.decision.meal-plans',[]);if(save('meal-plans',[...plans,{id:id(),title:selected.map(m=>m.name).join(' ＋ '),summary:'AI 配餐 · '+preferences.people+' 人',text,at:new Date().toISOString()}].slice(-100))){e.currentTarget.disabled=true;e.currentTarget.textContent='已保存至已选安排';}};
  }catch(err){status.textContent=err.message;}finally{button.disabled=false;}
 };
}
export function mountMapsAI(host,restaurants=false){
 host.classList.add('d-root','life-ai');host.innerHTML=`<section class="d-panel"><h2>AI 地图探索 · 试验</h2><form class="d-form"><label>地区<select name="city">${['Kirkland','Bellevue','Redmond','Lynnwood','Everett','Seattle'].map(c=>'<option>'+c+'</option>').join('')}</select></label><label class="d-wide">想找什么<textarea name="query" required maxlength="300" placeholder="${restaurants?'例如：适合两个人晚饭的日料，优先停车方便':'例如：适合散步的湖边公园，附近有咖啡店'}"></textarea></label><div class="d-actions d-wide"><button class="d-primary">查找真实地点</button><button type="button" data-ai-example>${restaurants?'试试附近晚餐':'试试散步＋咖啡'}</button></div></form><p class="d-muted">仅点击查询时运行。使用 Google Maps 地点来源；中文需求会翻译后查询，再返回中文。一次最多 3 次模型调用。实际营业、停车与车程请打开来源核对。</p><p data-ai-status role="status" aria-live="polite"></p><div data-ai-result></div></section>`;
 const form=host.querySelector('form'),status=host.querySelector('[data-ai-status]'),result=host.querySelector('[data-ai-result]');let revision=0;
 form.addEventListener('input',()=>{revision++;result.replaceChildren();status.textContent='需求已修改，请重新查询。';});
 host.querySelector('[data-ai-example]').onclick=()=>{form.elements.query.value=restaurants?'Kirkland 适合两个人晚饭的中餐或日料，优先停车方便，给我三个选择':'Kirkland 适合散步的湖边公园，附近有咖啡店，给我三个选择';revision++;result.replaceChildren();status.textContent='已填入示例，点击“查找真实地点”开始。';};
 form.onsubmit=async e=>{e.preventDefault();const current=revision;const buttons=[...form.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);status.textContent='正在查询 Google Maps 地点与来源，通常需要数十秒…';result.replaceChildren();
  try{
   const d=await runLifeAI('maps',Object.fromEntries(new FormData(form)));if(current!==revision){status.textContent='需求已修改，请重新查询。';return;}
   if(!d.sources?.length)throw Error('未返回可验证地点来源。');
   result.innerHTML=`<pre class="life-ai-answer">${esc(d.answer)}</pre><div class="life-ai-sources"><b translate="no">Google Maps</b> · 地点来源${d.sources.map((s,i)=>`<p>${i+1}. <a translate="no" href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}</a> <a href="${esc('https://www.google.com/maps/dir/?api=1&origin='+encodeURIComponent('Juanita, Kirkland WA')+'&destination='+encodeURIComponent(s.name+', '+form.elements.city.value+' WA')+(s.placeId?'&destination_place_id='+encodeURIComponent(s.placeId):''))}" target="_blank" rel="noopener">导航</a></p>`).join('')}</div><button data-ai-copy>复制结果与来源</button>`;
   status.textContent=metadata(d)+(d.translated?'':' · 仅展示已返回的地点来源');result.querySelector('[data-ai-copy]').onclick=()=>copy(d.answer+'\n\nGoogle Maps\n'+d.sources.map(s=>s.name+' '+s.url).join('\n'));
  }catch(err){status.textContent=err.message;}finally{buttons.forEach(b=>b.disabled=false);}
 };
}
const mapHost=document.querySelector('[data-life-ai-maps]');if(mapHost)mountMapsAI(mapHost,mapHost.dataset.lifeAiMaps==='restaurants');
