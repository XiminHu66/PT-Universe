'use strict';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const tabs = $$('[data-tab]');
const rssTabs = $$('[data-rss-view]');
const frame = $('#rss-frame');
const rssPath = new URL('../rss-dashboard/', location.href);
const viewKey = 'pt.readingDesk.rssView';
let rssView = 'frequent';
try {
  if (sessionStorage.getItem(viewKey) === 'hot') rssView = 'hot';
} catch { /* The current page still remembers its view. */ }
if (!location.hash && !history.state?.readingDeskRssView) {
  history.replaceState({ ...history.state, readingDeskRssView: rssView }, '');
}

function setRoute() {
  const [section, view] = location.hash.slice(1).split('/');
  const tab = section === 'memo' || tabs.some(button => button.dataset.tab === section) ? section : 'rss';
  if (tab === 'rss') {
    const requestedView = view || history.state?.readingDeskRssView;
    if (['hot', 'frequent'].includes(requestedView)) rssView = requestedView;
    try { sessionStorage.setItem(viewKey, rssView); } catch { /* Optional session state. */ }
  }
  const memoPanel = $('#panel-memo');
  memoPanel.hidden = tab !== 'memo';
  memoPanel.inert = tab !== 'memo';
  $('#memo-entry').setAttribute('aria-current', tab === 'memo' ? 'page' : 'false');
  for (const button of tabs) {
    const selected = button.dataset.tab === tab;
    button.setAttribute('aria-selected', String(selected));
    button.tabIndex = selected || (tab === 'memo' && button.dataset.tab === 'rss') ? 0 : -1;
    const panel = document.getElementById(button.getAttribute('aria-controls'));
    panel.hidden = !selected;
    panel.inert = !selected;
  }
  for (const button of rssTabs) {
    button.setAttribute('aria-pressed', String(button.dataset.rssView === rssView));
  }
  const url = new URL(rssPath);
  url.search = new URLSearchParams({ reader: '1', view: rssView });
  $('#rss-open').href = url.href;
  if (tab === 'rss' && !frame.hasAttribute('src')) frame.src = url.href;
  sendRssView();
}

function sendRssView() {
  frame.contentWindow?.postMessage({ type: 'reading-desk-rss-view', view: rssView }, location.origin);
}

function navigate(hash) {
  if (location.hash !== hash) {
    history.pushState(null, '', hash);
    setRoute();
  }
}

for (const button of tabs) {
  button.addEventListener('click', () => {
    navigate(button.dataset.tab === 'rss' ? `#rss/${rssView}` : `#${button.dataset.tab}`);
  });
}
$('.tabs').addEventListener('keydown', event => {
  const index = tabs.indexOf(event.target);
  const next = { ArrowLeft: index - 1, ArrowRight: index + 1, Home: 0, End: tabs.length - 1 }[event.key];
  if (index < 0 || next === undefined) return;
  event.preventDefault();
  const button = tabs[(next + tabs.length) % tabs.length];
  button.click();
  button.focus();
});
for (const button of rssTabs) {
  button.addEventListener('click', () => navigate(`#rss/${button.dataset.rssView}`));
}
$('#memo-entry').addEventListener('click', event => {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  navigate('#memo');
});
frame.addEventListener('load', sendRssView);
window.addEventListener('popstate', setRoute);
window.addEventListener('hashchange', setRoute);
setRoute();

function normalizedLink(value, service) {
  if (!value) return '';
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.port || url.username || url.password) {
    throw new Error('请输入没有账号信息的 HTTPS 地址。');
  }
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_.*|fbclid|gclid|ref|no_universal_links)$/i.test(key)) url.searchParams.delete(key);
  }
  if (url.hash === '#no_universal_links') url.hash = '';
  if (service === 'gpt') {
    if (url.hostname !== 'chatgpt.com' || !/^\/(?:g\/[\w-]+\/)?c\/[\w-]+\/?$/.test(url.pathname)) {
      throw new Error('请粘贴 chatgpt.com 的原会话地址（/c/…）。');
    }
    // Keep a supplied message selector or text fragment, never fabricate one.
    if ([...url.searchParams].some(([key, val]) => !/^(message_id|messageId)$/.test(key) || !/^[\w-]+$/.test(val))) {
      throw new Error('请粘贴原会话地址，或移除无法识别的参数。');
    }
    if (url.hash && !/^#(?:[\w-]+|:~:text=[^#]+)$/.test(url.hash)) {
      throw new Error('无法识别该会话的定位片段。');
    }
  } else if (!['muse.ai', 'www.muse.ai', 'applink.muse.ai'].includes(url.hostname)
    || !/^\/(?:[\w-]+\/)*[\w-]*$/.test(url.pathname)
    || /(?:^|\/)(?:redirect|out|l|login|logout|auth|oauth|linkshim)(?:\/|$)/i.test(url.pathname)
    || [...url.searchParams].some(([key, val]) => /redirect|return|next|url|target|token|auth/i.test(key) || !/^[\w.-]+$/.test(val))
    || (url.hash && !/^#[\w/-]+$/.test(url.hash))) {
    throw new Error('请粘贴已验证的 Muse 网页或 App 直达链接。');
  }
  return url.href;
}

function configureLinks(service, entries, form) {
  const storageKey = `pt.readingDesk.links.${service}`;
  const toggle = $(service === 'gpt' ? '#gpt-links-toggle' : '#muse-links-toggle');
  const status = form.querySelector('[role="status"]');
  for (const entry of entries) {
    const card = entry.anchor.closest('.task-card');
    const actions = document.createElement('div');
    actions.className = 'card-actions';
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'text-button';
    edit.textContent = '配置直达';
    edit.setAttribute('aria-label', `配置直达 · ${card.querySelector('h3').textContent}`);
    edit.addEventListener('click', () => showSettings(entry.input));
    const web = document.createElement('a');
    web.className = 'quiet-link';
    web.textContent = 'Safari 网页';
    web.target = '_blank';
    web.rel = 'noopener noreferrer';
    web.hidden = true;
    if (service === 'gpt') actions.append(web);
    actions.append(edit);
    card.append(actions);
    card.classList.add('linked-card');
    entry.web = web;
    entry.fallback = entry.anchor.href;
    entry.fallbackLabel = entry.anchor.textContent;
    const test = document.createElement('a');
    test.className = 'quiet-link';
    test.textContent = '试开';
    test.target = '_blank';
    test.rel = 'noopener noreferrer';
    test.hidden = true;
    const label = entry.input.closest('label');
    const field = document.createElement('div');
    label.before(field);
    field.append(label, test);
    entry.updateTest = () => {
      let testUrl = '';
      try { testUrl = normalizedLink(entry.input.value.trim(), service); } catch { /* Invalid drafts cannot be opened. */ }
      test.hidden = !testUrl;
      test.href = testUrl || '#';
    };
    entry.input.addEventListener('input', entry.updateTest);
  }

  function apply(values) {
    for (const entry of entries) {
      let url = '';
      try { url = normalizedLink(values?.[entry.key], service); } catch { /* Use the official fallback. */ }
      entry.input.value = url;
      entry.anchor.href = url || entry.fallback;
      entry.anchor.textContent = url ? (service === 'gpt' ? '打开原会话 ↗' : '打开直达位置 ↗') : entry.fallbackLabel;
      const title = entry.anchor.closest('.task-card').querySelector('h3').textContent;
      entry.anchor.setAttribute('aria-label', `${title} · ${entry.anchor.textContent}`);
      if (service === 'gpt' && url) {
        const webUrl = new URL(url);
        webUrl.searchParams.set('no_universal_links', '1');
        entry.web.href = webUrl.href;
        entry.web.setAttribute('aria-label', `${title} · Safari 网页`);
      }
      entry.web.hidden = !url;
      entry.updateTest();
    }
  }

  function showSettings(input) {
    form.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
    input.focus();
  }

  try { apply(JSON.parse(localStorage.getItem(storageKey))); }
  catch { status.textContent = '无法读取本机链接，正在使用官方入口。'; }
  toggle.addEventListener('click', () => {
    if (form.hidden) showSettings(entries[0].input);
    else {
      form.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
    }
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    const values = {};
    for (const { input, key } of entries) {
      input.removeAttribute('aria-invalid');
      try { values[key] = normalizedLink(input.value.trim(), service); }
      catch (error) {
        input.setAttribute('aria-invalid', 'true');
        status.textContent = error instanceof TypeError ? '请输入完整的 HTTPS 地址。' : error.message;
        input.focus();
        return;
      }
    }
    try {
      localStorage.setItem(storageKey, JSON.stringify(values));
      apply(values);
      status.textContent = '已保存到此浏览器。';
    } catch {
      status.textContent = '保存失败。仍可使用之前的链接。';
    }
  });
}

const gptLinks = $$('[data-task]').map(anchor => {
  const label = document.createElement('label');
  label.textContent = anchor.closest('.task-card').querySelector('h3').textContent;
  const input = document.createElement('input');
  input.type = 'url';
  input.inputMode = 'url';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.placeholder = 'https://chatgpt.com/c/…';
  label.append(input);
  $('#task-link-form').append(label);
  return { input, anchor, key: anchor.dataset.task };
});
configureLinks('gpt', gptLinks, $('#gpt-link-settings'));
configureLinks('muse', [
  { input: $('#muse-spaces-input'), anchor: $('#muse-spaces-link'), key: 'spaces' },
  { input: $('#muse-tasks-input'), anchor: $('#muse-tasks-link'), key: 'tasks' }
], $('#muse-link-settings'));

$('#copy-locator').addEventListener('click', async () => {
  const code = 'javascript:' + encodeURIComponent('void (' + jumpToLatestReportStart.toString() + ')()');
  try {
    await navigator.clipboard.writeText(code);
    $('#locator-status').textContent = '已复制。请贴到 Safari 书签的地址字段。';
  } catch {
    const field = $('#locator-address');
    field.hidden = false;
    field.value = code;
    field.select();
    $('#locator-status').textContent = '请手动复制以下书签地址。';
  }
});

const memo = $('#memo-text');
const memoStatus = $('#memo-status');
const memoConflict = $('#memo-conflict');
const memoActionStatus = $('#memo-action-status');
const memoButtons = $$('.memo-actions button');
let savedMemo;
let saveTimer;
let saving = false;
let conflict = false;

function setMemoStatus(message, error = false) {
  memoStatus.textContent = message;
  memoStatus.toggleAttribute('data-error', error);
}

async function loadMemo() {
  memo.disabled = true;
  memoButtons.forEach(button => { button.disabled = true; });
  try {
    savedMemo = await memoStore.read();
    memo.value = savedMemo.text;
    conflict = false;
    memoConflict.hidden = true;
    setMemoStatus(savedMemo.revision ? '已保存' : '尚无备忘录');
  } catch {
    setMemoStatus('读取失败 · 可复制或导出草稿', true);
  } finally {
    memo.disabled = false;
    memoButtons.forEach(button => { button.disabled = false; });
  }
}

async function saveMemo() {
  clearTimeout(saveTimer);
  if (saving || conflict || !savedMemo || memo.value === savedMemo.text) return;
  saving = true;
  setMemoStatus('保存中…');
  const text = memo.value;
  try {
    const saved = await memoStore.save(text, savedMemo.revision);
    if (!saved) {
      conflict = true;
      memoConflict.hidden = false;
      setMemoStatus('未保存 · 版本冲突', true);
      return;
    }
    savedMemo = saved;
    if (memo.value === saved.text) {
      setMemoStatus('已保存');
    } else {
      scheduleMemoSave();
    }
  } catch {
    setMemoStatus('保存失败 · 可复制或导出', true);
  } finally {
    saving = false;
  }
}

function scheduleMemoSave() {
  if (conflict || !savedMemo) return;
  clearTimeout(saveTimer);
  setMemoStatus(memo.value === savedMemo.text && !saving ? (savedMemo.revision ? '已保存' : '尚无备忘录') : '未保存');
  saveTimer = setTimeout(saveMemo, 350);
}

memo.addEventListener('input', scheduleMemoSave);
memo.addEventListener('blur', saveMemo);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) void saveMemo();
});
window.addEventListener('pagehide', saveMemo);

$('#memo-latest').addEventListener('click', () => {
  if (confirm('载入已保存版本会放弃当前草稿。继续吗？')) void loadMemo();
});

$('#memo-copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(memo.value);
    memoActionStatus.textContent = '已复制全文';
  } catch {
    const start = memo.selectionStart;
    const end = memo.selectionEnd;
    memo.select();
    let copied = false;
    try {
      copied = document.execCommand('copy');
    } catch {}
    if (copied) {
      memo.setSelectionRange(start, end);
      memoActionStatus.textContent = '已复制全文';
    } else {
      memoActionStatus.textContent = '已选中全文，请使用系统复制或导出 TXT。';
    }
  }
});

$('#memo-export').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([memo.value], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'reading-desk-memo.txt';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  memoActionStatus.textContent = '已请求导出 TXT';
});

$('#memo-clear').addEventListener('click', () => {
  if (!memo.value || !confirm('清空这张备忘录吗？')) return;
  memo.value = '';
  memoActionStatus.textContent = '';
  scheduleMemoSave();
  void saveMemo();
});
void loadMemo();
