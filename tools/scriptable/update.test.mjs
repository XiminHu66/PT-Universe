import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const loader = fs.readFileSync(new URL('./PT-Widgets.js', import.meta.url), 'utf8');
const runtime = fs.readFileSync(new URL('./PT-Widgets.runtime.js', import.meta.url), 'utf8');
const launch = new vm.Script('(async () => {\n' + loader + '\n})()');
const commit = n => String(n).padStart(40, '0');
const versionFile = n => '/scriptable/pt-widgets-runtime/v' + n + '-' + commit(n) + '.js';
const settings = '/scriptable/pt-widgets-v1/watchlist.json';
const originalSettings = '{"stocks":[{"symbol":"NASDAQ:NVDA","buy":150}]}';

let version = 1;
let responseOverride;
let selected = 6;
let render = [];
const requests = [];
const messages = [];
const files = new Map([[settings, originalSettings]]);
const directories = new Set();
let uuid = 0;
const fm = {
  documentsDirectory: () => '/scriptable',
  joinPath: (dir, name) => dir + '/' + name,
  fileExists: path => files.has(path) || directories.has(path),
  createDirectory: path => directories.add(path),
  listContents: dir => [...files.keys()].filter(path => path.startsWith(dir + '/')).map(path => path.split('/').pop()),
  readString: path => files.get(path),
  writeString: (path, contents) => files.set(path, contents),
  move: (source, target) => { assert.ok(!files.has(target)); files.set(target, files.get(source)); files.delete(source); },
  remove: path => files.delete(path),
};

class MockRequest {
  constructor(url) { this.url = url; }
  async loadString() {
    requests.push(this.url);
    const channel = this.url.endsWith('/channel.json');
    const override = responseOverride?.(this.url);
    this.response = { statusCode: override?.status ?? 200 };
    if (override) return override.body;
    if (channel) return JSON.stringify({ api: 1, version, commit: commit(version) });
    if (version === 1) return runtime.replace('// PT Widgets runtime v2', '// PT Widgets runtime v1').replace('const VERSION = 2;', 'const VERSION = 1;');
    return '// PT Widgets runtime v' + version + '\nmodule.exports={api:1,version:' + version
      + ', async main(){ if(args.widgetParameter==="news") throw Error("test render error"); record(); }};';
  }
}

function start({ widget = false, parameter = 'news' } = {}) {
  const context = vm.createContext({
    FileManager: { local: () => fm }, UUID: { string: () => String(++uuid) }, Request: MockRequest,
    config: { runsInWidget: widget, widgetFamily: 'accessoryRectangular' }, args: { widgetParameter: parameter },
    console: { warn() {} }, record: () => render.push('new'),
    Script: { setWidget: () => render.push('old'), complete() {} },
    Font: { systemFont() {}, semiboldSystemFont() {} }, Color: class { static dynamic(day) { return day; } },
    ListWidget: class { addStack() { return new this.constructor(); } centerAlignContent() {} setPadding() {} addText() { return {}; } addSpacer() {} },
    URLScheme: { forRunningScript: () => 'scriptable:///run/PT%20Widgets' },
    Alert: class {
      addAction() {} addCancelAction() {}
      async presentSheet() { return selected; }
      async presentAlert() { messages.push(this.message); }
    },
  });
  context.importModule = path => {
    const source = files.get(path);
    assert.equal(typeof source, 'string');
    return vm.runInContext('(function(){const module={exports:{}};\n' + source + '\nreturn module.exports;})()', context);
  };
  return launch.runInContext(context);
}

await start({ widget: true });
assert.equal(requests.length, 0, 'a widget does not bootstrap over the network');
selected = -1;
await start();
assert.ok(files.has(versionFile(1)));
assert.equal(requests.length, 2, 'initial install reads metadata and a pinned file');

selected = 6;
await start();
assert.equal(requests.length, 3, 'current version only checks metadata');
assert.match(messages.at(-1), /当前发布版 v1/);

version = 2;
responseOverride = url => url.endsWith('.js') ? {status: 503, body: 'Unavailable'} : undefined;
await start();
assert.match(messages.at(-1), /更新失败/);
assert.ok(files.has(versionFile(1)) && !files.has(versionFile(2)));

responseOverride = url => url.endsWith('.js') ? {body: '// PT Widgets runtime v2\ninvalid {'} : undefined;
await start();
assert.match(messages.at(-1), /更新失败/);
assert.ok(!files.has(versionFile(2)));
assert.ok(![...files.keys()].some(path => path.includes('pending-')));

responseOverride = undefined;
await start();
assert.match(messages.at(-1), /已安装 v2/);
assert.ok(files.has(versionFile(1)) && files.has(versionFile(2)));
assert.equal(files.get(settings), originalSettings);

const beforeRender = requests.length;
render = [];
await start({ widget: true, parameter: 'invest' });
assert.deepEqual(render, ['new']);
render = [];
await start({ widget: true, parameter: 'news' });
assert.deepEqual(render, ['old'], 'render failure falls back to old module');
assert.equal(requests.length, beforeRender, 'normal rendering makes no update requests');
console.log('PASS: first install, one-click update, bad download, syntax rejection, local settings, offline widget loading and rollback');
