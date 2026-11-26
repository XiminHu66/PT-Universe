import { esc } from './model.mjs?v=3';

const labels = {
  'reading-desk': 'Reading Desk', 'investment-desk': '投资工作台', 'rss-dashboard': 'RSS Orbit',
  'tsugi-checker': 'Tsugi', '3c-scout': '3C Scout', 'deal-radar': 'Deal Radar',
};
const formatDate = new Intl.DateTimeFormat('zh-CN', {timeZone:'America/Los_Angeles', dateStyle:'short', timeStyle:'short'});
const number = new Intl.NumberFormat('zh-CN', {maximumFractionDigits:1});
const stamp = value => Number.isFinite(value) ? formatDate.format(value) : '—';
const count = value => Number.isFinite(value) ? number.format(value) : '—';
const seconds = value => Number.isFinite(value) ? number.format(value / 1000)+' 秒' : '—';
const memory = value => Number.isFinite(value) ? number.format(value / 1024**2)+' MiB' : '—';
const sinceDays = (start, end) => Math.max(0, Math.floor((Date.parse(end)-Date.parse(start))/86400000)+1);
const state = {success:'成功',partial:'部分失败',failed:'失败'};

export function activityHTML(packet, period = 'month') {
  const {views,dealRadar:ledger,dealRadarState,viewsStale} = packet;
  const days = period === 'week' ? 7 : 30;
  const measuredDays = ledger?.since && ledger.observedAt >= ledger.since
    ? Math.floor((ledger.observedAt-ledger.since)/86400000) : 0;
  const sums = ledger?.[period];
  const runsObserved = !!ledger?.since;
  const executions = trigger => runsObserved && (sums?.[trigger] || measuredDays >= days) ? (sums?.[trigger]?.executions ?? 0) : null;
  const visits = (tool, selectedDays) => {
    if (!views.ownedBrowsers || !tool.first) return '待采样';
    const total = selectedDays === 30 ? tool.monthDays : tool.weeksDays;
    const covered = sinceDays(tool.first,views.day);
    if (covered < selectedDays) return total ? `${count(total)} 天 · 采样第 ${covered} 天` : `采样第 ${covered} 天`;
    return `${count(total)} 天`;
  };
  const suggestion = tool => {
    if (tool.id !== 'deal-radar') return '执行记录待接入';
    if (viewsStale || dealRadarState==='unavailable') return '等待数据恢复';
    if (!tool.first || !views.ownedBrowsers || sinceDays(tool.first,views.day) < 30 || measuredDays < 30) return '积累 30 天样本';
    if (tool.monthDays <= 1 && (ledger.month.manual?.executions ?? 0) === 0 && (ledger.month.schedule?.executions ?? 0) > 0) {
      return '可考虑改手动 · 核对 VPS 直达和推送';
    }
    return '已有使用或无持续调度开销';
  };

  return `<section class="panel"><div class="section-head"><div><h2>任务资源账本</h2><p>VPS · Deal Radar · 按实际执行批次采集${ledger&&dealRadarState==='unavailable'?' · 正在显示上次记录':''}</p></div></div>
    ${!ledger ? `<p class="muted" role="status">${dealRadarState==='not_connected'?'VPS 尚未返回账本数据。':'暂时无法读取 VPS 账本。'}</p>` : `
    <div class="actions" aria-label="账本统计时段"><button data-activity-period="week" aria-pressed="${period==='week'}">近 7 天</button><button data-activity-period="month" aria-pressed="${period==='month'}">近 30 天</button></div>
    <p class="muted">美西时间 · 开始采样 ${stamp(ledger.since)} · 读取 ${stamp(ledger.observedAt)}${measuredDays<days?' · 当前窗口尚未采满':''}</p>
    <div class="table-wrap"><table><thead><tr><th>触发</th><th>批次</th><th>总耗时</th><th>进程 CPU 时间</th><th>采样内存峰值</th><th>应用请求数</th></tr></thead>
    <tbody>${[['manual','手动'],['schedule','自动']].map(([key,title]) => `<tr><th>${title}</th><td>${count(executions(key))}</td><td>${seconds(sums?.[key]?.durationMs)}</td><td>${seconds(sums?.[key]?.cpuMs)}</td><td>${memory(sums?.[key]?.peakRssBytes)}</td><td>${count(sums?.[key]?.requests)}</td></tr>`).join('')}</tbody></table></div>
    <details data-activity-detail><summary>最近批次（最多 30 条）</summary>
      <div class="table-wrap"><table><thead><tr><th>开始 · 批次</th><th>状态</th><th>耗时</th><th>进程 CPU</th><th>采样内存峰值</th><th>请求数</th></tr></thead><tbody>
      ${ledger.recent.map(row => `<tr><td>${stamp(row.startedAt)}<small>${row.roundId==null?'记录 '+row.id:'批次 '+row.roundId} · ${row.trigger==='manual'?'手动':'自动'}</small></td><td>${state[row.status]} · ${count(row.okSources)}/${count(row.totalSources)} 来源</td><td>${seconds(row.durationMs)}</td><td>${seconds(row.cpuMs)}</td><td>${memory(row.peakRssBytes)}</td><td>${count(row.requests)}</td></tr>`).join('') || '<tr><td colspan="6">等待首次实际刷新。</td></tr>'}
      </tbody></table></div>
    </details>
    <p class="muted">CPU 和 RSS 是刷新期间的整个进程值，可能包含同期页面请求。内存每秒采样，启动和结束时各采一次。请求数按应用调用统计，重定向由运行时处理。</p>`}
    </section>
    <section class="panel"><div class="section-head"><div><h2>工具使用量与停用候选</h2><p>自用访问按工具及美西日期去重，任务执行采用服务器记录。</p></div><button data-activity-overview>标记自用浏览器</button></div>
    ${!views ? '<p role="status">暂时无法读取访问量。</p>' : `
    <p class="muted">${viewsStale?'当前显示上次访问数据。':''}已标记自用浏览器 ${count(views.ownedBrowsers)} 个。这里记录 PT Universe 页面访问。VPS 直达和推送阅读需另行核对。</p>
    <div class="table-wrap"><table><thead><tr><th>工具</th><th>7 天访问</th><th>30 天访问</th><th>最后观测到自用</th><th>手动／自动（${days} 天）</th><th>建议</th></tr></thead>
    <tbody>${views.tools.map(tool=>`<tr><th>${esc(labels[tool.id] || tool.id)}</th><td>${visits(tool,7)}</td><td>${visits(tool,30)}</td><td>${stamp(tool.lastVisit)}</td><td>${tool.id==='deal-radar'?`${count(executions('manual'))} / ${count(executions('schedule'))}`:'—'}</td><td>${esc(suggestion(tool))}</td></tr>`).join('')}</tbody></table></div>
    <p class="muted">候选规则采用满 30 天、自用访问最多 1 天、手动执行 0 次且有自动运行记录。候选只供人工核对调度。</p>`}
    </section>`;
}

export function createActivityView(getJSON, url, workspace, showOverview) {
  let packet = null, error = '', period = 'month', details = false, pending = null, fetchedAt = 0;
  function render(connected) {
    workspace.innerHTML = !connected ? '<section class="panel"><p>连接资源后台后查看私有任务和自用访问统计。</p></section>'
      : (error ? '<p class="muted" role="status">本次读取失败，已保留页面上次数据。</p>' : '') +
        (packet ? activityHTML(packet,period) : '<section class="panel"><p role="status">'+(error?'暂时没有可显示的数据。':'正在读取使用记录和 VPS 任务账本…')+'</p></section>');
    workspace.querySelectorAll('[data-activity-period]').forEach(button => button.onclick = () => {
      period = button.dataset.activityPeriod;
      render(connected);
    });
    workspace.querySelector('[data-activity-overview]')?.addEventListener('click', showOverview);
    const detail = workspace.querySelector('[data-activity-detail]');
    if (detail) { detail.open = details; detail.ontoggle = () => { details = detail.open; }; }
  }
  async function refresh(force) {
    if (pending || (!force && Date.now()-fetchedAt<300000)) return;
    const controller = new AbortController();
    pending = controller;
    error = '';
    try {
      const next = await getJSON(url, 15000, controller.signal);
      if (!controller.signal.aborted) {
        packet = {...next,views:next.views ?? packet?.views,viewsStale:!next.views && !!packet?.views,
          dealRadar:next.dealRadarState==='unavailable' ? packet?.dealRadar : next.dealRadar};
        fetchedAt = Date.now();
      }
    } catch {
      if (!controller.signal.aborted) error = 'unavailable';
    } finally {
      if (pending===controller) pending=null;
    }
  }
  return {render,refresh,cancel(){pending?.abort();pending=null;},get busy(){return !!pending;}};
}
