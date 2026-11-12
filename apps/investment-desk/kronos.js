import {esc} from '../_decision/core.js';
import {API} from '../_shared/on-demand.mjs';

const supported = new Set(['QQQ', 'NVDA', 'AMD', 'GOOGL', 'SMH']);
const status = document.querySelector('#kronosStatus');
const result = document.querySelector('#kronosResult');
const run = document.querySelector('#kronosRun');
const panel = document.querySelector('#panel-market');
const cached = new Map();
const inflight = new Map();
let symbol = new URLSearchParams(location.search).get('symbol') || 'NVDA';
let timer;
const dollars = new Intl.NumberFormat('en-US', {style:'currency', currency:'USD'});
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);

function valid(data, ticker){
  return data?.symbol === ticker && validDate(data.asOf)
    && Array.isArray(data.dates) && data.dates.length === 10 && data.dates.every(validDate)
    && data.reference > 0 && [data.reference,data.endMedian,data.endLow,data.endHigh].every(Number.isFinite)
    && Array.isArray(data.paths) && data.paths.length === 4
    && data.paths.every(path => Array.isArray(path) && path.length === 10 && path.every(price => Number.isFinite(price) && price > 0))
    && [data.up,data.down].every(count => Number.isInteger(count) && count >= 0)
    && data.up + data.down <= data.paths.length;
}

function chart(data) {
  const paths = data.paths.map(path => [data.reference, ...path]);
  const low = Math.min(...paths.flat()), high = Math.max(...paths.flat());
  const x = index => 6 + index * 48;
  const y = value => 91 - ((value - low) / Math.max(0.01, high - low)) * 82;
  const lines = paths.map((path,i) => `<polyline points="${path.map((price,j)=>x(j)+','+y(price).toFixed(1)).join(' ')}" stroke="var(--blue)" stroke-opacity="${.38+i*.15}"/>`).join('');
  return `<svg viewBox="0 0 492 100" preserveAspectRatio="none" role="img" aria-label="四条模拟收盘路径，横轴为未来十个交易日">
    <g fill="none" stroke-width="1.4"><line x1="6" x2="486" y1="${y(data.reference)}" y2="${y(data.reference)}" stroke="var(--muted)" stroke-dasharray="4 4"/>${lines}</g>
  </svg>`;
}

function paint(){
  const previous = cached.get(symbol);
  const data = valid(previous?.data, symbol) ? previous.data : null;
  const eligible = supported.has(symbol);
  const working = previous?.state === 'running';
  const fresh = previous?.state === 'fresh' && data?.asOf === previous.session;
  run.hidden = !eligible;
  run.disabled = working || fresh || inflight.has(symbol);
  run.textContent = working ? '推理中' : fresh ? '已更新' : '运行模型';
  if(!eligible){
    status.textContent = '当前覆盖 QQQ、NVDA、AMD、GOOGL、SMH';
    result.replaceChildren();
    return;
  }
  status.textContent = working ? 'VPS 正在计算四条路径，可先查看其他证据'
    : previous?.error ? previous.error
    : fresh ? `行情截至 ${data.asOf} 收盘 · 目标日 ${data.dates.at(-1)}`
    : data ? `历史情景 · 截至 ${data.asOf} 收盘`
    : previous ? '暂无预测。点击运行模型后，通常约两分钟。' : '正在读取最近一次预测';
  if(!data){result.replaceChildren();return}
  const direction = data.up >= 3 ? '采样偏上行' : data.down >= 3 ? '采样偏下行' : '采样方向分歧';
  const state = document.querySelector('#positionDecision').dataset.rule;
  const divergence = fresh && ((data.down >= 3 && ['buy','candidate'].includes(state)) ||
    (data.up >= 3 && ['sell','trim'].includes(state)));
  const wasOpen = result.querySelector('details')?.open;
  result.innerHTML = `<div class="kronos-summary"><strong>${fresh?direction:'历史样本'}</strong>
    <span>第 10 日中位 ${dollars.format(data.endMedian)}</span>
    <span>路径范围 ${dollars.format(data.endLow)}–${dollars.format(data.endHigh)}</span></div>
    ${divergence?'<p class="evidence-error">模型方向与当前操作候选分歧，优先复核价格和财报。</p>':''}
    <details ${wasOpen?'open':''}><summary>展开 4 条路径 · 上行 ${data.up} / 下行 ${data.down}</summary>
    ${chart(data)}<p>${esc(data.dates[0])} 至 ${esc(data.dates.at(-1))} · 模型情景 · 收盘参考 ${dollars.format(data.reference)}。路径范围是样本最小至最大值。</p></details>`;
}

function schedule(){
  clearTimeout(timer);
  if(!document.hidden&&!panel.hidden&&cached.get(symbol)?.state==='running')
    timer=setTimeout(()=>read(symbol),12000);
}

async function read(ticker, method='GET'){
  if(!supported.has(ticker)||inflight.has(ticker))return;
  const last = cached.get(ticker);
  if(method==='GET' && last && last.state!=='running' && Date.now()-last.checkedAt<30000)return;
  const task = (async()=>{
    try{
      const response=await fetch(API+'/api/kronos?symbol='+encodeURIComponent(ticker),{method,cache:'no-store',signal:AbortSignal.timeout(15000)});
      const payload=await response.json();
      if(!response.ok)throw Error(payload.error||'预测服务暂不可用');
      if(payload.data && !valid(payload.data,ticker))throw Error('收到无效模型快照');
      cached.set(ticker,{...payload,checkedAt:Date.now()});
    }catch(error){
      cached.set(ticker,{state:'unavailable',data:last?.data,error:error.message,checkedAt:Date.now()});
    }finally{
      inflight.delete(ticker);
      if(ticker===symbol){paint();schedule()}
    }
  })();
  inflight.set(ticker,task);
  if(ticker===symbol)paint();
}

function select(ticker){
  if(typeof ticker!=='string')return;
  symbol=ticker;
  paint();
  schedule();
  if(!panel.hidden&&!document.hidden)read(ticker);
}

run.addEventListener('click',()=>read(symbol,'POST'));
addEventListener('workspace-activate',e=>{if(e.detail.tab==='market')select(e.detail.symbol);else clearTimeout(timer)});
addEventListener('workspace-select-symbol',e=>select(e.detail.symbol));
addEventListener('workspace-symbol-changed',e=>select(e.detail.symbol));
document.addEventListener('visibilitychange',()=>select(symbol));
new MutationObserver(()=>{if(!panel.hidden&&cached.has(symbol))paint()})
  .observe(document.querySelector('#positionDecision'),{attributes:true,attributeFilter:['data-rule']});
select(symbol);
