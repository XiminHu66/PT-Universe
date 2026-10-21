/* BOOX discovery is browser-local. Never send device addresses to cloud APIs. */
(function (root) {
  'use strict';
  const KEY = 'nexus_boox_local_v1';
  function address(host) {
    const match = /^(?:http:\/\/)?192\.168\.4\.(\d{1,3})(?::8085)?\/?$/.exec(String(host).trim());
    const n = Number(match?.[1]);
    if (!match || n < 1 || n > 254) throw Error('请输入 192.168.4.1–254 内的地址，端口固定为 8085。');
    return `http://192.168.4.${n}:8085`;
  }
  function hosts(last) {
    const all = Array.from({length:254}, (_, i) => address(`192.168.4.${i+1}`));
    try { const first = address(last); return [first, ...all.filter(x => x !== first)]; } catch { return all; }
  }
  async function probe(base, {signal, timeout = 1600, permissionReady, fetcher = root.fetch.bind(root)} = {}) {
    base = address(base);
    const controller = new AbortController(), abort = () => controller.abort();
    if (signal?.aborted) return null;
    signal?.addEventListener('abort', abort, {once:true});
    let timer, finished = false;
    // Permission-dialog time is not a device timeout. Start the deadline after Allow.
    if (permissionReady) Promise.resolve(permissionReady).then(() => { if (!finished) timer = setTimeout(abort, timeout); });
    else timer = setTimeout(abort, timeout);
    const options = {signal:controller.signal, credentials:'omit', targetAddressSpace:'local', cache:'no-store', redirect:'error', referrerPolicy:'no-referrer'};
    try {
      try {
        const response = await fetcher(base + '/api/device', {...options, mode:'cors'});
        if (response.ok) {
          const info = await response.json();
          if (info?.type === 'server' && typeof info.model === 'string' && info.model.trim()) {
            return {url:base, model:info.model.slice(0,100), verified:true};
          }
          return null; // A readable response from a different service is not BOOX.
        }
        return null;
      } catch (error) { if (controller.signal.aborted) return null; }
      // Fetch requires redirect:follow for no-cors; error/manual rejects before sending.
      // Opaque responses establish only a reachable candidate, never device identity.
      const response = await fetcher(base + '/', {...options, mode:'no-cors', redirect:'follow'});
      return response.type === 'opaque' ? {url:base, model:'待确认的互传页面', verified:false} : null;
    } catch { return null; }
    finally { finished = true; clearTimeout(timer); signal?.removeEventListener('abort', abort); }
  }
  async function scan({last, signal, onProgress = () => {}, onFound = () => {}, onPhase = () => {}, probeFn = probe,
    concurrency = 32, permission = false, permissionReady, fastTimeout = 450, slowTimeout = 1600} = {}) {
    const controller = new AbortController(), abort = () => controller.abort();
    signal?.addEventListener('abort', abort, {once:true});
    if (signal?.aborted) controller.abort();
    const found = [], visited = new Set(); let attempts = 0;
    const accept = hit => {
      if (!hit || controller.signal.aborted) return;
      found.push(hit); onFound(hit);
      // A responsive but CORS-opaque native page is useful immediately, with its unverified label.
      controller.abort();
    };
    const check = async (url, timeout, ready) => {
      const hit = await probeFn(url, {signal:controller.signal, timeout, permissionReady:ready});
      if (controller.signal.aborted) return;
      attempts++; visited.add(url); accept(hit); onProgress(visited.size, 254, attempts);
    };
    try {
      const queue = hosts(last); let saved;
      try { saved = address(last); } catch {}
      // Try the last successful address alone: a normal reconnect never scans the subnet.
      if (saved || permission) {
        const first = queue.shift(); onPhase(saved ? 'reconnect' : 'permission');
        await check(first, permission && !permissionReady ? 8000 : 650, permissionReady);
        // Keep that host in the slower retry pass if the short attempt missed it.
        queue.push(first);
      }
      for (const [phase, timeout] of [['fast',fastTimeout], ['retry',slowTimeout]]) {
        if (controller.signal.aborted) break;
        onPhase(phase); let index = 0;
        await Promise.all(Array.from({length:Math.min(32, Math.max(1, Math.floor(concurrency) || 32))}, async () => {
          while (index < queue.length && !controller.signal.aborted) await check(queue[index++], timeout, permissionReady);
        }));
      }
      return found;
    } finally { controller.abort(); signal?.removeEventListener('abort', abort); }
  }
  const api = {address, hosts, probe, scan};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (!root.document) return;
  const $ = id => document.getElementById(id);
  const panel = $('booxPanel'); if (!panel) return;
  // A GitHub Pages HTTPS site must not embed the BOOX firmware's HTTP page.
  // Keep local-network discovery (targetAddressSpace:'local') but navigate to
  // the native transfer UI only as a deliberate top-level, separate-tab action.
  $('booxFrameWrap')?.remove();
  $('booxScan').textContent = '扫描 BOOX';
  $('booxConnect').textContent = '打开此地址 ↗';
  $('booxNative').setAttribute('referrerpolicy', 'no-referrer');
  const entryText = $('booxEntry')?.querySelector('p');
  if (entryText) entryText.textContent = '在局域网寻找 BOOX，找到后在新标签页打开原生互传；不向网站上传书籍。';
  const headlineText = panel.querySelector('.boox-head p');
  if (headlineText) headlineText.textContent = '在 BOOX 上开启原生互传，并连接同一 Wi-Fi。找到设备后请点击“打开 BOOX 互传”，在独立标签页传书。';
  const helpText = panel.querySelector('.boox-manual p');
  if (helpText) helpText.textContent = 'BOOX 原生互传使用局域网 HTTP，不能安全地嵌入本站的 HTTPS 页面。此处只负责查找和记住地址；点击链接将独立打开 BOOX。已知 IP 可直接打开，无须扫描。';
  let controller = null, selected = null, initialized = false, busy = false, generation = 0;
  let prefs = {};
  try { const saved = JSON.parse(localStorage.getItem(KEY) || '{}'); if (saved && typeof saved === 'object' && !Array.isArray(saved)) prefs = saved; } catch {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch {} };
  const status = text => { $('booxStatus').textContent = text; };
  const setBusy = value => {
    busy = value; $('booxScan').disabled = value; $('booxConnect').disabled = value;
    $('booxStop').hidden = !value; $('booxHost').disabled = value;
  };
  function showLastAddress() {
    try {
      const last = address(prefs.last); $('booxHost').value = new URL(last).hostname;
      $('booxNative').href = last + '/'; $('booxNative').textContent = '上次地址 ↗'; $('booxNative').hidden = false;
    } catch { $('booxNative').hidden = true; }
  }
  showLastAddress();
  $('booxAuto').checked = !!prefs.auto;
  function connect(hit) {
    selected = hit; prefs.last = address(hit.url); save();
    $('booxHost').value = new URL(hit.url).hostname;
    $('booxNative').href = hit.url + '/'; $('booxNative').textContent = '独立打开 ↗'; $('booxNative').hidden = false;
    $('booxNative').textContent = '打开 BOOX 互传 ↗';
    status(hit.manual
      ? '地址已保存。已尝试在新标签页打开；若弹窗被拦截，请点击“打开 BOOX 互传”。'
      : hit.verified
        ? `发现 ${hit.model} · ${new URL(hit.url).hostname}。请点击“打开 BOOX 互传”。`
        : '该地址有响应，但浏览器无法验证其设备身份。确认地址属于 BOOX 后，再点击“打开 BOOX 互传”。');
  }
  function openManual() {
    let url;
    try { url = address($('booxHost').value); } catch (error) { status(error.message); return; }
    // Direct navigation works even where HTTPS-to-LAN probing is browser-blocked.
    if (controller) controller.abort();
    connect({url, manual:true, verified:false});
    // Synchronous in the user's click/Enter gesture to avoid popup blockers.
    $('booxNative').click();
  }
  function showHit(hit) {
    const button = document.createElement('button'); button.type = 'button';
    button.textContent = `${hit.verified ? hit.model : '候选页面（未验证）'} · ${new URL(hit.url).hostname}`;
    button.onclick = () => connect(hit); $('booxResults').append(button);
    if (!selected) connect(hit);
  }
  let networkPermission;
  async function permissionState() {
    for (const name of ['local-network', 'local-network-access']) {
      try { networkPermission = await navigator.permissions.query({name}); return networkPermission.state; } catch {}
    }
    return 'unknown';
  }
  async function start(automatic = false) {
    if (busy) return;
    const ticket = ++generation; setBusy(true);
    const state = await permissionState();
    if (ticket !== generation) { setBusy(false); return; }
    if (automatic && state !== 'granted') { setBusy(false); status('点击“扫描并连接”以允许浏览器访问 BOOX 所在的本地网络。'); return; }
    if (state === 'denied') { setBusy(false); status('本地网络权限已被拒绝。请在地址栏的网站设置中允许“本地网络访问”，然后重试。'); return; }
    controller = new AbortController(); const signal = controller.signal;
    selected = null; showLastAddress();
    $('booxResults').replaceChildren(); $('booxProgress').value = 0; $('booxCount').textContent = '0 / 254'; setBusy(true);
    status('请保持 BOOX 互传开启并连接同一 Wi-Fi；若浏览器询问本地网络权限，请选择允许。');
    try {
      let permissionReady, removePermissionListener = () => {};
      if (state === 'prompt' && networkPermission?.addEventListener) {
        permissionReady = new Promise(resolve => {
          const changed = () => {
            if (networkPermission.state !== 'prompt' || signal.aborted) {
              if (networkPermission.state === 'denied') controller?.abort();
              resolve(); removePermissionListener();
            }
          };
          removePermissionListener = () => { networkPermission.removeEventListener('change', changed); signal.removeEventListener('abort', changed); };
          networkPermission.addEventListener('change', changed); signal.addEventListener('abort', changed, {once:true}); changed();
        });
      }
      try {
        const hits = await scan({last:prefs.last, signal, permission:state !== 'granted', permissionReady, onFound:showHit,
          onPhase:phase => { status(phase === 'reconnect' ? '正在快速检查上次的 BOOX 地址…' : phase === 'permission' ? '请允许浏览器访问本地网络，授权后开始快速扫描。' : phase === 'retry' ? '快速扫描未发现设备，正在重试响应较慢的地址…' : '正在快速寻找 BOOX，找到后提供打开链接…'); },
          onProgress:(done,total) => { $('booxProgress').value = done; $('booxCount').textContent = `${done} / ${total}`; }});
        if (!signal.aborted && !selected) status(hits.length ? '找到候选地址，请确认它属于 BOOX 再打开。' : '未找到设备。请确认 BOOX 互传开启且处于同一 Wi-Fi；也可直接输入已知 IP 打开，无需扫描。');
        else if (!signal.aborted && selected) {
          $('booxCount').textContent = '已发现 · 已停止其余扫描';
          if (selected.verified) status(`发现 ${selected.model}，已停止其余扫描。点击“打开 BOOX 互传”继续。`);
        }
      } finally { removePermissionListener(); }
    } catch { if (!signal.aborted) status('扫描未完成，请重试或使用已知地址。'); }
    finally { if (signal.aborted) status('已停止扫描。'); controller = null; setBusy(false); }
  }
  function open(automatic = false) {
    panel.hidden = false; panel.scrollIntoView({behavior:'smooth', block:'start'});
    if (!initialized) { initialized = true; start(automatic); }
  }
  $('booxEntry').onclick = () => open();
  $('booxScan').onclick = () => start(); $('booxConnect').onclick = openManual;
  $('booxStop').onclick = () => controller?.abort();
  $('booxHost').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); openManual(); } };
  $('booxAuto').onchange = () => { prefs.auto = $('booxAuto').checked; save(); };
  $('booxClose').onclick = () => { ++generation; controller?.abort(); panel.hidden = true; selected = null; initialized = false; $('booxEntry').focus(); };
  addEventListener('pagehide', () => controller?.abort());
  addEventListener('nexus-view-change', event => {
    if (event.detail?.view === 'tools' && prefs.auto && !initialized) open(true);
    else if (event.detail?.view !== 'tools') { ++generation; initialized = false; controller?.abort(); }
  });
  if (new URL(location.href).searchParams.get('view') === 'tools' && prefs.auto) open(true);
})(globalThis);

