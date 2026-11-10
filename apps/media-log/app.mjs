import {TYPES, addRecord, createItem, fields, latest, mergeItems, parseBackup, recordedAt, tagKey, visibleItems} from './model.mjs';

const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c =>
  ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'})[c]);
const KEY = 'media-log.v1';
const DEMO = new URLSearchParams(location.search).get('demo') === '1';
const stamp = new Intl.DateTimeFormat('zh-CN', {year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hourCycle:'h23'});
const filter = {type:'', tag:'', query:''};
const itemDialog = $('#item-dialog'), itemForm = $('#item-form');
const progressDialog = $('#progress-dialog'), progressForm = $('#progress-form');
let editId = '', progressId = '', noticeTimer;
let items = [];

function sampleItems() {
  const now = Date.now();
  const samples = [
    {type:'game', title:'空洞骑士', tags:'Steam Deck，进行中', progress:'探索到泪水之城，下次先开存档点。', url:'https://store.steampowered.com/app/367520/Hollow_Knight/'},
    {type:'anime', title:'葬送的芙莉莲', tags:'想补', progress:'看完第 7 集。'},
    {type:'manga', title:'迷宫饭', tags:'想补，完结', progress:'读完第 18 话。'},
    {type:'novel', title:'狼与香辛料', tags:'BOOX，进行中', progress:'第 3 卷，第 2 章。'}
  ];
  return samples.map((value, i) => createItem(value, now - (i + 1) * 3600000));
}

function read() {
  if (DEMO) return items;
  const raw = localStorage.getItem(KEY);
  return raw ? parseBackup(JSON.parse(raw)) : [];
}

function commit(transform) {
  const next = transform(read());
  if (!DEMO) localStorage.setItem(KEY, JSON.stringify({version:1, items:next}));
  items = next;
}

function tell(text, error = false) {
  clearTimeout(noticeTimer);
  const el = $('#notice');
  el.hidden = false;
  el.textContent = text;
  el.classList.toggle('error', error);
  if (!error) noticeTimer = setTimeout(() => { el.hidden = true; }, 3500);
}

function timeHTML(at) {
  const time = new Date(at);
  return `<time datetime="${time.toISOString()}">${esc(stamp.format(time))}</time>`;
}

function card(item, rank) {
  const [type, icon] = TYPES[item.type];
  const record = latest(item);
  return `<article class="work" data-id="${esc(item.id)}" data-kind="${esc(item.type)}">
    <div class="mark" aria-hidden="true">${icon}</div>
    <div>
      <header class="work-head"><h3>${esc(item.title)}</h3><span class="rank">#${rank}</span></header>
      <p class="work-meta">${type} · 最后记录 ${timeHTML(recordedAt(item))}</p>
      <p class="progress${record ? '' : ' is-empty'}">${esc(record?.progress || '尚未填写进度')}</p>
      ${item.tags.length ? `<div class="chips">${item.tags.map(label => `<button type="button" data-tag="${esc(tagKey(label))}">${esc(label)}</button>`).join('')}</div>` : ''}
      <div class="card-actions">
        <button class="record" type="button" data-action="record">记录进度</button>
        <button class="quiet" type="button" data-action="history">历史${item.records.length ? ' ' + item.records.length : ''}</button>
        <button class="quiet" type="button" data-action="edit">编辑</button>
        ${item.url ? `<a href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">打开外链 ↗</a>` : ''}
      </div>
    </div>
  </article>`;
}

const types = [['', '全部'], ...Object.entries(TYPES).map(([key,[label]]) => [key,label])];
$('#types').innerHTML = types.map(([key,label]) =>
  `<button type="button" data-type="${key}" aria-pressed="false">${label}</button>`).join('');
const typeButtons = [...$('#types').querySelectorAll('[data-type]')];

function render() {
  const tags = new Map();
  const counts = new Map();
  for (const item of items) {
    counts.set(item.type, (counts.get(item.type) || 0) + 1);
    for (const label of item.tags) {
      const key = tagKey(label);
      if (!tags.has(key)) tags.set(key, label);
    }
  }
  if (!tags.has(filter.tag)) filter.tag = '';
  const options = '<option value="">全部标签</option>' + [...tags]
    .sort((a,b) => a[1].localeCompare(b[1], 'zh-CN'))
    .map(([key,label]) => `<option value="${esc(key)}">${esc(label)}</option>`).join('');
  const picker = $('#tags');
  if (picker.dataset.options !== options) {
    picker.innerHTML = options;
    picker.dataset.options = options;
  }
  picker.value = filter.tag;
  typeButtons.forEach((button, i) => {
    const [key,label] = types[i];
    button.textContent = key ? label + ' ' + (counts.get(key) || 0) : '全部 ' + items.length;
    button.setAttribute('aria-pressed', String(filter.type === key));
  });
  const ordered = visibleItems(items);
  const ranks = new Map(ordered.map((item,i) => [item.id,i+1]));
  const shown = visibleItems(ordered, filter);
  $('#feed').innerHTML = shown.map(item => card(item, ranks.get(item.id))).join('');
  $('#count').textContent = shown.length === items.length ? items.length + ' 部作品' : shown.length + ' / ' + items.length + ' 部';
  $('#empty').hidden = shown.length > 0;
  $('#empty-title').textContent = items.length ? '没有匹配的作品' : '第一条作品记录';
  $('#empty-copy').textContent = items.length ? '换个关键词，或清除筛选。' : '选一个想补或正在补的作品，先记下名称和当前进度。';
  $('#empty-action').textContent = items.length ? '清除筛选' : '新增作品';
}

function showItem(item) {
  editId = item?.id || '';
  itemForm.reset();
  $('#item-heading').textContent = item ? '编辑作品' : '新增作品';
  $('#item-error').textContent = '';
  $('#initial-progress').hidden = Boolean(item);
  $('#delete').hidden = !item;
  itemForm.elements.title.value = item?.title || '';
  itemForm.elements.type.value = item?.type || filter.type || 'game';
  itemForm.elements.tags.value = item?.tags.join('，') || '';
  itemForm.elements.url.value = item?.url || '';
  itemDialog.showModal();
}

function showProgress(item) {
  progressId = item.id;
  progressForm.reset();
  $('#progress-title').textContent = item.title + (latest(item) ? ' · 上次：' + latest(item).progress : '');
  $('#progress-error').textContent = '';
  progressDialog.showModal();
}

function showHistory(item) {
  $('#history-title').textContent = item.title;
  $('#history-list').innerHTML = item.records.length ? item.records.map(record =>
    `<li>${timeHTML(record.at)}<p>${esc(record.progress)}</p></li>`).join('') :
    '<li>这部作品还没有进度记录。</li>';
  $('#history-dialog').showModal();
}

function update(current, id, transform) {
  if (!current.some(item => item.id === id)) throw Error('该作品已不存在。');
  return current.map(item => item.id === id ? transform(item) : item);
}

function refreshView() {
  try { items = read(); render(); }
  catch { tell('暂时无法读取记录。现有数据已保留。', true); }
}

$('#add').onclick = () => showItem();
$('#empty-action').onclick = () => {
  if (!items.length) { showItem(); return; }
  Object.assign(filter, {type:'', tag:'', query:''});
  $('#search').value = '';
  render();
};
for (const button of typeButtons) button.onclick = () => { filter.type = button.dataset.type; render(); };
$('#tags').onchange = event => { filter.tag = event.target.value; render(); };
$('#search').oninput = event => { filter.query = event.target.value; render(); };
$('#feed').onclick = event => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.hasAttribute('data-tag')) { filter.tag = button.dataset.tag; render(); return; }
  const item = items.find(row => row.id === button.closest('[data-id]')?.dataset.id);
  if (!item) return;
  if (button.dataset.action === 'record') showProgress(item);
  if (button.dataset.action === 'history') showHistory(item);
  if (button.dataset.action === 'edit') showItem(item);
};
document.querySelectorAll('[data-close]').forEach(button => {
  button.onclick = () => button.closest('dialog').close();
});

itemForm.onsubmit = event => {
  event.preventDefault();
  const value = Object.fromEntries(new FormData(itemForm));
  const editing = Boolean(editId);
  try {
    commit(current => editing
      ? update(current, editId, item => ({...item, ...fields(value), editedAt: Math.max(Date.now(), item.editedAt + 1)}))
      : [createItem(value), ...current]);
    itemDialog.close();
    render();
    tell(editing ? '作品资料已更新' : '作品已加入记录');
  } catch (error) { $('#item-error').textContent = error.message; }
};

progressForm.onsubmit = event => {
  event.preventDefault();
  try {
    commit(current => update(current, progressId, item => addRecord(item, progressForm.elements.progress.value)));
    progressDialog.close();
    render();
    tell('进度已保存并重新排序');
  } catch (error) { $('#progress-error').textContent = error.message; }
};

$('#delete').onclick = () => {
  const item = items.find(row => row.id === editId);
  if (!item || !confirm('删除「' + item.title + '」和它的全部进度记录？')) return;
  try {
    commit(current => current.filter(row => row.id !== editId));
    itemDialog.close();
    render();
    tell('作品已删除');
  } catch (error) { $('#item-error').textContent = error.message; }
};

$('#export').onclick = () => {
  try {
    const blob = new Blob([JSON.stringify({version:1, items:read()}, null, 2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'media-log-' + new Date().toISOString().slice(0,10) + '.json';
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    $('#backup-menu').open = false;
  } catch (error) { tell('导出失败。' + error.message, true); }
};
$('#import').onclick = () => $('#import-file').click();
$('#import-file').onchange = async event => {
  const input = event.target;
  try {
    const file = input.files[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) throw Error('请导入小于 8 MiB 的备份。');
    const incoming = parseBackup(JSON.parse(await file.text()));
    commit(current => mergeItems(current, incoming));
    render();
    $('#backup-menu').open = false;
    tell('已合并 ' + incoming.length + ' 部作品的备份');
  } catch (error) { tell('导入失败。' + error.message, true); }
  finally { input.value = ''; }
};

try {
  const theme = JSON.parse(localStorage.getItem('ptu.theme') || 'null');
  document.documentElement.dataset.theme = theme === 'dark' ||
    theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
} catch { /* default light theme */ }
if (DEMO) {
  items = sampleItems();
  $('#sample').hidden = false;
  $('#mode').href = './';
  $('#mode').textContent = '返回我的记录';
  $('#backup-menu').hidden = true;
  $('#storage').textContent = '示例记录不会写入你的清单。';
} else {
  refreshView();
  addEventListener('storage', event => {
    if (event.key === KEY || event.key === null) refreshView();
  });
}
render();
