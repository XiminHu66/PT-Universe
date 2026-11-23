import {API} from '../_shared/on-demand.mjs';
import {confirmedSession, evaluateRules, META_PRIOR} from './swing-rules.mjs?v=20261123';

const dollars = new Intl.NumberFormat('en-US', {style:'currency', currency:'USD'});
const pct = (value, digits = 2, signed = false) => Number.isFinite(value)
  ? `${signed && value > 0 ? '+' : ''}${(100 * value).toFixed(digits)}%` : '—';
const price = value => Number.isFinite(value) ? dollars.format(value) : '—';
const date = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? value : '—';
const stockCode = /^[A-Z][A-Z0-9.\-]{0,14}$/;
const cryptoCode = /-(USD|EUR|BTC|ETH|USDT)$/;
const badge = (label, state = 'neutral') => `<span class="rule-state" data-state="${state}">${label}</span>`;
const item = (title, status, description) => `<article class="rule-row"><div><h3>${title}</h3>${status}</div><p>${description}</p></article>`;

function momentumRow(snapshot, symbol, score, asOf) {
  const rank = snapshot?.symbols.indexOf(symbol.replace(/\.([AB])$/, '-$1')) ?? -1;
  const factor = score === null ? '6–1 收益待计算' : `6–1 收益 ${pct(score, 2, true)}`;
  if (rank < 0) return item('中期动量', badge(snapshot ? '研究池外' : '等待排名'), factor);
  const historical = asOf && asOf >= snapshot.next;
  const detail = `${factor} · ${date(snapshot.date)} 全池第 ${rank + 1}/300 · ${historical ? '本轮完整排名待更新' : `下轮 ${date(snapshot.next)}`}`;
  return item('中期动量', badge(historical ? '待本轮排名' : rank < 10 ? '上轮 Top 10' : rank < 20 ? '上轮 Top 20' : '上轮池外档'),
    detail);
}

function gapRow(gap, type) {
  if (type === 'ETF') return item('放量跳空', badge('仅个股'), 'ETF 排除');
  if (!gap) return item('放量跳空', badge('待量价数据'), '需要前 20 日完整成交额');
  return item('放量跳空', badge(gap.entry ? '入场条件满足' : '条件未满足', gap.entry ? 'match' : 'neutral'),
    `跳空 ${pct(gap.gap, 2, true)} / ≥2% · 成交额 ${gap.rv.toFixed(2)}× / ≥2× · ${gap.heldOpen ? '收盘守住开盘价' : '收盘跌破开盘价'}`);
}

function blendRows(dc, sma, bars) {
  const meta = dc?.score;
  const dcState = !dc ? badge('待日线') : dc.exit ? badge('退出规则满足', 'risk')
    : dc.entry === null ? badge('待 SPY 或成交量') : dc.entry ? badge('入场条件满足', 'match') : badge('条件未满足');
  const smaState = !sma ? badge('待日线') : sma.exit ? badge('退出规则满足', 'risk')
    : sma.entry ? badge('趋势条件满足', 'match') : badge('观察');
  return item('Donchian＋Meta-L2', dcState, dc
    ? `前 20 日上轨 ${price(dc.high20)} · ${dc.breakout ? '已突破' : '未突破'} · Meta 分数 ${pct(meta)} / ≥${pct(META_PRIOR)}`
    : `需要至少 260 根连续复权日线 · 当前 ${bars} 根`)
    + item('SMA 10/50＋15 日低点', smaState, sma
      ? `SMA10 ${price(sma.sma10)} · SMA50 ${price(sma.sma50)} · 前 15 日低点 ${price(sma.low15)}`
      : '需要至少 50 根连续复权日线');
}

function researchTable(research, period) {
  const sample = research?.periods[period];
  if (!sample) return '<p class="rule-note">历史结果暂不可用</p>';
  const rows = ['mom','gap','blend','BH','SPY'].map(key => {
    const x = sample.rows[key];
    if (!x) return '<tr><th scope="row">中期动量</th><td colspan="4">2021-11-15 起运行</td></tr>';
    const tone = x.ret > 0 ? 'positive' : x.ret < 0 ? 'negative' : '';
    return `<tr><th scope="row">${x.label}</th><td class="${tone}">${pct(x.ret, 2, true)}</td><td>${pct(x.win)}</td><td>${pct(x.dd)}</td><td>${x.trades || '—'}</td></tr>`;
  }).join('');
  const note = period === 'long' ? '50/50 十年结果使用冻结模型回填训练前及训练期，作诊断对照。'
    : period === 'recent' ? '同口径关闭 Meta-L2 后，50/50 为 −4.40%，原规则为 −12.29%。' : '';
  return `<p class="rule-note">${date(sample.start)} 至 ${date(research.asOf)} · 自选 300 池 · 单边 12.5 bps</p>
    <div class="strategy-table-wrap"><table class="strategy-table">
      <thead><tr><th scope="col">规则</th><th scope="col">累计净收益</th><th scope="col">胜率</th><th scope="col">最大回撤</th><th scope="col">平仓</th></tr></thead>
      <tbody>${rows}</tbody></table></div>
    <p class="rule-note">${note}固定成分股样本存在幸存者偏差，长期区间用开盘价近似成交。</p>`;
}

export function createSwingPanel(onOpen) {
  const quick = document.querySelector('#strategy-quick');
  const rules = document.querySelector('#strategy-rules');
  const replay = document.querySelector('#strategy-replay');
  const retry = document.querySelector('#strategy-retry');
  const market = document.querySelector('#panel-market');
  const cache = new Map(), inflight = new Map();
  let symbol = '', research, researchTask, period = 'recent', failed = false;

  function visible() {
    return !document.hidden && !market.hidden && globalThis.ptNexusActive !== false;
  }

  function loadResearch() {
    if (!researchTask) researchTask = fetch(new URL('./data/strategy-research.json?v=20261123', import.meta.url))
      .then(r => r.ok ? r.json() : null)
      .then(value => { research = value; })
      .catch(() => { research = null; })
      .finally(paint);
  }

  async function readBars(ticker, force) {
    if (inflight.has(ticker)) return inflight.get(ticker);
    const saved = cache.get(ticker);
    const ttl = saved?.value ? 5 * 60_000 : 30_000;
    if (!force && saved && Date.now() - saved.at < ttl) return saved.value;
    const task = (async () => {
      try {
        const r = await fetch(`${API}/api/investment/rule-bars?symbol=${encodeURIComponent(ticker)}`,
          {signal:AbortSignal.timeout(20000)});
        const value = r.ok ? await r.json() : null;
        if (value?.symbol !== ticker || !Array.isArray(value.history)) throw Error('规则日线不可用');
        cache.set(ticker, {value, at:Date.now(), failed:false});
        return value;
      } catch {
        cache.set(ticker, {value:saved?.value ?? null, at:Date.now(), failed:true});
        return saved?.value ?? null;
      } finally {
        inflight.delete(ticker);
      }
    })();
    inflight.set(ticker, task);
    return task;
  }

  function paint() {
    if (!symbol) return;
    replay.innerHTML = researchTable(research, period);
    const series = cache.get(symbol)?.value;
    const reading = inflight.has(symbol);
    const data = evaluateRules({symbol, series, benchmark:cache.get('SPY')?.value});
    const supported = stockCode.test(symbol) && !cryptoCode.test(symbol) && data.status !== 'unsupported';
    const note = !supported ? '适用于 USD 股票与 ETF' : data.status === 'ready'
      ? `日线截至 ${date(data.asOf)} · ${data.n} 根连续日线`
      : reading ? '正在核对已收盘日线' : data.rawLatest
        ? `行情截至 ${date(data.rawLatest)} · 等待 ${date(data.asOf)} 完整收盘数据`
        : '已收盘日线暂不可用';
    retry.disabled = !supported || reading;
    if (!supported) {
      rules.innerHTML = quick.innerHTML = `<p class="rule-note">${note}</p>`;
      return;
    }
    const compact = `<p class="rule-note">${note}</p>`
      + momentumRow(research?.rank, symbol, data.momentum, data.asOf) + gapRow(data.gap, series?.instrumentType);
    quick.innerHTML = compact;
    rules.innerHTML = compact + blendRows(data.donchian, data.sma, data.n) +
      `<p class="rule-note">信号按已收盘日线核对。盘中移动止损需策略账本的入场价及持仓最高价。` +
      `<span>${data.atr ? `Wilder ATR14 ${price(data.atr)} · 3.5× ${price(3.5 * data.atr)} · 2.975× ${price(2.975 * data.atr)}。` : ''}</span></p>` +
      `<p class="rule-note">候选仍需核对交易窗口、资金与板块上限。${failed ? ' 本次行情更新失败，已保留可用的最近证据。' : ''}</p>`;
  }

  let checking = null;
  function refresh(force = false) {
    if (!symbol || !visible()) return;
    loadResearch();
    if (!stockCode.test(symbol) || cryptoCode.test(symbol)) return paint();
    const ticker = symbol;
    if (checking === ticker) return;
    checking = ticker;
    const task = Promise.all([readBars(ticker, force), readBars('SPY', force)]);
    paint();
    task.finally(() => {
      if (checking === ticker) checking = null;
      if (symbol !== ticker) return;
      failed = cache.get(ticker)?.failed || cache.get('SPY')?.failed;
      paint();
    });
  }

  document.querySelector('[data-open-strategy]').addEventListener('click', onOpen);
  retry.addEventListener('click', () => refresh(true));
  document.querySelectorAll('[data-strategy-period]').forEach(button => button.addEventListener('click', () => {
    period = button.dataset.strategyPeriod;
    document.querySelectorAll('[data-strategy-period]').forEach(node => node.setAttribute('aria-pressed', String(node === button)));
    paint();
  }));
  document.addEventListener('visibilitychange', () => refresh());
  let session = confirmedSession();
  setInterval(() => {
    const next = confirmedSession();
    if (next === session || !visible()) return;
    session = next;
    refresh(true);
  }, 60_000);
  return {
    select(ticker) {
      if (symbol !== ticker) {
        symbol = ticker;
        failed = false;
        paint();
      }
      refresh();
    },
    refresh
  };
}
