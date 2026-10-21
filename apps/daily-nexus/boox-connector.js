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
  async function probe(base, {signal, timeout = 1800, fetcher = root.fetch.bind(root)} = {}) {
    base = address(base);
    const controller = new AbortController(), abort = () => controller.abort();
    if (signal?.aborted) return null;
    signal?.addEventListener('abort', abort, {once:true});
    const timer = setTimeout(abort, timeout);
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
      // Opaque responses establish only a reachable candidate, never device identity.
      const response = await fetcher(base + '/', {...options, mode:'no-cors'});
      return response.type === 'opaque' ? {url:base, model:'待确认的互传页面', verified:false} : null;
    } catch { return null; }
    finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
  }
  async function scan({last, signal, onProgress = () => {}, onFound = () => {}, probeFn = probe, concurrency = 6, permission = true} = {}) {
    const queue = hosts(last), found = []; let done = 0, index = 0;
    const accept = hit => { if (hit && !signal?.aborted) { found.push(hit); onFound(hit); } };
    // One foreground request gives the permission prompt time before bounded parallel probes.
    if (permission && !signal?.aborted) {
      accept(await probeFn(queue[index++], {signal, timeout:30000}));
      onProgress(++done, queue.length);
    }
    await Promise.all(Array.from({length:Math.min(6, Math.max(1, concurrency))}, async () => {
      while (index < queue.length && !signal?.aborted) {
        const url = queue[index++];
        accept(await probeFn(url, {signal})); onProgress(++done, queue.length);
      }
    }));
    return found;
  }
  const api = {address, hosts, probe, scan};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (!root.document) return;
  const $ = id => document.getElementById(id);
  const panel = $('booxPanel'); if (!panel) return;
  let controller = null, selected = null, initialized = false, busy = false, generation = 0;
  let prefs = {};
  try { prefs = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch {} };
  const status = text => { $('booxStatus').textContent = text; };
  const setBusy = value => {
    busy = value; $('booxScan').disabled = value; $('booxConnect').disabled = value;
    $('booxStop').hidden = !value; $('booxHost').disabled = value;
  };
  if (prefs.last) { try { $('booxHost').value = new URL(address(prefs.last)).hostname; } catch {} }
  $('booxAuto').checked = !!prefs.auto;
  function connect(hit) {
    selected = hit; prefs.last = address(hit.url); save();
    $('booxHost').value = new URL(hit.url).hostname;
    $('booxNative').href = hit.url + '/'; $('booxNative').hidden = false;
    $('booxFrameWrap').hidden = false; $('booxFrame').src = hit.url + '/';
    $('booxFrameNote').textContent = '已请求载入原生互传页面。若下方空白或显示拒绝连接，点击“独立打开”，无需手输地址。';
    status(hit.verified ? `发现 ${hit.model} · ${new URL(hit.url).hostname}。正在载入原生页面。` : '该地址有响应，但浏览器不允许识别设备。请核对下方页面确实是 BOOX 后再传书。');
  }
  function showHit(hit) {
    const button = document.createElement('button'); button.type = 'button';
    button.textContent = `${hit.verified ? hit.model : '候选页面（未验证）'} · ${new URL(hit.url).hostname}`;
    button.onclick = () => connect(hit); $('booxResults').append(button);
    if (hit.verified && !selected) connect(hit);
  }
  async function permissionState() {
    for (const name of ['local-network', 'local-network-access']) {
      try { return (await navigator.permissions.query({name})).state; } catch {}
    }
    return 'unknown';
  }
  async function start(manual = false, automatic = false) {
    if (busy) return;
    let direct;
    if (manual) { try { direct = address($('booxHost').value); } catch (e) { status(e.message); return; } }
    const ticket = ++generation; setBusy(true);
    const state = await permissionState();
    if (ticket !== generation) { setBusy(false); return; }
    if (automatic && state !== 'granted') { setBusy(false); status('点击“扫描并连接”以允许浏览器访问 BOOX 所在的本地网络。'); return; }
    if (state === 'denied') { setBusy(false); status('本地网络权限已被拒绝。请在地址栏的网站设置中允许“本地网络访问”，然后重试。'); return; }
    controller = new AbortController(); const signal = controller.signal;
    selected = null; $('booxNative').hidden = true; $('booxFrame').src = 'about:blank'; $('booxFrameWrap').hidden = true;
    $('booxResults').replaceChildren(); $('booxProgress').value = 0; $('booxCount').textContent = '0 / 254'; setBusy(true);
    status('请保持 BOOX 互传开启并连接同一 Wi-Fi；若浏览器询问本地网络权限，请选择允许。');
    try {
      if (manual) {
        const hit = await probe(direct, {signal, timeout:state === 'granted' ? 5000 : 30000});
        if (!signal.aborted) {
          if (hit) { showHit(hit); if (!hit.verified) connect(hit); }
          else status('无法连接此地址。请确认互传已开启、同一 Wi-Fi，且浏览器已允许本地网络访问。');
        }
      } else {
        const hits = await scan({last:prefs.last, signal, permission:state !== 'granted', onFound:showHit,
          onProgress:(done,total) => { $('booxProgress').value = done; $('booxCount').textContent = `${done} / ${total}`; }});
        if (!signal.aborted && !selected && hits.length === 1) connect(hits[0]);
        if (!signal.aborted && !selected) status(hits.length ? `找到 ${hits.length} 个候选页面，因跨域限制无法确认型号，请选择后核对。` : '未找到设备。请确认 BOOX 互传开启、同一 Wi-Fi、无访客网络隔离，并允许本地网络访问。可重试扫描或使用下方已知地址。');
        else if (!signal.aborted && selected?.verified) status(`扫描完成 · ${selected.model}。请在下方原生页面传书。`);
      }
    } catch { if (!signal.aborted) status('扫描未完成，请重试或使用已知地址。'); }
    finally { if (signal.aborted) status('已停止扫描。'); controller = null; setBusy(false); }
  }
  function open(automatic = false) {
    panel.hidden = false; panel.scrollIntoView({behavior:'smooth', block:'start'});
    if (!initialized) { initialized = true; start(false, automatic); }
  }
  $('booxEntry').onclick = () => open();
  $('booxScan').onclick = () => start(); $('booxConnect').onclick = () => start(true);
  $('booxStop').onclick = () => controller?.abort();
  $('booxHost').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); start(true); } };
  $('booxAuto').onchange = () => { prefs.auto = $('booxAuto').checked; save(); };
  $('booxClose').onclick = () => { ++generation; controller?.abort(); panel.hidden = true; $('booxFrame').src = 'about:blank'; $('booxFrameWrap').hidden = true; selected = null; initialized = false; $('booxEntry').focus(); };
  addEventListener('pagehide', () => controller?.abort());
  addEventListener('nexus-view-change', event => {
    if (event.detail?.view === 'tools' && prefs.auto && !initialized) open(true);
    else if (event.detail?.view !== 'tools') { ++generation; initialized = false; controller?.abort(); }
  });
  if (new URL(location.href).searchParams.get('view') === 'tools' && prefs.auto) open(true);
})(globalThis);
