import {esc} from './model.mjs?v=3';
import {date} from './view.mjs?v=5';
import {RESOURCE_API} from './auth.mjs?v=3';

const GH = 'https://github.com/XiminHu66/';
const API = 'https://api.github.com/repos/XiminHu66/PT-Universe/commits?sha=main&per_page=1';
const KEY = 'pt.releases.acceptance.v1';
const projects = [
  {id: 'nexus', name: 'Daily Nexus', repo: 'PT-Universe'},
  {id: 'anime', name: 'Anime1 Player', repo: 'anime-player'},
  {id: 'video', name: 'Video Streamer', repo: 'video-streamer'}
];
const conclusions = {
  success: '流程通过', failure: '流程失败', in_progress: '运行中', queued: '排队中',
  cancelled: '已取消', skipped: '已跳过', timed_out: '已超时', requested: '待运行'
};
const states = {pending: '待验收', passed: '已通过', issue: '发现问题'};
const sha = value => typeof value === 'string' && /^[a-f0-9]{40}$/i.test(value) ? value : null;
const stamp = value => value && Number.isFinite(Date.parse(value)) ? date(value) : '';
function ghLink(value, repo, label) {
  const prefix = GH + repo + '/';
  if (typeof value !== 'string' || !value.startsWith(prefix)) return '';
  return `<a href="${esc(value)}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`;
}
function readMarks() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; }
  catch { return {}; }
}
function textAt(value) { return stamp(value) ? `<small>${esc(stamp(value))}</small>` : ''; }
const headLink = (head, repo) => sha(head?.sha)
  ? ghLink(GH + repo + '/commit/' + head.sha, head.sha.slice(0, 8)) + textAt(head.at) : '未读取主分支';

export function createReleaseView({getJSON, active, notify, workspace, notice}) {
  let live = null, publicHead = null, packet = null, controller = null;
  let loadAt = 0, hadSession = false, requestSession = false, retry = false, message = '';
  let marks = readMarks();

  function versions(project, item) {
    if (project.id === 'nexus' && live) {
      return {identity: 'pages:' + live, label: live.slice(0, 8), url: '../daily-nexus/', kind: 'Pages 当前在线'};
    }
    if (project.id === 'nexus') return null;
    const release = item?.publication;
    if (!release || typeof release.identity !== 'string' || release.identity.length > 120) return null;
    return {...release, kind: 'GitHub Release'};
  }

  function render(connected) {
    if (!active()) return;
    const items = connected && Array.isArray(packet?.items) ? packet.items : [];
    const rows = projects.map(project => {
      const item = items.find(row => row.id === project.id);
      const version = versions(project, item);
      const mark = version ? marks[project.id]?.[version.identity] : null;
      const isPublic = project.id === 'nexus';
      const head = item?.head || (isPublic ? publicHead : null);
      const run = item?.run;
      const versionLink = isPublic
        ? (version ? `<a href="../daily-nexus/" target="_blank" rel="noopener">打开线上页面 ↗</a>` : '')
        : ghLink(version?.url || GH + project.repo + '/releases/latest', project.repo, '打开 Releases');
      const status = mark && Object.hasOwn(states, mark.status) ? mark.status : 'pending';
      return `<article class="panel release-card" data-project="${project.id}">
        <header><h2>${project.name}</h2><span class="release-chip" data-state="${version ? status : 'unknown'}">${version ? states[status] : '版本待核对'}</span></header>
        <dl>
          <div><dt>最新主分支提交</dt><dd>${headLink(head, project.repo)}</dd></div>
          <div><dt>当前发布</dt><dd>${version
            ? `<strong>${esc(version.label)}</strong><small>${esc(version.kind)}</small>${textAt(version.at)}`
            : isPublic ? '未读到 Pages 版本清单' : item?.publishRun ? '读到发布步骤，Release 待核对' : connected ? '未读取 Release' : '连接后读取'}</dd></div>
          <div><dt>当前产物</dt><dd>${isPublic ? versionLink || '未知' : `${version?.asset ? `<strong>${esc(version.asset)}</strong><small>${versionLink}</small>` : `未知 <small>${versionLink}</small>`}`}</dd></div>
          <div><dt>最近发布工作流</dt><dd>${run ? ghLink(run.url, project.repo, (conclusions[run.state] || '查看工作流') + (sha(run.sha) ? ' · ' + run.sha.slice(0, 8) : '')) + textAt(run.at) : '未读取'}
            ${item?.publishRun ? `<small>${ghLink(item.publishRun.url, project.repo, '最近成功的发布步骤')}${textAt(item.publishRun.at)}</small>` : ''}</dd></div>
        </dl>
        ${isPublic && version && head && head.sha !== live ? '<p class="muted">在线版本与当前 main 不同。main 上的变更可能不触发 Pages。</p>' : ''}
        ${version ? `<label class="release-select">人工验收 <select aria-label="${project.name} 人工验收" data-accept="${project.id}">
          ${Object.entries(states).map(([key, label]) => `<option value="${key}"${key === status ? ' selected' : ''}>${label}</option>`).join('')}</select></label>
          ${mark ? `<p class="muted release-mark">标记于 ${esc(stamp(mark.at))}</p>` : ''}` : ''}
      </article>`;
    }).join('');
    workspace.innerHTML = `<div class="section-head"><div><h2>当前版本与人工验收</h2><p>只在打开或手动刷新时取数。每个发布版本独立标记，记录保存在当前浏览器。</p></div></div>
      <div class="release-grid">${rows}</div>
      ${connected && items.some(item => item.id !== 'nexus' && item.state !== 'ok') ? '<p class="muted">私有 Release 或主分支读取不完整。可在授权说明中核对现有 Token 的 Contents: Read-only 和仓库范围。</p>' : ''}`;
    for (const select of workspace.querySelectorAll('[data-accept]')) select.onchange = () => {
      const id = select.dataset.accept;
      const project = projects.find(row => row.id === id);
      const version = versions(project, items.find(row => row.id === id));
      if (!version || !Object.hasOwn(states, select.value)) return;
      const mark = {status: select.value, at: new Date().toISOString()};
      const prior = {...readMarks()};
      const records = Object.entries(prior[id] || {}).filter(([key]) => key !== version.identity);
      prior[id] = Object.fromEntries([[version.identity, mark], ...records.slice(0, 19)]);
      try { localStorage.setItem(KEY, JSON.stringify(prior)); }
      catch { notice.textContent = '浏览器存储不可用，验收记录未保存。'; return; }
      marks = prior;
      const card = select.closest('.release-card');
      const chip = card.querySelector('.release-chip');
      chip.dataset.state = mark.status;
      chip.textContent = states[mark.status];
      let markLabel = card.querySelector('.release-mark');
      if (!markLabel) {
        markLabel = document.createElement('p');
        markLabel.className = 'muted release-mark';
        card.append(markLabel);
      }
      markLabel.textContent = '标记于 ' + stamp(mark.at);
    };
    notice.textContent = message || '等待核对发布记录。';
  }

  async function refresh(force, connected) {
    if (!active()) return;
    if (controller) {
      if (requestSession !== connected || controller.signal.aborted) retry = true;
      return;
    }
    if (!force && hadSession === connected && Date.now() - loadAt < 5 * 60000) return;
    const current = new AbortController();
    controller = current;
    requestSession = connected;
    message = '正在核对发布记录…';
    render(connected);
    notify();
    const read = url => getJSON(url, 22000, current.signal);
    try {
      const [manifest, detail] = await Promise.allSettled([
        read('../../deployment.json'),
        read(connected ? RESOURCE_API + '/releases' : API)
      ]);
      if (!current.signal.aborted && active()) {
        live = sha(manifest.value?.sourceCommit);
        if (connected) {
          packet = Array.isArray(detail.value?.items) ? detail.value : null;
          if (packet?.status?.state === 'unavailable') message = 'GitHub 记录暂不可读。Pages 版本独立核对。';
          else if (packet) message = 'GitHub 采样 · ' + (stamp(packet.status?.checkedAt) || '时间未知') + (packet.cacheHit ? ' · 缓存' : '');
          else message = '发布后台暂不可读。Pages 版本独立核对。';
        } else {
          packet = null;
          const commit = detail.value?.[0];
          publicHead = sha(commit?.sha) ? {sha: commit.sha, at: commit.commit?.committer?.date} : null;
          message = '公开 Pages 版本可核对。连接资源后台后读取私有播放器。';
        }
        if (!live) message += ' Pages 清单暂未读取。';
        loadAt = Date.now();
        hadSession = connected;
      }
    } finally {
      controller = null;
      if (active()) {
        render(connected);
        notify();
      }
    }
    const reload = retry;
    retry = false;
    return reload;
  }

  return {
    render, refresh,
    cancel() { controller?.abort(); },
    get busy() { return !!controller; }
  };
}
