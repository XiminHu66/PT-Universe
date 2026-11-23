// Variables used by Scriptable.
// icon-color: indigo; icon-glyph: th-large;
const RAW = 'https://raw.githubusercontent.com/XiminHu66/PT-Universe/';
const DIR = '/tools/scriptable/';
const CHANNEL = RAW + 'refs/heads/scriptable-widgets-stable' + DIR + 'channel.json';
const API = 1;
const VERSION_FILE = /^v([1-9]\d{0,7})-([a-f0-9]{40})\.js$/;
const fm = FileManager.local();
const base = fm.joinPath(fm.documentsDirectory(), 'pt-widgets-runtime');
const path = name => fm.joinPath(base, name);

function installed() {
  if (!fm.fileExists(base)) return [];
  return fm.listContents(base).flatMap(name => {
    const match = VERSION_FILE.exec(name);
    return match ? [{ name, version: Number(match[1]) }] : [];
  }).sort((a, b) => b.version - a.version);
}

function loadRuntime(file, version) {
  const runtime = importModule(file);
  if (runtime?.api !== API || runtime.version !== version || typeof runtime.main !== 'function') {
    throw Error('版本文件与当前入口不兼容。');
  }
  return runtime;
}

async function getText(url, limit) {
  const request = new Request(url);
  request.timeoutInterval = 8;
  request.headers = { 'Cache-Control': 'no-cache' };
  request.onRedirect = () => null;
  const body = await request.loadString();
  if (request.response?.statusCode !== 200 || !body?.length || body.length > limit) {
    throw Error('无法读取 GitHub 上的版本文件。');
  }
  return body;
}

async function update() {
  const release = JSON.parse(await getText(CHANNEL, 2048));
  const { api, version, commit } = release || {};
  if (api !== API || !Number.isSafeInteger(version) || version < 1 || version > 99999999
    || typeof commit !== 'string' || !/^[a-f0-9]{40}$/.test(commit)) {
    throw Error('发布信息无效或版本不兼容。');
  }

  const name = 'v' + version + '-' + commit + '.js';
  const existing = installed();
  if (existing[0]?.version > version) return '手机上已经有更新的版本。';
  if (existing.some(file => file.version === version && file.name !== name)) {
    throw Error('同一版本号对应了不同的发布内容。');
  }
  if (existing.some(file => file.name === name)) {
    try {
      loadRuntime(path(name), version);
      return '已是当前发布版 v' + version + '。';
    } catch (error) {
      console.warn(String(error));
    }
  }

  const source = await getText(RAW + commit + DIR + 'PT-Widgets.runtime.js', 128000);
  if (!source.startsWith('// PT Widgets runtime v' + version + '\n')) throw Error('下载的版本与发布信息不符。');
  if (!fm.fileExists(base)) fm.createDirectory(base, true);
  const staging = path('pending-' + UUID.string() + '.js');
  try {
    fm.writeString(staging, source);
    loadRuntime(staging, version);
    // Use a unique commit-specific destination. A failed new install leaves all prior versions available.
    const current = installed()[0];
    if (current?.version > version) return '手机上已经有更新的版本。';
    if (current?.version === version && current.name !== name) throw Error('发布内容发生变化，请重试。');
    const destination = path(name);
    if (fm.fileExists(destination)) {
      try {
        loadRuntime(destination, version);
        return '已是当前发布版 v' + version + '。';
      } catch (_) {
        fm.remove(destination);
      }
    }
    fm.move(staging, destination);
    return '已安装 v' + version + '。下次打开脚本或 iOS 刷新卡片时生效。';
  } finally {
    try { if (fm.fileExists(staging)) fm.remove(staging); }
    catch (error) { console.warn(String(error)); }
  }
}

async function updateFromMenu() {
  try { return await update(); }
  catch (error) {
    console.warn(String(error));
    return '这次更新失败，保留已安装的版本。' + (error?.message ? '\n' + error.message : '');
  }
}

function tryRuntime(candidate) {
  try { return loadRuntime(path(candidate.name), candidate.version); }
  catch (error) { console.warn(String(error)); return null; }
}

async function run() {
  const widget = config.runsInWidget;
  const shortcut = args.shortcutParameter === 'alerts';
  if (!widget) {
    for (const candidate of installed()) {
      const runtime = tryRuntime(candidate);
      if (runtime) return await runtime.main(updateFromMenu);
    }
    if (!shortcut) {
      await update();
      for (const candidate of installed()) {
        const runtime = tryRuntime(candidate);
        if (runtime) return await runtime.main(updateFromMenu);
      }
    }
  } else {
    for (const candidate of installed()) {
      const runtime = tryRuntime(candidate);
      if (!runtime) continue;
      try { return await runtime.main(updateFromMenu); }
      catch (error) { console.warn(String(error)); }
    }
  }
  throw Error('没有加载到可以使用的版本。');
}

try { await run(); }
catch (error) {
  console.warn(String(error));
  const message = '请联网打开 Scriptable 里的 PT Widgets，再试一次。';
  if (config.runsInWidget) {
    const widget = new ListWidget();
    widget.addText('PT Widgets');
    widget.addText(message);
    widget.url = URLScheme.forRunningScript();
    Script.setWidget(widget);
  } else if (args.shortcutParameter === 'alerts') {
    Script.setShortcutOutput(message);
  } else {
    const alert = new Alert();
    alert.title = 'PT Widgets 无法启动';
    alert.message = message;
    alert.addAction('好');
    await alert.presentAlert();
  }
}
Script.complete();
