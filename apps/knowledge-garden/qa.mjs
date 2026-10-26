import {esc} from './model.mjs';
import {coverage,reading,readingLabels,typeLabels} from './knowledge.mjs?v=scope-20261025';

// Only the visible selector filters reading status. Question wording never does.
export function questionScope(books,filter=''){
  return books.filter(b=>filter==='read'?['read','deep'].includes(reading(b)):filter==='deep'?reading(b)==='deep':true);
}
export function hasNamedSource(question,books){
  const phrases=String(question).match(/[a-zA-Z0-9]+(?:[ -]+[a-zA-Z0-9]+)+/g)||[];
  const names=(String(question).match(/[a-zA-Z][a-zA-Z0-9]+/g)||[]).filter(s=>/[a-z][A-Z]/.test(s)||/^[A-Z]{3,}$/.test(s));
  const compact=s=>s.toLowerCase().replace(/[^a-z0-9]/g,'');
  return [...phrases,...names].some(name=>compact(name).length>=3&&books.some(b=>compact(b.title).includes(compact(name))));
}
export function retrievalSummary(available,scope,hits,{filter='',question='',name='全部知识库',expansion=''}={}){
  const cc=coverage(scope),seen=new Set(),matchedSources=[];
  for(const hit of hits){
    if(seen.has(hit.sourceId))continue;
    seen.add(hit.sourceId);
    if(matchedSources.length<12)matchedSources.push({sourceId:hit.sourceId,title:hit.title,type:hit.type,reading:hit.reading,page:hit.page,chunkId:hit.id,version:hit.version,snippet:hit.text.slice(0,180)});
  }
  const readCount=scope.filter(b=>['read','deep'].includes(reading(b))).length;
  const readingNotice=/读过|阅读过|精读过|read before|have i read/i.test(question)
    ?`当前范围 ${scope.length} 条资料，${readCount} 条标记为已读或已精读。${filter?'已按你选择的阅读状态筛选。':'仍按「全部资料」检索；未标记已读的内容只能确认已收藏，不能确认你读过。'}`:'';
  return {coverage:cc,matchedDocuments:seen.size,matchedSources,readingNotice,queryExpansion:expansion,
    scopeInfo:{name,filter,available:available.length,excluded:available.length-scope.length},
    emptyKind:!scope.length?(filter&&available.length?'reading-filter':'empty-library'):!cc.indexed?'index':!hits.length?'no-match':''};
}
const emptyCopy={
  'reading-filter':['这个阅读范围暂时没有资料','资料仍在库中，只是尚未标记为已读。可以直接检索当前 Workspace 的全部资料。'],
  'empty-library':['当前空间还没有资料','先保存网页、上传 PDF，或把已有资料加入这个 Workspace。'],
  index:['资料尚未建立可用索引','先更新索引；扫描 PDF 可能需要 OCR。原始文件仍可打开。'],
  'no-match':['没有找到相关片段','当前范围已经检索完成。试试论文名、方法名或更具体的关键词。'],
  legacy:['这条历史回答没有检索到资料','旧版本可能按“读过”等措辞额外过滤了资料。重新检索将严格使用上方选择的范围。']
};
export function emptyAnswer(meta){return {title:emptyCopy[meta.emptyKind]?.[0]||'暂时没有足够证据',statements:[],unknowns:[],model:'',createdAt:new Date().toISOString(),...meta};}
export function answerHTML(a,contexts=[]){
  const statements=a.statements||[],valid=statements.filter(s=>s.grounded),invalid=statements.length-valid.length,cc=a.coverage;
  const citations=new Set(valid.flatMap(s=>s.sources.map(c=>c.sourceId))),kind=a.emptyKind||(!valid.length&&cc?.total===0?'legacy':'');
  const empty=emptyCopy[kind],hasSources=!!a.matchedSources?.length;
  const meta=[a.model,a.createdAt?new Date(a.createdAt).toLocaleString('zh-CN'):'',a.saved?'已自动保存':''].filter(Boolean).map(esc).join(' · ');
  return `<div class="answer-heading"><h2>${esc(a.pending?'已找到相关资料，正在生成回答…':a.error?'回答暂未完成，已保留检索结果':empty?.[0]||a.title||'知识库回答')}</h2><p class="help answer-meta">${meta}</p></div>
    ${cc?`<div class="answer-metrics"><span>本轮：${esc(a.scopeInfo?.name||'资料库')} · ${a.scopeInfo?.filter==='deep'?'仅已精读':a.scopeInfo?.filter==='read'?'已读 / 已精读':'全部资料'} ${cc.total} 条</span><span>可检索 ${cc.indexed}</span><span>命中 ${a.matchedDocuments||0}</span>${valid.length?`<span>引用 ${citations.size} 篇</span>`:''}<details><summary>检索详情</summary><p>送入模型 ${contexts.length} 个片段 / ${new Set(contexts.map(c=>c.sourceId)).size} 条资料${a.scopeInfo?.excluded?'；阅读筛选排除 '+a.scopeInfo.excluded+' 条':''}。仅检索当前 Workspace。</p></details></div>`:''}
    ${a.readingNotice?`<p class="reading-notice">${esc(a.readingNotice)}</p>`:''}
    ${empty&&!a.error?`<div class="answer-empty"><p>${esc(empty[1])}</p><div class="row"><button class="primary" id="retry-answer">${kind==='reading-filter'||kind==='legacy'?'在全部资料中重新检索':'重新检索'}</button><button id="view-library">查看当前资料</button></div></div>`:''}
    ${hasSources?`<details class="retrieved-sources" ${!valid.length?'open':''}><summary>相关资料 · ${a.matchedDocuments} 条${valid.length?' · 查看检索来源':''}</summary><div class="retrieved-grid">${a.matchedSources.map(s=>`<button class="retrieved-source" data-source="${esc(s.sourceId)}"><span class="resource-label">${esc(typeLabels[s.type]||'资料')} · ${esc(readingLabels[s.reading]||'待读')}${s.page?' · 第 '+s.page+' 页':''}</span><strong>${esc(s.title)}</strong><span class="retrieved-snippet">${esc(s.snippet)}</span></button>`).join('')}</div><p class="help">命中只表示内容相关；提及某方法不等于采用该方法。</p></details>`:''}
    ${valid.map(s=>`<div class="statement"><p>${esc(s.text)}</p><div class="sources">${s.sources.map(c=>`<button data-source="${esc(c.sourceId||c.id)}" data-evidence="${esc(c.id)}" data-chunk="${esc(c.chunkId||'')}" title="${esc(c.quote)}">↗ ${esc(c.title||'原文')}${c.page?' · p.'+c.page:c.section?' · '+esc(c.section):' · '+esc(c.chunkId||'')}</button>`).join('')}</div><details><summary>查看引用</summary>${s.sources.map(c=>`<blockquote>“${esc(c.quote)}”</blockquote>`).join('')}</details></div>`).join('')}
    ${!empty&&!valid.length&&!a.error&&!a.pending?'<p class="help">找到了相关资料，但当前证据还不足以形成可核对的结论。</p>':''}
    ${a.error?`<div class="answer-empty"><p>${esc(a.error)}</p><button id="retry-answer">重试回答</button></div>`:''}
    ${a.unknowns?.length?'<div class="answer-unknowns"><h3>尚需确认</h3>'+a.unknowns.map(s=>'<p>'+esc(s)+'</p>').join('')+'</div>':''}
    ${invalid?`<p class="help">${invalid} 条结论未通过引用匹配，未显示。</p>`:''}
    ${cc?.missing?.length?`<details class="optional"><summary>${cc.missing.length} 条资料尚不可检索</summary>${cc.missing.map(b=>'<p class="help">'+esc(b.title)+' · '+esc(b.status)+'</p>').join('')}</details>`:''}
    ${a.pending?'':`<div class="report-actions">${valid.length?'<button id="save-report">采纳为知识笔记</button>':''}<button id="download-report">导出回答</button></div>`}<p class="help answer-footnote">检索提供相关片段；复杂推导请核对全文。</p>`;
}
