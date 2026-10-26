(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const escape = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const valueText = v => Array.isArray(v) ? v.map(valueText).join(' / ') : v && typeof v === 'object' ? Object.entries(v).map(([k,val])=>`${k}: ${valueText(val)}`).join(' · ') : String(v ?? '');
  const safeUrl = v => {try {const u = new URL(v,location.href);return ['https:','http:'].includes(u.protocol) ? u.href : ''}catch{return ''}};
  const read = (key,fallback) => {try {return JSON.parse(localStorage.getItem(key)) ?? fallback}catch{return fallback}};
  const KEY = 'ptu.ffguide.progress';
  const PREFS = 'ptu.ffguide.preferences';
  let state = read(KEY,{version:1,saved:[],completed:[],notes:{}});
  let prefs = read(PREFS,{chapter:0,spoilers:true});
  let db, entries = [], sources = [], lookup = new Map(), searchIndex = new Map(), currentPage = 1, filter = 'all', view = 'cards', sourceFilter = 'all';
  let route = {category:'home',id:null}, lastCategory = '', searchTimer, toastTimer;
  const categories = [
    ['home','资料首页','⌂','YOUR JOURNEY','从这里继续你的冒险。'],
    ['guide','攻略与路线','≋','FIELD NOTES','中文攻略、系统说明与收集路线。每条保留原始证据。'],
    ['characters','角色图鉴','♙','THE PARTY','角色定位、武器与学习能力。保留英文名称以便核对游戏文本。'],
    ['visions','幻兵图鉴','✧','VISIONS','查询幻兵的获取位置、能力与精通奖励。'],
    ['espers','召唤兽图鉴','♜','ESPERS','契约条件、获取位置与能力资料。'],
    ['skills','技能与被动','✴','ABILITIES','查询消耗、威力、破韧及学习来源。数值与实际伤害并不相同。'],
    ['equipment','装备图鉴','⚔','EQUIPMENT','武器、防具与饰品的属性、效果和数据记录。'],
    ['items','道具图鉴','♧','ITEMS','消耗品、素材与任务道具。'],
    ['enemies','敌人与 Boss','♞','BESTIARY','敌人属性、弱点、掉落与偷窃资料；不同形态单独计数。'],
    ['collectibles','收集清单','◇','COLLECTIONS','99 块石板、精金、古代装备与洞窟挑战。位置可逐项勾选。'],
    ['quests','任务与地点','⌖','WORLD JOURNAL','任务条件、奖励及相关地点资料。'],
    ['achievements','白金与成就','♕','ACHIEVEMENTS','成就条件与查漏路线。'],
    ['saved','我的收藏','☆','MY ARCHIVE','收藏、已收集条目与自己的笔记。'],
    ['sources','资料来源','↗','SOURCES & SCOPE','查看数据来源、版本范围与实际收录量。']
  ];
  const cat = id => categories.find(x=>x[0]===id) || categories[0];
  const label = id => cat(id)[1];
  const isCollectible = e => ['visions','espers','collectibles','achievements'].includes(e.category) || e.collectible === true;
  const stats = category => entries.filter(e=>e.category===category).length;
  const hash = (category,id) => '#/'+category+(id?'/'+encodeURIComponent(id):'');
  const writeState = () => {try {localStorage.setItem(KEY,JSON.stringify(state));$('#savedCount').textContent=state.saved.length}catch{toast('浏览器无法保存记录，请使用导出记录保留进度。')}};
  const writePrefs = () => {try{localStorage.setItem(PREFS,JSON.stringify(prefs))}catch{toast('浏览器无法保存设置')}};
  const toast = msg => {$('#toast').textContent=msg;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),2300)};
  const image = e => e.image && safeUrl(e.image) ? `<img class="entity-image" src="${escape(safeUrl(e.image))}" loading="lazy" alt="${escape(e.title)}" onerror="this.hidden=true">` : '';
  const sourceFor = e => (e.sourceIds || []).map(id=>sources.find(s=>s.id===id)).filter(Boolean);
  function navigate(category,id) {location.hash=hash(category,id)}
  function toggleSaved(id) {state.saved=state.saved.includes(id)?state.saved.filter(x=>x!==id):[...state.saved,id];writeState();render();toast(state.saved.includes(id)?'已加入收藏':'已取消收藏')}
  function toggleComplete(id,checked) {state.completed=state.completed.filter(x=>x!==id);if(checked)state.completed.push(id);writeState();$$(`[data-check="${CSS.escape(id)}"]`).forEach(el=>el.checked=checked);updateProgress();if(route.category==='saved'&&filter==='completed')render()}
  const completeControl = (e,full=false) => isCollectible(e)?`<label class="check-label"><input type="checkbox" data-check="${escape(e.id)}" ${state.completed.includes(e.id)?'checked':''}>${full?'标记为已完成 / 已收集':'已收集'}</label>`:'';
  function renderNav() {
    $('#navigation').innerHTML=categories.map((c,i)=>`<a class="nav-link ${c[0]===route.category?'active':''} ${i===12?'nav-gap':''}" href="${hash(c[0])}" ${c[0]===route.category?'aria-current="page"':''}><span class="nav-icon" aria-hidden="true">${c[2]}</span>${c[1]}${!['home','saved','sources'].includes(c[0])?`<em>${stats(c[0])}</em>`:''}</a>`).join('');
    $('#savedCount').textContent=state.saved.length;
  }
  const blurb = e => e.summary || Object.entries(e.fields||{}).slice(0,3).map(([k,v])=>`${k}：${valueText(v)}`).join(' · ');
  function progressPanel() {
    return `<div class="panel progress-panel"><div class="data-label">MY JOURNEY</div><h3>收集进度</h3>${['visions','espers','collectibles','achievements'].map(c=>{
      const items=entries.filter(e=>e.category===c&&isCollectible(e)),done=items.filter(e=>state.completed.includes(e.id)).length;
      return `<div class="progress-head"><span>${label(c)}</span><b data-progress="${c}">${done} / ${items.length}</b></div><div class="progress-track"><i data-bar="${c}" style="width:${items.length?done/items.length*100:0}%"></i></div>`
    }).join('')}<a class="aside-link" href="#/saved">管理收藏与收集记录 →</a></div>`;
  }
  function updateProgress() {for(const c of ['visions','espers','collectibles','achievements']){const list=entries.filter(e=>e.category===c&&isCollectible(e)),done=list.filter(e=>state.completed.includes(e.id)).length;$$(`[data-progress="${c}"]`).forEach(x=>x.textContent=`${done} / ${list.length}`);$$(`[data-bar="${c}"]`).forEach(x=>x.style.width=(list.length?100*done/list.length:0)+'%')}}
  function home() {
    const guides=entries.filter(e=>e.category==='guide'&&(!e.spoiler||prefs.spoilers)).slice(0,5);
    const indexes=['characters','visions','espers','skills','equipment','enemies','collectibles','achievements'];
    const chapters=Array.from({length:8},(_,i)=>lookup.get('walkthrough-chapter-'+(i+1)));const names=chapters.map((e,i)=>e?.title.replace(/^第[一二三四五六七八1-8]+章[：:·\s]*/, '')||('第 '+(i+1)+' 章'));
    return `<section class="hero"><div class="eyebrow">FINAL FANTASY RESONANCE</div><h1>在拉皮斯，找到答案。</h1><p>从第一场战斗到最后一块石板。<br>查数据、找路线，把冒险中的每一次发现记下来。</p><div class="hero-actions"><a class="primary" href="#/guide">开始查阅 <span>→</span></a><a class="button" href="#/collectibles">打开收集清单</a></div><span class="edition">玩家档案 / 2026.10.25</span></section>
    <div class="home-layout"><div><div class="section-heading"><h2>资料索引</h2><span>${entries.length.toLocaleString()} 条实际收录</span></div><div class="index-grid">${indexes.map(c=>`<a class="index-card" href="${hash(c)}"><span aria-hidden="true">${cat(c)[2]}</span><strong>${label(c)}</strong><small>${stats(c).toLocaleString()} 条 · 点击查询 →</small></a>`).join('')}</div>
    <div class="section-heading"><h2>冒险指南</h2><a href="#/guide">全部攻略 ↗</a></div><div class="guide-links">${guides.map((e,i)=>`<a class="guide-row" href="${hash(e.category,e.id)}"><span>0${i+1}</span><div><h3>${escape(e.title)}</h3><p>${escape(blurb(e))}</p></div><em>↗</em></a>`).join('')}</div>
    <div class="section-heading"><h2>八章主线流程</h2><a href="#/guide">全部路线 →</a></div><div class="chapter-grid">${names.map((name,i)=>`<button class="chapter-card" data-walkthrough="${i+1}"><small>CHAPTER 0${i+1}</small><b>第 ${i+1} 章</b><span>${name}</span></button>`).join('')}</div>
    <div class="reading-banner"><b>原始记录可查 · 每条附来源</b><span>正式版与试玩版的研究范围分开标注。</span><a href="#/sources">了解收录 ↗</a></div></div>
    <aside class="home-aside">${progressPanel()}<div class="panel"><div class="data-label">QUICK REFERENCE</div><h3>常用查询</h3>${[['精金','专属武器怎么拿？'],['石板','石板碎片在哪里？'],['萨菲罗斯','萨菲罗斯如何获得？'],['MR','幻兵精通与技能学习'],['Ribbon','缎带与异常抗性']].map(([q,title])=>`<button class="related-link" data-query="${q}">${title} <span>↗</span></button>`).join('')}<p>中文攻略附英文地点对照，方便在不同汉化译名之间查找。</p></div><div class="panel"><div class="data-label">REFERENCE VIDEO</div><h3>你提供的参考攻略</h3><p>Pser_hanser · 全角色专属装备<br>分析介绍与获取攻略</p><a class="aside-link" href="https://www.bilibili.com/video/BV1fvH56cEkF/" target="_blank" rel="noopener noreferrer">打开原视频 ↗</a></div></aside></div>`;
  }
  function normalize(text) {return String(text??'').normalize('NFKC').toLowerCase().replace(/[’‘]/g,"'").replace(/[^\p{L}\p{N}]/gu,'')}
  const aliases={ '精金':['adamantite','专武'], '专武':['adamantite','专属武器'], '缎带':['ribbon'], '萨菲罗斯':['sephiroth'], '克劳德':['cloud'], '雷因':['rain'], '拉斯韦尔':['lasswell'], '菲娜':['fina'], '蒂娜':['terra'], '巴哈姆特':['bahamut'], '石板':['tablet','石板碎片'], '二刀流':['dual wield','dualsword'], '幻影':['幻兵','vision'], '幻兽':['召唤兽','esper'], '究极':['ultima'], '欧米茄':['omega'], '治疗':['heal','cure','healing'], '偷窃':['steal'], '掉落':['drop'], 'mr':['mastery','精通'], '白金':['trophy','成就'] };
  function matching(e,q) {const hay=searchIndex.get(e.id)||'';return q.trim().split(/\s+/).every(part=>[part,...(aliases[part.toLowerCase()]||[])].some(x=>hay.includes(normalize(x))))}
  function filtered() {
    let list=route.category==='search'?entries:route.category==='saved'?entries.filter(e=>state.saved.includes(e.id)||state.completed.includes(e.id)||state.notes[e.id]):entries.filter(e=>e.category===route.category);
    const q=$('#search').value.trim();if(q){list=list.filter(e=>matching(e,q));const terms=[q,...(aliases[q.toLowerCase()]||[])].map(normalize);const score=e=>Math.max(...terms.map(t=>normalize(e.title)===t||normalize(e.en)===t?100:normalize(e.title).includes(t)?80:normalize(e.en).includes(t)?65:0))+(['guide','collectibles'].includes(e.category)?8:0);list.sort((a,b)=>score(b)-score(a));}
    if(!prefs.spoilers)list=list.filter(e=>!e.spoiler);
    if(prefs.chapter>0)list=list.filter(e=>!e.chapter||e.chapter<=prefs.chapter);
    if(route.category==='saved'){if(filter==='saved')list=list.filter(e=>state.saved.includes(e.id));if(filter==='completed')list=list.filter(e=>state.completed.includes(e.id));if(filter==='notes')list=list.filter(e=>state.notes[e.id])}
    else if(filter==='pending')list=list.filter(e=>isCollectible(e)&&!state.completed.includes(e.id));
    else if(filter!=='all')list=list.filter(e=>(e.tags||[]).includes(filter)||e.category===filter);
    if(sourceFilter!=='all')list=list.filter(e=>(e.sourceIds||[]).includes(sourceFilter));
    return list;
  }
  function card(e) {
    const saved=state.saved.includes(e.id),done=state.completed.includes(e.id);
    const facts=Object.entries(e.fields||{}).filter(([k])=>!['原始页','原文','来源'].includes(k)).slice(0,2);
    return `<article class="result-card ${done?'done':''}"><button class="star ${saved?'on':''}" data-save="${escape(e.id)}" aria-label="${saved?'取消收藏':'收藏'} ${escape(e.title)}" aria-pressed="${saved}">${saved?'★':'☆'}</button><div class="card-title">${image(e)}<div><h3><a class="stretched" href="${hash(e.category,e.id)}">${escape(e.title)}</a></h3>${e.en&&e.en!==e.title?`<small>${escape(e.en)}</small>`:''}</div></div><p>${escape(blurb(e))}</p>${facts.length?`<div class="card-facts">${facts.map(([k,v])=>`<div>${escape(k)} · ${escape(valueText(v)).slice(0,170)}</div>`).join('')}</div>`:''}<div>${(e.tags||[]).slice(0,2).map(t=>`<span class="chip">${escape(t)}</span>`).join('')}</div><div class="card-foot">${isCollectible(e)?completeControl(e):`<span class="source-badge">${escape(label(e.category))}</span>`}<a href="${hash(e.category,e.id)}">查看详情 →</a></div></article>`;
  }
  function rows(list) {
    return `<div class="result-table-wrap"><table><thead><tr><th>名称</th><th>类别 / 条件</th><th>关键数据</th><th>记录</th></tr></thead><tbody>${list.map(e=>`<tr class="${state.completed.includes(e.id)?'done':''}"><td><a href="${hash(e.category,e.id)}">${escape(e.title)}</a>${e.en&&e.en!==e.title?`<small>${escape(e.en)}</small>`:''}</td><td class="nowrap">${escape((e.tags||[])[0]||label(e.category))}${e.chapter?`<small>第 ${e.chapter} 章起</small>`:''}</td><td class="data-cell">${escape(Object.entries(e.fields||{}).slice(0,3).map(([k,v])=>k+'：'+valueText(v)).join(' · ')||blurb(e)).slice(0,260)}</td><td class="nowrap">${completeControl(e)} <button data-save="${escape(e.id)}" aria-label="收藏 ${escape(e.title)}" aria-pressed="${state.saved.includes(e.id)}">${state.saved.includes(e.id)?'★':'☆'}</button></td></tr>`).join('')}</tbody></table></div>`;
  }
  function listPage() {
    const list=filtered(),pageSize=view==='table'?50:['visions','espers','characters'].includes(route.category)?32:24,total=Math.max(1,Math.ceil(list.length/pageSize));currentPage=Math.min(currentPage,total);
    const shown=list.slice((currentPage-1)*pageSize,currentPage*pageSize);
    const c=cat(route.category),searching=route.category==='search',saved=route.category==='saved';
    const title=searching?'搜索结果':c[1],description=searching?'搜索覆盖名称、别名、描述、学习来源与获取位置。':c[4];
    const tags=[...new Set((searching?[]:entries.filter(e=>e.category===route.category)).flatMap(e=>e.tags||[]))].filter(x=>x.length<30).slice(0,22);
    const activeSources=sources.filter(s=>entries.some(e=>(searching||saved||e.category===route.category)&&(e.sourceIds||[]).includes(s.id)));
    return `<div class="page-heading"><div><div class="eyebrow">${searching?'SEARCH THE ARCHIVE':c[3]}</div><h1>${title}</h1><p>${description}</p></div><span class="count-label">${list.length.toLocaleString()} 条结果</span></div>
    <div class="filters">${saved?['all','saved','completed','notes'].map((f,i)=>`<button data-filter="${f}" class="${filter===f?'active':''}">${['全部记录','我的收藏','已完成','有笔记'][i]}</button>`).join(''):`<button data-filter="all" class="${filter==='all'?'active':''}">全部</button>${['collectibles','visions','espers','achievements'].includes(route.category)?`<button data-filter="pending" class="${filter==='pending'?'active':''}">尚未收集</button>`:''}${searching?`<select id="tagFilter" aria-label="按资料类别筛选"><option value="all">全部类别</option>${categories.slice(1,12).map(c=>`<option value="${c[0]}" ${filter===c[0]?'selected':''}>${c[1]}</option>`).join('')}</select>`:tags.length?`<select id="tagFilter" aria-label="按类型筛选"><option value="all">全部类型</option>${tags.map(t=>`<option ${t===filter?'selected':''} value="${escape(t)}">${escape(t)}</option>`).join('')}</select>`:''}`}
    <select id="chapterFilter" aria-label="章节进度筛选"><option value="0">全部进度</option>${Array.from({length:8},(_,i)=>`<option value="${i+1}" ${prefs.chapter===i+1?'selected':''}>截至第 ${i+1} 章</option>`).join('')}</select>${activeSources.length>1?`<select id="sourceFilter" aria-label="按来源筛选"><option value="all">全部来源</option>${activeSources.map(s=>`<option value="${escape(s.id)}" ${sourceFilter===s.id?'selected':''}>${escape(s.title)}</option>`).join('')}</select>`:''}<button class="view-toggle" id="viewToggle">${view==='cards'?'☷ 表格视图':'▦ 卡片视图'}</button></div>
    ${prefs.chapter?`<div class="results-summary"><span>已隐藏晚于第 ${prefs.chapter} 章的已知内容；未标注章节的条目仍显示。</span><button id="resetChapter">查看全部进度 ×</button></div>`:''}
    ${list.length?(view==='table'?rows(shown):`<div class="result-grid">${shown.map(card).join('')}</div>`):`<div class="empty"><strong>${saved?'还没有符合条件的记录':'没有找到符合条件的条目'}</strong><p>${saved?'在图鉴中点 ☆ 收藏，或勾选已收集，就会出现在这里。':'试试英文原名或较短关键词，也可以清除类型、来源和进度筛选。'}</p>${!saved?'<button class="button" id="resetFilters">清除全部筛选</button>':'<a class="button" href="#/collectibles">浏览收集清单 →</a>'}</div>`}
    ${list.length>pageSize?`<nav class="pagination" aria-label="结果分页"><button data-page="${currentPage-1}" ${currentPage===1?'disabled':''}>← 上一页</button><span>${currentPage} / ${total}</span><button data-page="${currentPage+1}" ${currentPage===total?'disabled':''}>下一页 →</button></nav>`:''}`;
  }
  function renderFields(e) {return Object.entries(e.fields||{}).filter(([,v])=>v!==undefined&&v!==null&&v!=='').map(([k,v])=>`<tr><th scope="row">${escape(k)}</th><td>${escape(valueText(v)).replace(/\n/g,'<br>')}</td></tr>`).join('')}
  function related(e) {
    const direct=(e.related||[]).map(id=>lookup.get(typeof id==='object'?id.id:id)||entries.find(x=>x.en===id&&x.id!==e.id)).filter(Boolean);
    const names=[e.en,e.title].filter(x=>x&&x.length>2).map(normalize);
    const candidates=entries.filter(x=>x.id!==e.id&&((x.related||[]).includes(e.id)||(x.en&&e.en&&normalize(x.en)===normalize(e.en))||names.some(n=>(searchIndex.get(x.id)||'').includes(n))));
    return [...new Map([...direct,...candidates].map(x=>[x.id,x])).values()].filter(x=>!x.spoiler||prefs.spoilers).slice(0,10);
  }
  function detail(e) {
    if(!e)return `<div class="empty"><strong>未找到这个条目</strong><p>资料 ID 可能已更新，请重新搜索。</p><a class="button" href="#/home">返回首页</a></div>`;
    if(e.spoiler&&!prefs.spoilers)return `<div class="empty"><strong>此条目包含剧情信息</strong><p>可在设置中启用剧情条目。</p><button class="button" id="enableSpoiler">显示此类内容</button></div>`;
    const fields=renderFields(e),relatedEntries=related(e),original=safeUrl(e.sourceUrl),entrySources=sourceFor(e);
    const sections=(e.sections||[]).map(s=>`<section class="article-section"><h2>${escape(s.title||s.heading)}</h2>${(Array.isArray(s.body)?s.body:[s.body||s.text||'']).map(t=>`<p>${escape(valueText(t))}</p>`).join('')}${s.steps?`<ol class="steps">${s.steps.map(x=>`<li>${escape(valueText(x))}</li>`).join('')}</ol>`:''}</section>`).join('');
    return `<nav class="breadcrumbs" aria-label="面包屑"><a href="#/home">档案首页</a><span>/</span><a href="${hash(e.category)}">${label(e.category)}</a><span>/</span><span>${escape(e.title)}</span></nav><div class="detail-layout"><article class="detail-body"><header class="detail-header"><div class="eyebrow">${cat(e.category)[3]}</div><div class="detail-title">${image(e)}<div><h1>${escape(e.title)}</h1>${e.en&&e.en!==e.title?`<small>${escape(e.en)}</small>`:''}</div></div><p class="detail-summary">${escape(e.summary||'')}</p><div>${(e.tags||[]).map(t=>`<span class="chip">${escape(t)}</span>`).join('')}${e.chapter?`<span class="chip">第 ${e.chapter} 章起</span>`:''}</div><div class="detail-actions"><button data-save="${escape(e.id)}" aria-pressed="${state.saved.includes(e.id)}">${state.saved.includes(e.id)?'★ 已收藏':'☆ 收藏条目'}</button>${completeControl(e,true)}<button id="copyLink">复制条目链接 ↗</button></div></header>
    ${fields?`<h2>资料与条件</h2><div class="facts-table"><table><tbody>${fields}</tbody></table></div>`:''}${e.steps?.length?`<h2>${e.category==='guide'?'操作与路线':'获取 / 详细记录'}</h2><ol class="steps">${e.steps.map(step=>`<li>${escape(valueText(step)).replace(/\n/g,'<br>')}</li>`).join('')}</ol>`:''}${sections}${e.note?`<div class="notice">${escape(e.note)}</div>`:''}${e.version?`<p class="fine-print">记录版本：${escape(e.version)}</p>`:''}
    <h2>我的笔记</h2><textarea class="note-field" id="entryNote" aria-label="${escape(e.title)} 的个人笔记" placeholder="记录你的配装、测试结果，或下次要回来的位置…" maxlength="20000">${escape(state.notes[e.id]||'')}</textarea><div class="note-state" id="noteState">仅保存你的记录，不修改攻略资料。</div></article>
    <aside class="detail-aside"><section class="panel"><div class="data-label">EVIDENCE</div><h3>本条资料来源</h3>${original?`<a class="source-link" target="_blank" rel="noopener noreferrer" href="${escape(original)}">原始条目 / 获取攻略 ↗<span>${escape(new URL(original).hostname)}</span></a>`:''}${entrySources.map(s=>`<a class="source-link" target="_blank" rel="noopener noreferrer" href="${escape(safeUrl(s.url))}">${escape(s.title)} ↗<span>${escape(s.kind||s.scope||'来源资料')}</span></a>`).join('')}<p class="source-note">${escape(e.provenance||'事实数据与攻略说明按来源整理；地点和名称保留英文对照。未进行游戏内逐条实测。')}</p><a class="aside-link" href="#/sources">收录范围与版本说明 →</a></section>${relatedEntries.length?`<section class="panel"><div class="data-label">CONNECTED ENTRIES</div><h3>相关资料</h3>${relatedEntries.map(x=>`<a class="related-link" href="${hash(x.category,x.id)}">${escape(x.title)} <small class="muted">${label(x.category)}</small> ↗</a>`).join('')}</section>`:''}<section class="panel"><h3>继续查找</h3><button class="aside-link" data-query="${escape(e.en||e.title)}">搜索所有关联记录 →</button><p>${e.category==='enemies'?'同名敌人可能有不同形态或难度。请核对原始 ID 与难度字段。':'获取条件以当前游戏进度为准，相关数值与说明可从原始来源核对。'}</p></section></aside></div>`;
  }
  function sourcesPage() {
    return `<div class="page-heading"><div><div class="eyebrow">SOURCES & SCOPE</div><h1>有出处，才是资料。</h1><p>数据快照整理于 ${escape(db.updatedAt||'2026-10-25')}。下列数量来自当前实际收录，不代表全部内容都已在游戏内验证。</p></div></div><div class="source-stats">${categories.slice(1,12).map(c=>`<a class="chip" href="${hash(c[0])}">${c[1]} ${stats(c[0])}</a>`).join('')}</div><div class="notice">游戏数值以公开游戏数据记录为依据；记录存在不等于任意存档都能获得。获取路线与中文摘要按玩家攻略独立整理。正式版数据与试玩版机制研究分别注明，资料冲突会保留说明。</div><div class="source-grid">${sources.map(s=>`<article class="source-card"><div class="data-label">${escape(s.kind||s.scope||'REFERENCE')}</div><h3>${escape(s.title)}</h3><p>${escape(s.note||s.description||s.scope||'')}</p><a href="${escape(safeUrl(s.url))}" target="_blank" rel="noopener noreferrer">${escape(s.url)} ↗</a><small>核查日期 ${escape(s.checkedAt||s.checked||'2026-10-25')} · ${entries.filter(e=>(e.sourceIds||[]).includes(s.id)).length} 条关联记录</small></article>`).join('')}</div><div class="section-heading"><h2>如何阅读这些数据</h2></div><div class="panel"><p>① 幻兵、技能、装备、敌人条目保留数据来源与原始名称；中文名有译法差异时可用英文检索。</p><p>② 技能威力、基础属性和最终战斗结果是不同概念。物理、魔法、固定伤害和治疗不能使用同一倍率直接比较。</p><p>③ 敌人图鉴可能将同名变体分开计数；学习能力与敌方内部能力的统计口径也不同。仅展示本次导入的实际数据。</p><p>④ 收集说明使用中文重新整理；原站地图、图片步骤和视频解说请从对应来源链接查看。此站不声称完成游戏内全量实测。</p><p>⑤ 收藏与笔记属于你的浏览器记录，可在设置中导出；已配对 PT Universe 时沿用其同步。原始游戏数据和素材归各自权利人所有，本站为非官方攻略索引。</p></div>`;
  }
  function render() {
    if(!db)return;
    renderNav();
    $('#content').innerHTML=route.id?detail(lookup.get(route.id)):route.category==='home'?home():route.category==='sources'?sourcesPage():listPage();
    document.title=(route.id?lookup.get(route.id)?.title:route.category==='search'?'搜索':label(route.category))+' · FF Guide';
    bind();
  }
  function bind() {
    $$('[data-save]').forEach(el=>el.onclick=()=>toggleSaved(el.dataset.save));
    $$('[data-check]').forEach(el=>el.onchange=()=>toggleComplete(el.dataset.check,el.checked));
    $$('[data-query]').forEach(el=>el.onclick=()=>search(el.dataset.query));
    $$('[data-filter]').forEach(el=>el.onclick=()=>{filter=el.dataset.filter;currentPage=1;render()});
    $$('[data-page]').forEach(el=>el.onclick=()=>{currentPage=Number(el.dataset.page);render();$('#content').scrollIntoView({block:'start',behavior:'smooth'})});
    $$('[data-walkthrough]').forEach(el=>el.onclick=()=>navigate('guide','walkthrough-chapter-'+el.dataset.walkthrough));
    if($('#tagFilter'))$('#tagFilter').onchange=e=>{filter=e.target.value;currentPage=1;render()};
    if($('#sourceFilter'))$('#sourceFilter').onchange=e=>{sourceFilter=e.target.value;currentPage=1;render()};
    if($('#chapterFilter'))$('#chapterFilter').onchange=e=>{prefs.chapter=Number(e.target.value);writePrefs();currentPage=1;render()};
    if($('#viewToggle'))$('#viewToggle').onclick=()=>{view=view==='cards'?'table':'cards';currentPage=1;render()};
    if($('#resetChapter'))$('#resetChapter').onclick=()=>{prefs.chapter=0;writePrefs();render()};
    if($('#resetFilters'))$('#resetFilters').onclick=()=>{filter='all';sourceFilter='all';prefs.chapter=0;writePrefs();$('#search').value='';$('#clearSearch').hidden=true;currentPage=1;render()};
    if($('#enableSpoiler'))$('#enableSpoiler').onclick=()=>{prefs.spoilers=true;writePrefs();render()};
    if($('#copyLink'))$('#copyLink').onclick=async()=>{try{await navigator.clipboard.writeText(location.href);toast('条目链接已复制')}catch{toast('请复制浏览器地址栏中的条目链接')}};
    if($('#entryNote'))$('#entryNote').oninput=e=>{state.notes[route.id]=e.target.value;writeState();$('#noteState').textContent='已保存';};
  }
  function search(q) {$('#search').value=q;$('#clearSearch').hidden=!q;filter='all';sourceFilter='all';currentPage=1;const target='#/search?q='+encodeURIComponent(q);if(location.hash===target)render();else location.hash=target}
  function parseRoute() {
    const [path,qs]=location.hash.replace(/^#\/?/,'').split('?'),parts=path.split('/');
    let category=parts[0]||'home';if(!categories.some(c=>c[0]===category)&&category!=='search')category='home';
    let id=null;try{id=parts[1]?decodeURIComponent(parts.slice(1).join('/')):null}catch{}
    route={category,id};
    if(lastCategory!==category){currentPage=1;filter='all';sourceFilter='all';view=['equipment','skills','items','enemies','quests'].includes(category)?'table':'cards'}
    const query=new URLSearchParams(qs||'').get('q')||'';$('#search').value=query;$('#clearSearch').hidden=!query;lastCategory=category;
    $('#sidebar').classList.remove('open');$('#scrim').hidden=true;render();window.scrollTo({top:0});
  }
  $('#searchForm').onsubmit=e=>{e.preventDefault();search($('#search').value)};
  $('#search').oninput=e=>{clearTimeout(searchTimer);const value=e.target.value;$('#clearSearch').hidden=!value;searchTimer=setTimeout(()=>search(value),220)};
  $('#clearSearch').onclick=()=>{search('');$('#search').focus()};
  $('#savedButton').onclick=()=>navigate('saved');
  $('#menu').onclick=()=>{$('#sidebar').classList.toggle('open');$('#scrim').hidden=!$('#sidebar').classList.contains('open')};
  $('#scrim').onclick=()=>{$('#sidebar').classList.remove('open');$('#scrim').hidden=true};
  $('#settingsButton').onclick=()=>{$('#chapterSetting').value=prefs.chapter;$('#spoilerSetting').checked=prefs.spoilers;$('#settingsStatus').textContent=window.PTSync?.config()?'已连接 PT Universe 同步。':'当前记录自动保存在此浏览器。';$('#settings').showModal()};
  $('#chapterSetting').onchange=e=>{prefs.chapter=Number(e.target.value);writePrefs();currentPage=1;render()};
  $('#spoilerSetting').onchange=e=>{prefs.spoilers=e.target.checked;writePrefs();render()};
  $('#exportProgress').onclick=()=>{const blob=new Blob([JSON.stringify({...state,preferences:prefs,exportedAt:new Date().toISOString()},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='ff-guide-progress.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);$('#settingsStatus').textContent='记录已导出。'};
  $('#importProgress').onchange=async e=>{try{const f=e.target.files[0];if(!f)return;if(f.size>2000000)throw Error('文件过大');const data=JSON.parse(await f.text());if(data.version!==1||!Array.isArray(data.saved)||!Array.isArray(data.completed)||!data.notes||typeof data.notes!=='object'||Array.isArray(data.notes))throw Error('记录格式不正确');const known=ids=>ids.filter(id=>typeof id==='string'&&lookup.has(id));state.saved=[...new Set([...state.saved,...known(data.saved)])];state.completed=[...new Set([...state.completed,...known(data.completed)])];for(const [id,note] of Object.entries(data.notes)){if(lookup.has(id)&&typeof note==='string')state.notes[id]=note.slice(0,20000)}writeState();render();$('#settingsStatus').textContent='已合并导入收藏、收集进度与笔记。'}catch(err){$('#settingsStatus').textContent='导入失败：'+err.message}e.target.value=''};
  addEventListener('hashchange',parseRoute);
  addEventListener('keydown',e=>{if(e.key==='/'&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)){e.preventDefault();$('#search').focus()}if(e.key==='Escape'){$('#sidebar').classList.remove('open');$('#scrim').hidden=true}});
  addEventListener('pt-sync-applied',()=>{state=read(KEY,state);prefs=read(PREFS,prefs);render()});
  addEventListener('storage',e=>{if(e.key===KEY){state=read(KEY,state);render()}});
  async function init(){try{const response=await fetch('data.json?v=20261025-1');if(!response.ok)throw Error('HTTP '+response.status);db=await response.json();entries=db.entries||[];sources=db.sources||[];lookup=new Map(entries.map(e=>[e.id,e]));for(const e of entries)searchIndex.set(e.id,normalize([e.title,e.en,e.summary,...(e.tags||[]),...Object.entries(e.fields||{}).flat(),...(e.steps||[])].map(valueText).join(' ')));parseRoute();bind()}catch(err){$('#content').innerHTML=`<div class="empty"><strong>资料暂时无法打开</strong><p>${escape(err.message)}</p><button class="button" id="retry">重新载入</button></div>`;$('#retry').onclick=init}}
  init();
})();
