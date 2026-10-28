/* BOOX discovery is browser-local. Never send device addresses to cloud APIs. */
(function (root) {
  'use strict';
  const KEY = 'nexus_boox_local_v1';
  function address(host) {
    const match = /^(?:http:\/\/)?(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?::8085)?\/?$/.exec(String(host).trim());
    const octets = match?.slice(1).map(Number);
    if (!octets || octets.some(n => n > 255) ||
      !(octets[0] === 192 && octets[1] === 168 || octets[0] === 10 || octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)) {
      throw Error('请输入 BOOX 互传显示的局域网 IP 或完整 HTTP 地址（端口 8085）。');
    }
    return `http://${octets.join('.')}:8085`;
  }
  function hosts(last) {
    let saved;
    try { saved = address(last); } catch {}
    // The home network can allocate 192.168.4.x through 192.168.7.x.
    // Scan the remembered /24 first; retain the original /24 for a new browser.
    const home = ['192.168.4', '192.168.5', '192.168.6', '192.168.7'];
    const prefix = saved ? new URL(saved).hostname.split('.').slice(0,3).join('.') : home[0];
    const prefixes = home.includes(prefix) ? [prefix, ...home.filter(x => x !== prefix)] : [prefix];
    const all = prefixes.flatMap(p => Array.from({length:256}, (_, i) => `http://${p}.${i}:8085`))
      .filter(url => !url.includes('192.168.4.0:') && !url.includes('192.168.7.255:'));
    return saved ? [saved, ...all.filter(x => x !== saved)] : all;
  }
  async function probe(base, {signal, timeout = 4000, permissionReady, fetcher = root.fetch.bind(root)} = {}) {
    base = address(base);
    if (signal?.aborted) return null;
    const controller = new AbortController(), abort = () => controller.abort();
    signal?.addEventListener('abort', abort, {once:true});
    let timer, finished = false, pageReached = false;
    // Do not spend the device deadline while the permission dialog is open.
    // Also bound a dismissed/unsupported permission dialog so it cannot hang forever.
    const deadline = setTimeout(abort, permissionReady ? 60000 : timeout);
    if (permissionReady) Promise.resolve(permissionReady).then(() => { if (!finished && !pageReached) timer = setTimeout(abort, timeout); });
    const options = {signal:controller.signal, credentials:'omit', targetAddressSpace:'local', cache:'no-store', referrerPolicy:'no-referrer'};
    try {
      // Probe the native page FIRST. Some firmware has no /api/device, and a
      // stalled CORS request must not consume the entire page-discovery budget.
      const page = await fetcher(base + '/', {...options, mode:'no-cors', redirect:'follow'});
      if (page.type !== 'opaque' && !page.ok) return null;
      pageReached = true;
      const candidate = {url:base, model:'待确认的互传页面', verified:false};
      // Identity is best effort, with its own short deadline. CORS failure,
      // HTML, 404 or different firmware metadata must not hide a reachable page.
      clearTimeout(timer); clearTimeout(deadline);
      timer = setTimeout(abort, Math.min(timeout, 1200));
      try {
        const response = await fetcher(base + '/api/device', {...options, mode:'cors', redirect:'error'});
        if (response.ok) {
          const info = await response.json();
          if (info?.type === 'server' && typeof info.model === 'string' && info.model.trim()) {
            return {url:base, model:info.model.slice(0,100), verified:true};
          }
          if (info?.type && info.type !== 'server') return null;
        }
      } catch {}
      return signal?.aborted ? null : candidate;
    } catch { return null; }
    finally { finished = true; clearTimeout(timer); clearTimeout(deadline); controller.abort(); signal?.removeEventListener('abort', abort); }
  }
  async function scan({last, signal, onProgress = () => {}, onFound = () => {}, onPhase = () => {}, probeFn = probe,
    concurrency = 24, permission = false, permissionReady, fastTimeout = 1200, slowTimeout = 4000} = {}) {
    const controller = new AbortController(), abort = () => controller.abort();
    signal?.addEventListener('abort', abort, {once:true});
    if (signal?.aborted) controller.abort();
    const queue = hosts(last), total = queue.length;
    let permissionSettled = !permissionReady;
    if (permissionReady) Promise.resolve(permissionReady).then(() => { permissionSettled = true; });
    const found = [], visited = new Set(); let attempts = 0;
    const accept = hit => {
      if (!hit || controller.signal.aborted) return;
      found.push(hit); onFound(hit); controller.abort();
    };
    const check = async (url, timeout, ready) => {
      const hit = await probeFn(url, {signal:controller.signal, timeout, permissionReady:ready});
      if (controller.signal.aborted) return;
      attempts++; visited.add(url); accept(hit); onProgress(visited.size, total, attempts);
    };
    try {
      let saved;
      try { saved = address(last); } catch {}
      if (saved || permission) {
        const first = queue.shift(); onPhase(saved ? 'reconnect' : 'permission');
        await check(first, permission && !permissionReady ? 15000 : 2500, permissionReady);
        // A dismissed permission prompt must not launch thousands of blocked requests.
        if (!permissionSettled && !found.length) return found;
        queue.unshift(first);
      }
      for (const [phase, timeout] of [['fast',fastTimeout], ['retry',slowTimeout]]) {
        if (controller.signal.aborted) break;
        onPhase(phase); let index = 0;
        await Promise.all(Array.from({length:Math.min(24, Math.max(1, Math.floor(concurrency) || 24))}, async () => {
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
  if (headlineText) headlineText.textContent = '开启 BOOX 互传并保持亮屏，电脑与 BOOX 连接同一局域网。默认扫描 192.168.4–7.x；优先检查上次地址。';
  const helpText = panel.querySelector('.boox-manual p');
  if (helpText) helpText.textContent = '① 地址栏左侧网站设置 → 允许“本地网络访问”，再扫描。② BOOX 保持互传页面亮屏；电脑可使用同一路由器的有线连接，避免访客 Wi-Fi 或 VPN 隔离。③ 若地址不在 192.168.4–7.x，粘贴互传显示的完整地址并打开；以后会记住并优先扫描该网段。浏览器限制扫描时仍可直接打开地址。';
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
  const permissionLabel = state => {
    const labels = {granted:'已允许', denied:'已阻止', prompt:'等待授权', unknown:'浏览器未提供状态'};
    $('booxPermission').textContent = `本地网络：${labels[state] || labels.unknown}`;
  };
  const showHelp = () => { panel.querySelector('.boox-manual').open = true; };

  async function permissionState() {
    for (const name of ['local-network', 'local-network-access']) {
      try { networkPermission = await navigator.permissions.query({name}); permissionLabel(networkPermission.state); return networkPermission.state; } catch {}
    }
    networkPermission = null; permissionLabel('unknown'); return 'unknown';
  }
  async function start(automatic = false) {
    if (busy) return;
    const ticket = ++generation; setBusy(true);
    const state = await permissionState();
    if (ticket !== generation) return;
    if (automatic && state !== 'granted') { setBusy(false); status('点击“扫描 BOOX”以允许浏览器访问 BOOX 所在的本地网络。'); return; }
    if (state === 'denied') { setBusy(false); showHelp(); status('本地网络权限已被拒绝。请在地址栏的网站设置中允许“本地网络访问”，然后重试。'); return; }
    controller = new AbortController(); const signal = controller.signal;
    selected = null; showLastAddress();
    const total = hosts(prefs.last).length;
    $('booxResults').replaceChildren(); $('booxProgress').max = total; $('booxProgress').value = 0; $('booxCount').textContent = `0 / ${total}`; setBusy(true);
    status('请保持 BOOX 互传开启并连接同一 Wi-Fi；若浏览器询问本地网络权限，请选择允许。');
    try {
      let permissionReady, removePermissionListener = () => {};
      let permissionDenied = false;
      const activeController = controller;
      if (state === 'prompt' && networkPermission?.addEventListener) {
        permissionReady = new Promise(resolve => {
          const changed = () => {
            if (networkPermission.state !== 'prompt' || signal.aborted) {
              permissionLabel(networkPermission.state);
              if (networkPermission.state === 'denied') { permissionDenied = true; activeController.abort(); }
              resolve(); removePermissionListener();
            }
          };
          removePermissionListener = () => { networkPermission.removeEventListener('change', changed); signal.removeEventListener('abort', changed); };
          networkPermission.addEventListener('change', changed); signal.addEventListener('abort', changed, {once:true}); changed();
        });
      }
      try {
        const hits = await scan({last:prefs.last, signal, permission:state !== 'granted', permissionReady, onFound:hit => { if (ticket === generation && !signal.aborted) showHit(hit); },
          onPhase:phase => { status(phase === 'reconnect' ? '正在快速检查上次的 BOOX 地址…' : phase === 'permission' ? '请允许浏览器访问本地网络，授权后开始快速扫描。' : phase === 'retry' ? '快速扫描未发现设备，正在重试响应较慢的地址…' : '正在快速寻找 BOOX，找到后提供打开链接…'); },
          onProgress:(done,total) => { if (ticket !== generation) return; $('booxProgress').value = done; $('booxCount').textContent = `${done} / ${total}`; }});
        if (!signal.aborted && !selected) {
          showHelp();
          const current = await permissionState();
          if (ticket !== generation) return;
          status(current === 'prompt' ? '本地网络尚未授权。请在浏览器提示中选择允许，或在地址栏的网站设置中允许“本地网络访问”，然后重新扫描。' : current === 'denied' ? '本地网络权限已被拒绝。请在地址栏的网站设置中允许“本地网络访问”，然后重试。' : '本轮未发现响应，不能据此判断 BOOX 未开启。请检查下方本地网络权限、Wi-Fi 和互传地址，也可直接打开 BOOX 显示的地址。');
        }
        else if (!signal.aborted && selected) {
          $('booxCount').textContent = '已发现 · 已停止其余扫描';
          if (selected.verified) status(`发现 ${selected.model}，已停止其余扫描。点击“打开 BOOX 互传”继续。`);
        }
      } finally {
        removePermissionListener();
        if (permissionDenied && ticket === generation) { showHelp(); status('本地网络权限已被拒绝。请在地址栏的网站设置中允许“本地网络访问”，然后重试。'); }
      }
    } catch { if (ticket === generation && !signal.aborted) status('扫描未完成，请重试或使用已知地址。'); }
    finally { if (ticket === generation) { if (signal.aborted && networkPermission?.state !== 'denied') status('已停止扫描。'); controller = null; setBusy(false); } }
  }
  function open(automatic = false) {
    panel.hidden = false; panel.showModal?.();
    if (!initialized) { initialized = true; start(automatic); }
  }
  $('booxEntry').onclick = () => open(!!prefs.auto);
  $('booxScan').onclick = () => start(); $('booxConnect').onclick = openManual;
  $('booxStop').onclick = () => { if (controller) controller.abort(); else { ++generation; setBusy(false); status('已停止扫描。'); } };
  $('booxHost').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); openManual(); } };
  $('booxAuto').onchange = () => { prefs.auto = $('booxAuto').checked; save(); };
  function closePanel(){ ++generation; controller?.abort(); controller = null; setBusy(false); if(panel.open)panel.close(); panel.hidden = true; selected = null; initialized = false; $('booxEntry').focus(); }
  $('booxClose').onclick=closePanel;
  panel.addEventListener('cancel',event=>{event.preventDefault();closePanel();});
  panel.addEventListener('close',closePanel);
  addEventListener('pagehide', () => controller?.abort());
  addEventListener('nexus-view-change', event => {
    if (event.detail?.view !== 'vps') { ++generation; initialized = false; controller?.abort(); controller = null; setBusy(false); if(panel.open)closePanel(); }
  });
})(globalThis);
