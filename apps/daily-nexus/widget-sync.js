(() => {
  const api = 'https://pt-universe-api.summer07-nanjolno.workers.dev';
  const key = 'deskboard.widget-sync.v1';
  const stockKey = 'deskboard_stocks_v3';
  const modal = document.getElementById('widgetSyncDialog');
  if (!modal) return;
  const open = document.getElementById('widgetSyncOpen');
  const setup = document.getElementById('widgetSyncSetup');
  const copy = document.getElementById('widgetSyncCopy');
  const manual = document.getElementById('widgetSyncPush');
  const code = document.getElementById('widgetSyncCode');
  const status = document.getElementById('widgetSyncStatus');
  const encoder = new TextEncoder();
  let timer, busy = false, retry = false, error = '';
  let showCode = false;

  const base64 = bytes => btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
  function profile() {
    try { return JSON.parse(localStorage.getItem(key)); }
    catch (_) { return null; }
  }
  function snapshot() {
    const saved = localStorage.getItem(stockKey);
    const list = saved == null ? stocks : JSON.parse(saved);
    return JSON.stringify({ version: 1, stocks: list.slice(0, 150).map(({ symbol, label, buyPrice, sellPrice }) =>
      ({ symbol, label, buyPrice: marketPrice(buyPrice), sellPrice: marketPrice(sellPrice) })) });
  }
  async function request(path, method, body, token, keepalive=false) {
    const headers = { 'content-type': 'application/json' };
    if (token) headers.authorization = 'Bearer ' + token;
    const reply = await fetch(api + path, {
      method, headers, body: JSON.stringify(body), credentials: 'omit', redirect: 'error',
      keepalive, cache: 'no-store', signal: AbortSignal.timeout(10000),
    });
    if (!reply.ok) throw Error('同步服务 HTTP ' + reply.status);
    return reply.json();
  }
  function paint() {
    const p = profile();
    setup.hidden = !!p;
    copy.hidden = !p || !p.revision;
    manual.hidden = !p;
    code.hidden = !showCode || !p?.revision;
    code.value = code.hidden ? '' : [p.id, p.token, p.secret].join('.');
    setup.disabled = copy.disabled = manual.disabled = busy;
    status.textContent = busy ? '正在同步…' : error || (p?.updatedAt
      ? '最近同步 ' + new Date(p.updatedAt).toLocaleString('zh-CN')
      : '尚未同步');
  }
  async function publish(force = false) {
    if (busy) { retry = true; return; }
    if (!profile()) return;
    busy = true;
    error = '';
    paint();
    const write = async () => {
      const p = profile();
      if (!p) return;
      const plain = encoder.encode(snapshot());
      const digest = base64(new Uint8Array(await crypto.subtle.digest('SHA-256', plain)));
      if (!force && p.digest === digest) return;
      const raw = Uint8Array.from(atob(p.secret.replaceAll('-', '+').replaceAll('_', '/') + '='), x => x.charCodeAt(0));
      const encryptionKey = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt']);
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const payload = new Uint8Array(await crypto.subtle.encrypt({
        name:'AES-GCM', iv, additionalData:encoder.encode(p.id + '/watchlist-widget-v1'),
      }, encryptionKey, plain));
      const blob = JSON.stringify({ v:1, iv:base64(iv), body:base64(payload) });
      const result = await request('/api/sync/' + p.id + '/watchlist-widget-v1', 'PUT', { ciphertext:blob }, p.token, true);
      localStorage.setItem(key, JSON.stringify({ ...p, digest, revision:result.revision, updatedAt:result.updatedAt }));
    };
    try {
      if (navigator.locks) await navigator.locks.request('deskboard-widget-watchlist', write);
      else await write();
    } catch (_) {
      error = '同步失败，已保存在网页。点「立即同步」可重试。';
    } finally {
      busy = false;
      paint();
      if (retry) { retry = false; changed(); }
    }
  }
  function changed() {
    clearTimeout(timer);
    if (profile()) timer = setTimeout(() => { void publish(); }, 500);
  }
  open.addEventListener('click', () => {
    paint();
    modal.showModal();
    if (profile()) changed();
  });
  modal.addEventListener('close', () => { showCode = false; paint(); });
  setup.addEventListener('click', async () => {
    if (busy || profile()) return;
    busy = true;
    error = '';
    paint();
    try {
      const p = { id:crypto.randomUUID(), token:base64(crypto.getRandomValues(new Uint8Array(32))),
        secret:base64(crypto.getRandomValues(new Uint8Array(32))) };
      await request('/api/sync/register', 'POST', { id:p.id, token:p.token });
      localStorage.setItem(key, JSON.stringify(p));
    } catch (_) {
      error = '暂时无法启用同步，请稍后重试。';
    } finally {
      busy = false;
      paint();
    }
    if (profile()) await publish();
  });
  copy.addEventListener('click', async () => {
    showCode = true;
    paint();
    try {
      await navigator.clipboard.writeText(code.value);
      status.textContent = '已复制配对码。请在 PT Widgets 中连接。';
    } catch (_) {
      code.focus();
      code.select();
    }
  });
  manual.addEventListener('click', () => { void publish(true); });
  window.addEventListener('online', changed);
  window.addEventListener('storage', event => { if (event.key === stockKey) changed(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') changed(); });
  window.PTWatchlistWidget = { changed };
  changed();
})();
