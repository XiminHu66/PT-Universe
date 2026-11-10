export const TYPES = {
  game: ['游戏', '游'],
  anime: ['动画', '番'],
  manga: ['漫画', '漫'],
  novel: ['小说', '读'],
  other: ['其他', '集']
};

const byTime = (a, b) => b.at - a.at || b.id.localeCompare(a.id);
const atTime = value => Number.isSafeInteger(value) && value >= 0 && value <= 8640000000000000;
const validId = value => typeof value === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(value);

export function cleanUrl(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  try {
    const url = new URL(text);
    if (text.length <= 2048 && url.href.length <= 2048 && ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password) return url.href;
  } catch { /* report a single error for unsupported and malformed links */ }
  throw Error('请输入有效的 http 或 https 外链。');
}

function cleanTags(value) {
  const values = Array.isArray(value) ? value : String(value ?? '').split(/[,，、]/u);
  const tags = new Map();
  for (const value of values) {
    const label = String(value).trim();
    if (!label) continue;
    if (label.length > 24) throw Error('单个标签最多 24 个字符。');
    const key = tagKey(label);
    if (!tags.has(key)) tags.set(key, label);
  }
  if (tags.size > 8) throw Error('每个作品最多 8 个标签。');
  return [...tags.values()];
}

export const tagKey = value => value.normalize('NFKC').toLowerCase();

export function fields(value) {
  const title = String(value.title ?? '').trim();
  if (!title || title.length > 120) throw Error('请输入 1–120 个字符的作品名称。');
  if (!Object.hasOwn(TYPES, value.type)) throw Error('请选择作品类型。');
  return {title, type: value.type, tags: cleanTags(value.tags), url: cleanUrl(value.url)};
}

function cleanProgress(value, optional = false) {
  const progress = String(value ?? '').trim();
  if ((!progress && !optional) || progress.length > 240) throw Error('请输入 1–240 个字符的进度。');
  return progress;
}

export const latest = item => item.records[0];
export const recordedAt = item => latest(item)?.at ?? item.createdAt;

export function createItem(value, now = Date.now(), id = crypto.randomUUID()) {
  const progress = cleanProgress(value.progress, true);
  return {id, ...fields(value), createdAt: now, editedAt: now,
    priority: null, priorityAt: 0, completedAt: null, statusAt: 0,
    records: progress ? [{id: crypto.randomUUID(), at: now, progress}] : []};
}

export function addRecord(item, value, now = Date.now(), id = crypto.randomUUID()) {
  const at = Math.max(now, recordedAt(item) + 1);
  if (!atTime(at)) throw Error('记录时间超出可保存范围。');
  const record = {id, at, progress: cleanProgress(value)};
  return {...item, records: [record, ...item.records]};
}

const recentFirst = (a, b) => recordedAt(b) - recordedAt(a) || b.createdAt - a.createdAt || b.id.localeCompare(a.id);
const priorityFirst = (a, b) => (a.priority ?? Infinity) - (b.priority ?? Infinity) || recentFirst(a, b);

export function visibleItems(items, {type = '', tag = '', query = '', completed = false, sort = 'recent'} = {}) {
  const needle = tagKey(query.trim());
  return items.filter(item => (item.completedAt != null) === completed && (!type || item.type === type) &&
    (!tag || item.tags.some(label => tagKey(label) === tag)) &&
    (!needle || [item.title, ...item.tags, latest(item)?.progress || ''].some(value => tagKey(value).includes(needle))))
    .sort(completed ? (a,b) => b.completedAt - a.completedAt || recentFirst(a,b) : sort === 'priority' ? priorityFirst : recentFirst);
}

export function setCompleted(item, completed, now = Date.now()) {
  const statusAt = Math.max(now, (item.statusAt ?? 0) + 1);
  if (!atTime(statusAt)) throw Error('完成时间超出可保存范围。');
  return {...item, completedAt: completed ? statusAt : null, statusAt};
}

// Move within the filtered queue, leaving all hidden works in their original slots.
export function reorderItems(items, id, targetId, filter = {}, now = Date.now()) {
  const sort = filter.sort ?? 'priority';
  const shown = visibleItems(items, {...filter, completed:false, sort});
  const from = shown.findIndex(item => item.id === id);
  const to = shown.findIndex(item => item.id === targetId);
  if (from < 0 || to < 0) throw Error('作品已变化，请重新调整顺序。');
  if (from === to) return items;
  const visibleIds = new Set(shown.map(item => item.id));
  shown.splice(to, 0, shown.splice(from, 1)[0]);
  let index = 0;
  const ordered = [...items].sort(sort === 'recent' ? recentFirst : priorityFirst).map(item => visibleIds.has(item.id) ? shown[index++] : item);
  const priorityAt = items.reduce((at,item) => Math.max(at, (item.priorityAt ?? 0) + 1), now);
  if (!atTime(priorityAt)) throw Error('排序时间超出可保存范围。');
  return ordered.map((item,priority) => ({...item, priority, priorityAt}));
}

export function parseBackup(value) {
  if (value?.version !== 1 || !Array.isArray(value.items)) throw Error('请选择从作品记录导出的 JSON 文件。');
  const ids = new Set();
  return value.items.map(item => {
    if (!validId(item?.id) || ids.has(item.id) || !atTime(item.createdAt) || !atTime(item.editedAt) ||
        typeof item.title !== 'string' || typeof item.url !== 'string' ||
        (item.priority != null && (!Number.isSafeInteger(item.priority) || item.priority < 0)) ||
        (item.priorityAt !== undefined && !atTime(item.priorityAt)) ||
        (item.completedAt != null && !atTime(item.completedAt)) ||
        (item.statusAt !== undefined && !atTime(item.statusAt)) ||
        !Array.isArray(item.records) || !Array.isArray(item.tags) || !item.tags.every(tag => typeof tag === 'string')) {
      throw Error('备份包含格式不正确的作品。');
    }
    ids.add(item.id);
    const recordIds = new Set();
    const records = item.records.map(record => {
      if (!validId(record?.id) || recordIds.has(record.id) || !atTime(record.at) || typeof record.progress !== 'string') {
        throw Error('备份包含格式不正确的进度记录。');
      }
      recordIds.add(record.id);
      return {id: record.id, at: record.at, progress: cleanProgress(record.progress)};
    }).sort(byTime);
    return {id: item.id, ...fields(item), createdAt: item.createdAt, editedAt: item.editedAt, records,
      priority: item.priority ?? null, priorityAt: item.priorityAt ?? 0,
      completedAt: item.completedAt ?? null, statusAt: item.statusAt ?? item.completedAt ?? 0};
  });
}

export function mergeItems(current, incoming) {
  const items = new Map(current.map(item => [item.id, item]));
  for (const next of incoming) {
    const old = items.get(next.id);
    if (!old) {
      items.set(next.id, next);
      continue;
    }
    const newer = next.editedAt > old.editedAt ? next : old;
    const priority = (next.priorityAt ?? 0) > (old.priorityAt ?? 0) ? next : old;
    const status = (next.statusAt ?? 0) > (old.statusAt ?? 0) ? next : old;
    const records = new Map(next.records.map(record => [record.id, record]));
    for (const record of old.records) records.set(record.id, record);
    items.set(next.id, {...newer, createdAt: Math.min(old.createdAt, next.createdAt),
      priority: priority.priority ?? null, priorityAt: priority.priorityAt ?? 0,
      completedAt: status.completedAt ?? null, statusAt: status.statusAt ?? 0,
      records: [...records.values()].sort(byTime)});
  }
  return [...items.values()];
}
