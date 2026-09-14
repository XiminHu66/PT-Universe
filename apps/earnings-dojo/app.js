import {$,esc,link,pct,compact,read,save,toast,json,meta,boot,backups,financialTable,bars,stamp} from '../_lab/core.js?v=3';
import {buildCases,questionPool,valueSignature,shuffle,direction} from './questions.js?v=1';
boot();let data,cases=[],index=0,questions=[],revealed=false,history=read('dojo',[]),liveMessage='',busy=false;
const API='https://pt-universe-api.summer07-nanjolno.workers.dev';
function selectCase(preferred){
 cases=buildCases(data.companies);
 const last=read('dojoLastCase','');
 const options=cases.map((c,i)=>({c,i})).filter(x=>!preferred||x.c.ticker===preferred);
 const unseen=options.filter(x=>!history.some(h=>h.case===x.c.id)&&x.c.id!==last),different=options.filter(x=>x.c.id!==last);
 const chosen=shuffle(unseen.length?unseen:different.length?different:options)[0];index=chosen?.i||0;
 begin();
}
function begin(){revealed=false;questions=cases[index]?shuffle(questionPool(cases[index])).slice(0,3):[];if(cases[index])save('dojoLastCase',cases[index].id);render()}
function render(){const c=cases[index];if(!c){$('#app').innerHTML='<div class="empty">暂无足够连续季度的真实案例，请查看数据更新状态。</div>';return}
 const qs=c.quarters,q=qs.at(-1);
 $('#app').innerHTML='<p id="liveStatus" class="notice" role="status">'+esc(liveMessage||'正在重新核对财报来源…')+'</p><div class="toolbar"><button id="newCase">只换一道练习</button><label>练习案例<select id="case">'+cases.map((_,i)=>'<option value="'+i+'" '+(i===index?'selected':'')+'>案例 '+String(i+1).padStart(2,'0')+'</option>').join('')+'</select></label><span class="tag">真实财报 · '+cases.length+' 个季度案例</span><span class="tag">'+questionPool(c).length+' 种可用题型 · 本次抽取 3 题</span></div><section class="panel"><h2>匿名公司 · 截至 '+esc(q.end)+'</h2><p class="muted">题目由财报数值生成，优先选择未练习案例。公司每季才发布新财报，重新查询不代表每天都有新季度。</p>'+bars(qs)+financialTable(qs)+'<p class="notice">金额可能包含后续重述，不是严格的历史时点回测；下一季度经营表现不代表股票涨跌。</p></section><section class="panel"><form id="answer"><div class="form-grid">'+questions.map(x=>'<label>'+esc(x.label)+'<select name="'+x.id+'" data-question required><option value="">请选择</option>'+Object.entries(x.options).map(([k,v])=>'<option value="'+k+'">'+v+'</option>').join('')+'</select></label>').join('')+(c.next?'<label>下一季营收方向预测（不计分）<select name="forecast">'+Object.entries(direction).map(([k,v])=>'<option value="'+k+'">'+v+'</option>').join('')+'</select></label>':'')+'<label class="wide">你的判断与需要进一步核实的风险<textarea name="reason" maxlength="4000" placeholder="增长是否转换为现金？股数增加是否抵消利润增长？"></textarea></label></div><button class="primary" type="submit">提交并揭晓</button></form><div id="reveal"></div></section><section class="panel"><h2>练习记录</h2><div class="history">'+(history.length?history.slice().reverse().map(h=>'<p><strong>'+esc(h.company)+' · '+h.score+'/3</strong> <small>'+esc(h.date)+'</small><br>'+esc(h.reason||'未填写判断')+'</p>').join(''):'<p class="muted">完成第一次练习后会保存在这里。</p>')+'</div></section>';
 $('#case').onchange=e=>{index=Number(e.target.value);begin()};$('#newCase').onclick=()=>{selectCase();window.scrollTo({top:0,behavior:'smooth'})};
 $('#answer').onsubmit=e=>{
  e.preventDefault();if(revealed)return;revealed=true;const answers=Object.fromEntries(new FormData(e.target)),score=questions.filter(x=>answers[x.id]===x.correct).length;
  history.push({id:crypto.randomUUID(),case:c.id,company:c.name,ticker:c.ticker,date:new Date().toISOString(),score,reason:answers.reason,answers,questionIds:questions.map(x=>x.id)});history=history.slice(-500);save('dojo',history);e.target.hidden=true;
  $('#reveal').innerHTML='<span class="eyebrow">REVEALED</span><h2>'+esc(c.ticker+' · '+c.name)+'</h2><div class="rating">'+score+' / 3</div>'+questions.map(x=>'<p><strong>'+esc(x.label)+'：'+esc(x.options[x.correct])+'</strong><br>'+esc(x.explanation)+'</p>').join('')+(c.next?'<h3>下一季 '+esc(c.next.end)+' 的实际结果</h3><p>营收 '+compact(c.next.revenue)+'，相较本季 '+pct((c.next.revenue-q.revenue)/Math.abs(q.revenue))+'。</p>':'<h3>最新季度案例</h3><p>下一季度尚无可用数据，不编造结果；以后发布新财报会自动进入案例库。</p>')+'<p>'+link(c.sourceURL,'核对财报来源')+'</p><button id="next" class="primary">下一案例 →</button>';
  $('#next').onclick=()=>{selectCase();window.scrollTo({top:0,behavior:'smooth'})};toast('练习结果已保存');
 };
}
async function refreshFinancials(){
 if(busy||!data)return;busy=true;$('#refresh').disabled=true;$('#refresh').textContent='正在查询财报…';
 const cursor=read('dojoTickerCursor',0),company=data.companies[cursor%data.companies.length];save('dojoTickerCursor',cursor+1);
 document.querySelectorAll('#app input,#app select,#app button,#app textarea').forEach(e=>e.disabled=true);
 liveMessage='正在向财报来源重新查询一家公司的季度数据…';if($('#liveStatus'))$('#liveStatus').textContent=liveMessage;
 try{
  const fresh=await json(API+'/api/training/financials?symbol='+encodeURIComponent(company.ticker)+'&t='+Date.now());
  if(!fresh.live||fresh.ticker!==company.ticker||!Array.isArray(fresh.quarters))throw new Error('来源响应未通过检查');
  const changed=valueSignature(company.quarters)!==valueSignature(fresh.quarters);
  const cache=read('dojoFinancials',{});cache[company.ticker]=fresh;save('dojoFinancials',cache);
  data.companies=data.companies.map(c=>c.ticker===fresh.ticker?{...c,...fresh}:c);
  data.sources=(data.sources||[]).filter(s=>s.id!==fresh.ticker&&!s.name?.startsWith(fresh.ticker+' · '));
  data.sources.push({id:fresh.ticker,name:fresh.ticker+' · Yahoo 即时核对',url:fresh.sourceURL,ok:true,count:fresh.quarters.length,lastSuccessAt:fresh.updatedAt,checkedAt:fresh.updatedAt});
  data.updatedAt=fresh.updatedAt;
  liveMessage='已重新查询本次练习对应公司的 '+fresh.quarters.length+' 个季度 · '+stamp(fresh.updatedAt)+'。'+(changed?'检测到季度或数值变化，已更新案例。':'已核对，财报数值未变化；重新生成练习。');
  meta(data);selectCase(fresh.ticker);
 }catch(e){liveMessage='本次实时核对失败：'+e.message+'。继续使用最后取得的财报生成练习，未将旧数据标成新抓取。';selectCase()}
 finally{busy=false;document.querySelectorAll('#app input,#app select,#app button,#app textarea').forEach(e=>e.disabled=false);$('#refresh').disabled=false;$('#refresh').textContent='↻ 刷新财报并换题'}
}
$('#refresh').onclick=refreshFinancials;
backups('dojo',()=>history,v=>{if(!Array.isArray(v)||v.length>500||!v.every(x=>x&&typeof x.company==='string'&&Number.isInteger(x.score)&&x.score>=0&&x.score<=3))throw new Error('记录格式不正确');history=v;save('dojo',v);render()});
try{
 data=await json('../thesis-lab/data/financials.json');
 const cache=read('dojoFinancials',{});data.companies=data.companies.map(c=>cache[c.ticker]&&Date.parse(cache[c.ticker].updatedAt)>Date.parse(c.updatedAt)?{...c,...cache[c.ticker]}:c);
 meta(data);selectCase();await refreshFinancials();
}catch(e){$('#app').innerHTML='<div class="empty">'+esc(e.message)+'</div>'}
