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
 const pin='<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg>';
 const arrow='<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m4 11 16-7-7 16-2-7-7-2Z"/></svg>';
 host.classList.add('d-root','life-ai','life-ai-map');host.innerHTML=`<section class="d-panel map-discovery"><header class="map-discovery-header"><div class="map-discovery-icon">${pin}</div><div><span class="map-eyebrow">NEARBY DISCOVERIES</span><h2>${restaurants?'找一家，今晚想去的餐厅':'发现附近好去处'}</h2><p>说说你的想法，让 AI 帮你找到有地图来源的真实地点。</p></div><span class="map-ai-tag">AI 探索</span></header><form class="map-search-form"><label class="map-city-label">探索地区<select name="city">${['Kirkland','Bellevue','Redmond','Lynnwood','Everett','Seattle'].map(c=>'<option>'+c+'</option>').join('')}</select></label><label class="map-query-label">想找什么<textarea name="query" required maxlength="300" placeholder="${restaurants?'两个人的晚餐，想吃日料，停车方便一点…':'想去湖边散散步，附近最好有一家咖啡店…'}"></textarea></label><div class="map-search-actions"><button type="button" data-ai-example>${restaurants?'试试附近晚餐':'试试散步＋咖啡'} <span aria-hidden="true">↗</span></button><button type="submit" class="d-primary">${pin}查找真实地点</button></div></form><div class="map-search-note"><span class="map-note-dot" aria-hidden="true"></span><span>点击才查询 · 营业、停车与车程以地图详情为准</span></div><p data-ai-status role="status" aria-live="polite"></p><div data-ai-result></div></section>`;
 const form=host.querySelector('form'),status=host.querySelector('[data-ai-status]'),result=host.querySelector('[data-ai-result]');let revision=0;
 form.addEventListener('input',()=>{revision++;result.replaceChildren();status.dataset.state='';status.textContent='需求已修改，请重新查询。';});
 host.querySelector('[data-ai-example]').onclick=()=>{form.elements.query.value=restaurants?'Kirkland 适合两个人晚饭的中餐或日料，优先停车方便，给我三个选择':'Kirkland 适合散步的湖边公园，附近有咖啡店，给我三个选择';revision++;result.replaceChildren();status.dataset.state='';status.textContent='已填入示例，点击“查找真实地点”开始。';};
 form.onsubmit=async e=>{e.preventDefault();const current=revision;const buttons=[...form.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);status.dataset.state='loading';status.textContent='正在寻找合适的地点，并核对地图来源…';result.setAttribute('aria-busy','true');result.innerHTML='<div class="map-loading" aria-hidden="true">'+Array.from({length:3},()=>'<div class="map-skeleton"><i></i><i></i><i></i></div>').join('')+'</div>';
  try{
   const d=await runLifeAI('maps',Object.fromEntries(new FormData(form)));if(current!==revision){status.textContent='需求已修改，请重新查询。';return;}
   if(!d.sources?.length)throw Error('未返回可验证地点来源。');
   const city=form.elements.city.value,blocks=String(d.answer||'').split(/\n\s*\n/);
   result.innerHTML=`<div class="map-result-heading"><div><span class="map-eyebrow">YOUR SHORTLIST</span><h3>这些地方，可以去看看 <span>${d.sources.length}</span></h3></div><span class="map-source-tag" translate="no">Google Maps</span></div><div class="life-ai-sources map-place-grid">${d.sources.map((s,i)=>{
    const name=s.name.replace(/\s*[-–—]\s*Google Maps\s*$/i,''),block=blocks.find(b=>b.startsWith(`${i+1}. ${s.name}\n`)),summary=block?block.slice(block.indexOf('\n')+1):'打开地图详情，了解这个地点。';
    const navigation='https://www.google.com/maps/dir/?api=1&origin='+encodeURIComponent('Juanita, Kirkland WA')+'&destination='+encodeURIComponent(name+', '+city+' WA')+(s.placeId?'&destination_place_id='+encodeURIComponent(s.placeId):'');
    return `<article class="map-place-card"><div class="map-place-top"><span class="map-place-number">${String(i+1).padStart(2,'0')}</span><span class="map-place-area">${esc(city)} · 周边探索</span>${pin}</div><h4 translate="no">${esc(name)}</h4><p class="map-place-summary">${esc(summary)}</p><footer><a class="map-place-source" href="${esc(s.url)}" target="_blank" rel="noopener" aria-label="${esc(name)} · 地图详情">地图详情 <span aria-hidden="true">↗</span></a><a class="map-place-navigate" href="${esc(navigation)}" target="_blank" rel="noopener" aria-label="导航到 ${esc(name)}">${arrow}导航</a></footer></article>`;
   }).join('')}</div><div class="map-result-footer"><span>地点来源：<span translate="no">Google Maps</span> · AI 理由供参考</span><button data-ai-copy>复制结果与来源</button></div><details class="map-call-details"><summary>本次查询详情 · ${(d.latencyMs/1000).toFixed(1)} 秒</summary><p>${esc(metadata(d))}</p><p>中文查询最多使用 3 次模型调用，页面打开和刷新不会自动调用。</p></details>`;
   status.dataset.state='success';status.textContent=`找到 ${d.sources.length} 个有地图来源的地点。`;result.querySelector('[data-ai-copy]').onclick=()=>copy(d.answer+'\n\nGoogle Maps\n'+d.sources.map(s=>s.name+' '+s.url).join('\n'));
  }catch(err){result.replaceChildren();status.dataset.state='error';status.textContent=err.message;}finally{result.removeAttribute('aria-busy');buttons.forEach(b=>b.disabled=false);}
 };
}
const mapHost=document.querySelector('[data-life-ai-maps]');if(mapHost)mountMapsAI(mapHost,mapHost.dataset.lifeAiMaps==='restaurants');
