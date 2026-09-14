/* PC price search inside Tsugi. Public prices only; no account or purchase actions. */
(() => {
 const API='https://pt-universe-api.summer07-nanjolno.workers.dev';
 const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const safe=s=>{try{const u=new URL(s);return u.protocol==='https:'?u.href:'#'}catch{return '#'}};
 const usd=n=>Number.isFinite(n)?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n):'暂无报价';
 const stamp=s=>new Date(s).toLocaleString('zh-CN',{hour12:false});
 const out=$('#pcpResults'),status=$('#pcpStatus');let generation=0,selection=0,items=[];
 async function api(path){const r=await fetch(API+path,{cache:'no-store',signal:AbortSignal.timeout(30000)});const v=await r.json();if(!r.ok)throw new Error(v.error||'查询失败');return v}
 function sourceLine(sources){return sources.map(s=>esc(s.name)+'：'+(s.ok?'成功':'暂不可用')).join(' · ')}
 async function choose(item){
  const token=++selection,searchToken=generation;$('#pcpPrices').innerHTML='<p class="pcp-empty">正在查询 Steam 官方与第三方商店价格…</p>';
  const query=new URLSearchParams();if(item.steamId)query.set('steamId',item.steamId);if(item.cheapId)query.set('cheapId',item.cheapId);
  try{
   const v=await api('/api/pc/prices?'+query);if(token!==selection||searchToken!==generation)return;
   const best=v.lowest,offers=v.offers||[];
   $('#pcpPrices').innerHTML='<div class="pcp-heading"><h3>'+esc(v.title||item.title)+'</h3><span class="pcp-tag">'+(v.kind==='dlc'?'DLC · 请核对所需本体':'PC 游戏')+' · 美区 USD</span></div><div class="pcp-summary"><div><small>当前查询最低价</small><strong>'+usd(best?.price)+'</strong><span>'+esc(best?.store||'当前暂无可购买报价')+'</span></div><div><small>最低价渠道折扣</small><strong>'+(best?Math.round(best.discount||0)+'% OFF':'—')+'</strong><span>各商店原价可能不同</span></div><div><small>覆盖渠道最大折扣</small><strong>'+(v.maxDiscount!==null?Math.round(v.maxDiscount)+'% OFF':'—')+'</strong><span>不一定对应最低成交价</span></div></div>'+
    '<p class="pcp-note">'+esc(v.coverage)+'。同名版本、DLC、兑换平台和激活地区请按商品页核对；这里不会把主机版混入比较。</p>'+
    (offers.length?'<div class="pcp-offers">'+offers.map((o,i)=>'<article class="pcp-offer '+(i===0?'best':'')+'"><div><strong>'+esc(o.store)+(i===0?' · 当前最低':'')+'</strong><small>'+esc(o.channel)+'</small></div><div><strong>'+usd(o.price)+'</strong><small>'+Math.round(o.discount||0)+'% OFF'+(o.regular>o.price?' · 原价 '+usd(o.regular):'')+'</small></div><a href="'+esc(safe(o.url))+'" target="_blank" rel="noopener noreferrer">前往购买 ↗</a></article>').join('')+'</div>':'<p class="pcp-empty">可能尚未发售、此地区不可购买或来源暂无报价。</p>')+
    (v.history?'<p class="pcp-note">CheapShark 历史最低记录：'+usd(v.history.price)+(v.history.date?' · '+esc(v.history.date.slice(0,10)):'')+'，仅供对照，不是当前可购买价。</p>':'')+
    '<p class="pcp-note">报价查询：'+esc(stamp(v.checkedAt))+(v.cached?' · 使用 2 分钟内的查询缓存':'')+'<br>'+sourceLine(v.sources)+'</p>';
  }catch(e){if(token===selection&&searchToken===generation)$('#pcpPrices').innerHTML='<p class="pcp-error">'+esc(e.message)+'。可稍后重新选择游戏查询。</p>'}
 }
 $('#pcpForm').onsubmit=async e=>{
  e.preventDefault();const q=$('#pcpQuery').value.trim();if(q.length<2)return;const token=++generation;selection++;
  $('#pcpSubmit').disabled=true;status.textContent='正在搜索 PC 游戏…';out.innerHTML='';
  try{
   const v=await api('/api/pc/search?q='+encodeURIComponent(q));if(token!==generation)return;items=v.items||[];
   status.textContent='找到 '+items.length+' 个候选 · '+v.sources.filter(s=>s.ok).length+'/'+v.sources.length+' 个搜索来源可用'+(v.cached?' · 2 分钟内缓存':'');
   out.innerHTML=(items.length?'<label class="pcp-picker">选择准确的游戏／版本<select id="pcpCandidate"><option value="">请选择游戏</option>'+items.map((x,i)=>'<option value="'+i+'">'+esc(x.title)+' · '+esc(x.source)+'</option>').join('')+'</select></label><div id="pcpPrices"></div>':'<p class="pcp-empty">没有找到结果。中文名可先尝试 Steam 搜索；也可输入英文名。</p>')+'<p class="pcp-note">'+sourceLine(v.sources)+'</p>';
   if(items.length){$('#pcpCandidate').onchange=e=>{if(e.target.value!=='')void choose(items[Number(e.target.value)])};if(items.length===1){$('#pcpCandidate').value='0';void choose(items[0])}}
  }catch(e){if(token===generation){status.textContent='搜索暂不可用';out.innerHTML='<p class="pcp-error">'+esc(e.message)+'</p>'}}
  finally{if(token===generation)$('#pcpSubmit').disabled=false}
 };
 const legacy=localStorage.getItem('ptu.labs.games');
 if(legacy){const button=$('#pcpLegacy');button.hidden=false;button.onclick=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify({version:1,project:'games',data:JSON.parse(localStorage.getItem('ptu.labs.games')||'{}')},null,2)],{type:'application/json'}));a.download='game-scout-records.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}}
 function openPriceTab(){if(location.hash!=='#pc-prices')return;document.querySelector('#nav [data-tab="games"]')?.click();document.querySelector('#gameSwitch [data-game-view="prices"]')?.click()}
 window.addEventListener('hashchange',openPriceTab);openPriceTab();
})();
