import {TYPES, addRecord, createItem, fields, latest, mergeItems, parseBackup, recordedAt, reorderItems, setCompleted, tagKey, visibleItems} from './model.mjs?v=priority1';

const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c =>
  ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'})[c]);
const KEY = 'media-log.v1';
const LAYOUT_KEY = 'media-log.layout.v1';
const SORT_KEY = 'media-log.sort.v1';
const params = new URLSearchParams(location.search);
const DEMO = params.get('demo') === '1';
const EMBEDDED = params.get('embedded') === 'nexus' && window.parent !== window;
const stamp = new Intl.DateTimeFormat('zh-CN', {year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hourCycle:'h23'});
const shortStamp = new Intl.DateTimeFormat('zh-CN', {month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit', hourCycle:'h23'});
const filter = {type:'', tag:'', query:''};
let archived = false, sort = 'recent', dragId = '';
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

function timeHTML(at, compact = false) {
  const time = new Date(at);
  const full = esc(stamp.format(time));
  return `<time datetime="${time.toISOString()}" title="${full}">${compact ? esc(shortStamp.format(time)) : full}</time>`;
}

function card(item, rank, index, total) {
  const [type] = TYPES[item.type];
  const record = latest(item);
  const title = esc(item.title);
  return `<article class="work" data-id="${esc(item.id)}" data-kind="${esc(item.type)}" draggable="${!archived}">
    <header class="work-heading">
      <div class="work-meta">
        <span class="type-badge">${type}</span>
        <span class="work-date">${archived ? '完成' : '更新'} ${timeHTML(archived ? item.completedAt : recordedAt(item), true)}</span>
        ${archived ? '' : `<span class="drag-handle" title="拖拽调整优先级"><span aria-hidden="true">⠿</span>${sort === 'priority' ? `<span aria-label="优先级 ${rank}">#${rank}</span>` : ''}</span>`}
      </div>
      <h3 title="${title}">${title}</h3>
    </header>
    <div class="work-details">
      <p class="progress${record ? '' : ' is-empty'}" title="${esc(record?.progress)}">${esc(record?.progress || '尚未记录进度')}</p>
      ${item.tags.length ? `<div class="chips">${item.tags.map(label => `<button type="button" data-tag="${esc(tagKey(label))}">${esc(label)}</button>`).join('')}</div>` : ''}
    </div>
    <footer class="card-actions">
      ${archived ? '<button class="record" type="button" data-action="restore">恢复到清单</button>' : '<button class="record" type="button" data-action="record">记录进度</button><button class="complete" type="button" data-action="complete" title="标记为已完成"><span aria-hidden="true">✓</span> 完成</button>'}
      <div class="action-tools">
        ${item.url ? `<a class="icon-button" href="${esc(item.url)}" target="_blank" rel="noopener noreferrer" aria-label="打开《${title}》外链" title="打开外链">↗</a>` : ''}
        <details class="dropdown work-menu" name="media-log-actions">
          <summary class="icon-button" aria-label="《${title}》的更多操作" title="更多操作">⋯</summary>
          <div class="menu">
            <button type="button" data-action="history">进度历史${item.records.length ? `<span class="menu-count">${item.records.length}</span>` : ''}</button>
            <button type="button" data-action="edit">编辑作品</button>
            ${archived ? '' : `<div class="menu-divider"></div>
            <button type="button" data-action="up" ${index === 0 ? 'disabled' : ''}>↑ 上移一位</button>
            <button type="button" data-action="down" ${index === total - 1 ? 'disabled' : ''}>↓ 下移一位</button>`}
          </div>
        </details>
      </div>
    </footer>
  </article>`;
}

const types = [['', '全部', '▦'], ...Object.entries(TYPES).map(([key,[label, icon]]) => [key,label,icon])];
$('#types').innerHTML = types.map(([key,label,icon]) =>
  `<button type="button" data-type="${key}" aria-pressed="false"><span class="type-icon" aria-hidden="true">${icon}</span><span>${label}</span><span class="type-count"></span></button>`).join('');
const typeButtons = [...$('#types').querySelectorAll('[data-type]')];
const layoutButtons = [...$('#layout').querySelectorAll('[data-layout]')];
const viewButtons = [...$('#views').querySelectorAll('[data-view]')];

function setSort(value, save = false) {
  sort = value === 'priority' ? 'priority' : 'recent';
  $('#sort').value = sort;
  if (save && !DEMO) {
    try { localStorage.setItem(SORT_KEY, sort); } catch { /* session preference is still usable */ }
  }
}

function shownItems(current = items) {
  return visibleItems(current, {...filter, completed:archived, sort});
}

function setView(value) {
  archived = value === 'archive';
  render();
}

function setLayout(value, save = false) {
  const layout = value === 'list' ? 'list' : 'grid';
  $('#feed').dataset.layout = layout;
  for (const button of layoutButtons) button.setAttribute('aria-pressed', String(button.dataset.layout === layout));
  if (save && !DEMO) {
    try { localStorage.setItem(LAYOUT_KEY, layout); } catch { /* keep the current session's preference */ }
  }
}

function renderActiveFilters(tags) {
  const active = [];
  if (filter.type) active.push(['type', TYPES[filter.type][0]]);
  if (filter.tag) active.push(['tag', tags.get(filter.tag)]);
  if (filter.query.trim()) active.push(['query', filter.query.trim()]);
  const node = $('#active-filters');
  node.hidden = !active.length;
  node.innerHTML = active.map(([key,label]) =>
    `<button type="button" data-clear-filter="${key}" aria-label="移除筛选 ${esc(label)}"><span>${esc(label)}</span><span aria-hidden="true">×</span></button>`).join('');
}

function render() {
  const scope = items.filter(item => (item.completedAt != null) === archived);
  const completeCount = items.length - items.filter(item => item.completedAt == null).length;
  $('#active-count').textContent = items.length - completeCount;
  $('#archive-count').textContent = completeCount;
  for (const button of viewButtons) {
    const selected = (button.dataset.view === 'archive') === archived;
    button.setAttribute('aria-selected', String(selected));
    button.tabIndex = selected ? 0 : -1;
  }
  $('#feed').setAttribute('aria-labelledby', archived ? 'archive-tab' : 'active-tab');
  $('#sort-label').hidden = archived;
  const tags = new Map();
  const counts = new Map();
  for (const item of scope) {
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
    const [key] = types[i];
    button.querySelector('.type-count').textContent = key ? counts.get(key) || 0 : scope.length;
    button.setAttribute('aria-pressed', String(filter.type === key));
  });
  renderActiveFilters(tags);
  const ordered = visibleItems(items, {completed:archived, sort});
  const ranks = new Map(ordered.map((item,i) => [item.id,i+1]));
  const shown = shownItems();
  $('#feed').innerHTML = shown.map((item,index) => card(item, ranks.get(item.id), index, shown.length)).join('');
  $('#order-hint').textContent = archived ? '按完成时间排列' : '⠿ 拖拽排序';
  $('#order-hint').hidden = archived ? !scope.length : shown.length < 2;
  $('#count').hidden = shown.length === scope.length;
  $('#count').textContent = `${shown.length} / ${scope.length} 部`;
  $('#empty').hidden = shown.length > 0;
  $('#empty-title').textContent = scope.length ? '没有匹配的作品' : archived ? '还没有已完成的作品' : '添加下一部想补的作品';
  $('#empty-copy').textContent = scope.length ? '换个关键词，或清除筛选。' : archived ? '在待补清单点击“完成”，作品和进度会保留在这里。' : '先记下作品名称和当前进度。';
  $('#empty-action').textContent = scope.length ? '清除筛选' : archived ? '返回待补清单' : '新增作品';
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
  if (!items.some(item => (item.completedAt != null) === archived)) {
    if (archived) setView('active'); else showItem();
    return;
  }
  Object.assign(filter, {type:'', tag:'', query:''});
  $('#search').value = '';
  render();
};
for (const button of typeButtons) button.onclick = () => { filter.type = button.dataset.type; render(); };
for (const button of layoutButtons) button.onclick = () => setLayout(button.dataset.layout, true);
for (const button of viewButtons) button.onclick = () => setView(button.dataset.view);
$('#views').onkeydown = event => {
  if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
  event.preventDefault();
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : archived ? 0 : 1;
  setView(viewButtons[next].dataset.view);
  viewButtons[next].focus();
};
$('#sort').onchange = event => { setSort(event.target.value, true); render(); };
$('#active-filters').onclick = event => {
  const control = event.target.closest('[data-clear-filter]');
  if (!control) return;
  const key = control.dataset.clearFilter;
  filter[key] = '';
  if (key === 'query') $('#search').value = '';
  render();
  const next = $('#active-filters').querySelector('button');
  (next || (key === 'type' ? typeButtons[0] : key === 'tag' ? $('#tags') : $('#search'))).focus();
};
$('#tags').onchange = event => { filter.tag = event.target.value; render(); };
$('#search').oninput = event => { filter.query = event.target.value; render(); };
$('#feed').onclick = event => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.hasAttribute('data-tag')) { filter.tag = button.dataset.tag; render(); return; }
  const item = items.find(row => row.id === button.closest('[data-id]')?.dataset.id);
  if (!item) return;
  const menu = button.closest('.work-menu');
  if (menu) {
    menu.open = false;
    menu.querySelector('summary').focus();
  }
  if (button.dataset.action === 'record') showProgress(item);
  if (button.dataset.action === 'history') showHistory(item);
  if (button.dataset.action === 'edit') showItem(item);
  if (['complete','restore'].includes(button.dataset.action)) {
    const completed = button.dataset.action === 'complete';
    try {
      commit(current => update(current, item.id, row => setCompleted(row, completed)));
      render();
      tell(completed ? '已完成，已移入历史记录' : '已恢复到待补清单');
    } catch (error) { tell(error.message, true); }
  }
  if (['up','down'].includes(button.dataset.action)) {
    const shown = shownItems();
    const index = shown.findIndex(row => row.id === item.id);
    const target = shown[index + (button.dataset.action === 'up' ? -1 : 1)];
    if (target) moveWork(item.id, target.id, true);
  }
};

function moveWork(id, targetId, restoreFocus = false) {
  try {
    commit(current => reorderItems(current, id, targetId, {...filter, sort}));
    setSort('priority', true);
    render();
    if (restoreFocus) {
      const work = [...$('#feed').children].find(node => node.dataset.id === id);
      work?.querySelector('summary')?.focus();
    }
    tell('优先级已保存');
  } catch (error) { tell(error.message, true); }
}

function clearDrag() {
  dragId = '';
  for (const node of $('#feed').children) node.classList.remove('dragging','drop-before','drop-after');
}
$('#feed').ondragstart = event => {
  const work = event.target.closest('.work');
  if (archived || !work || event.target.closest('button,a,summary,input,select,textarea')) { event.preventDefault(); return; }
  dragId = work.dataset.id;
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', dragId);
  work.classList.add('dragging');
};
$('#feed').ondragover = event => {
  const target = event.target.closest('.work');
  if (!dragId || !target || target.dataset.id === dragId) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  const nodes = [...$('#feed').children];
  for (const node of nodes) node.classList.remove('drop-before','drop-after');
  target.classList.add(nodes.findIndex(node => node.dataset.id === dragId) < nodes.indexOf(target) ? 'drop-after' : 'drop-before');
};
$('#feed').ondrop = event => {
  event.preventDefault();
  const targetId = event.target.closest('.work')?.dataset.id;
  const from = dragId;
  clearDrag();
  if (!archived && from && targetId && from !== targetId) moveWork(from, targetId);
};
$('#feed').ondragend = clearDrag;
document.addEventListener('toggle', event => {
  const dropdown = event.target;
  if (!dropdown.matches('.dropdown')) return;
  dropdown.removeAttribute('data-open-up');
  if (!dropdown.open) return;
  const panel = dropdown.querySelector('.menu').getBoundingClientRect();
  const trigger = dropdown.getBoundingClientRect();
  dropdown.toggleAttribute('data-open-up', panel.bottom > innerHeight - 8 && trigger.top > panel.height + 8);
}, true);
document.addEventListener('click', event => {
  const open = $('.dropdown[open]');
  if (open && !open.contains(event.target)) open.open = false;
});
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  const open = $('.dropdown[open]');
  if (open) {
    open.open = false;
    open.querySelector('summary').focus();
  }
});
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
    if (!editing) archived = false;
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
    tell(sort === 'priority' ? '进度已保存，保留手动优先级' : '进度已保存并重新排序');
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
  if (!DEMO) {
    setLayout(localStorage.getItem(LAYOUT_KEY));
    setSort(localStorage.getItem(SORT_KEY));
  }
  const theme = JSON.parse(localStorage.getItem('ptu.theme') || 'null');
  document.documentElement.dataset.theme = theme === 'dark' ||
    theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
} catch { /* default light theme */ }
if (EMBEDDED) {
  document.documentElement.dataset.embedded = 'nexus';
  $('.top').hidden = true;
  $('.page-title').classList.add('sr-only');
  $('#mode').href = '?embedded=nexus&demo=1';
}
if (DEMO) {
  items = sampleItems();
  $('#sample').hidden = false;
  $('#mode').href = EMBEDDED ? '?embedded=nexus' : './';
  $('#mode').textContent = '返回我的记录';
  $('#backup-menu').before($('#mode'));
  $('#backup-menu').hidden = true;
  $('#storage').textContent = '示例记录不会写入你的清单。';
} else {
  refreshView();
  addEventListener('storage', event => {
    if (event.key === SORT_KEY || event.key === null) setSort(localStorage.getItem(SORT_KEY));
    if (event.key === KEY || event.key === SORT_KEY || event.key === null) refreshView();
  });
}
render();
