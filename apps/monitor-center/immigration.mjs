const CASE_URL = 'https://my.uscis.gov/account/case-service/api/cases/';
const STORAGE_KEY = 'pt.monitor.immigration.v1';
const ROLES = ['primary', 'spouse'];
const RECEIPT = /^[A-Z]{3}\d{10}$/;
const NOTICES = new Map([
  ['Appointment Scheduled', '已安排预约'],
  ['Interview Scheduled', '已安排面试'],
  ['Request for Evidence', '补件通知'],
  ['Approval Notice', '批准通知'],
  ['Denial Notice', '拒绝通知'],
]);

export function normalizeReceipt(value) {
  return typeof value === 'string' ? value.replace(/[\s-]/g, '').toUpperCase() : '';
}

function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)?$/.test(value)) return null;
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) return null;
  const iso = new Date(milliseconds).toISOString();
  if (iso.slice(0, 10) !== value.slice(0, 10)) return null;
  return value.length === 10 ? value : iso;
}

function unique(items) {
  return [...new Map(items.map(item => [JSON.stringify(item), item])).values()]
    .sort((a, b) => (b.at || '').localeCompare(a.at || '') || JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

export function parseI485Snapshot(text) {
  if (typeof text !== 'string' || text.length > 250000) throw Error('快照过大，请确认复制的是单个案件的 JSON。');
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw Error('无法识别 JSON。请在 myUSCIS 返回页面上复制完整响应。');
  }
  const data = payload?.data;
  if (!data || payload.error) throw Error('接口未返回案件详情。请检查 myUSCIS 是否仍已登录，以及账户是否能查看该 I-485。');
  if (data.formType !== 'I-485') throw Error('此处只接受 I-485 内部详情。H-1B 请使用官方公开状态监控。');
  const receipt = normalizeReceipt(data.receiptNumber);
  if (!RECEIPT.test(receipt)) throw Error('快照缺少有效的案件号码。');
  const updatedAt = timestamp(data.updatedAtTimestamp) ?? timestamp(data.updatedAt);
  if (!updatedAt || !Array.isArray(data.events) || !Array.isArray(data.notices)) {
    throw Error('接口返回缺少更新日期、事件或通知列表。请确认使用的是内部详情接口。');
  }
  const events = unique(data.events.map(event => {
    const code = event?.eventCode;
    const at = timestamp(event?.eventTimestamp) ?? timestamp(event?.eventDateTime)
      ?? timestamp(event?.createdAtTimestamp) ?? timestamp(event?.createdAt);
    if (!at || typeof code !== 'string' || !/^[A-Z][A-Z0-9]{1,7}$/.test(code)) return null;
    return { code, at: at.length === 10 ? at : at.slice(0, 19) + 'Z' };
  }).filter(Boolean));
  const notices = unique(data.notices.map(notice => ({
    title: NOTICES.get(notice?.actionType) ?? 'USCIS 通知',
    at: timestamp(notice?.generationDate),
    appointment: timestamp(notice?.appointmentDateTime),
  })).filter(notice => notice.at || notice.appointment));
  const review = {
    actionRequired: typeof data.actionRequired === 'boolean' ? data.actionRequired : null,
    evidence: Array.isArray(data.evidenceRequests) ? data.evidenceRequests.length : null,
    documents: Array.isArray(data.documents) ? data.documents.length : null,
    closed: typeof data.closed === 'boolean' ? data.closed : null,
  };
  return { receipt, snapshot: { receivedAt: timestamp(data.submissionDate), updatedAt, events, notices, review } };
}

export function compareSnapshots(previous, current) {
  if (!previous) return '已建立基线';
  if (JSON.stringify(previous) === JSON.stringify(current)) return '没有变化';
  if (JSON.stringify(previous.notices) !== JSON.stringify(current.notices)) return '通知列表有变化';
  if (JSON.stringify(previous.review) !== JSON.stringify(current.review)) return '待办、文件或案件标记有变化';
  if (JSON.stringify(previous.events) !== JSON.stringify(current.events)) return '内部事件有变化';
  if (previous.updatedAt !== current.updatedAt) return '仅更新时间戳变化';
  return '基础字段有变化';
}

async function receiptKey(receipt, salt) {
  const input = new TextEncoder().encode(salt + ':' + receipt);
  const digest = await crypto.subtle.digest('SHA-256', input);
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
}

function readStorage() {
  try {
    const record = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (record && typeof record.salt === 'string' && record.cases && Object.hasOwn(record, 'keep')) return record;
  } catch {
    // The panel still works in memory when browser storage is unavailable.
  }
  return { salt: crypto.randomUUID(), cases: {}, keep: false };
}

const format = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'America/Los_Angeles', dateStyle: 'medium', timeStyle: 'short',
});
const showTime = value => value ? (value.length === 10 ? value : format.format(new Date(value))) : '未显示';

export function setupImmigration(panel) {
  const form = panel.querySelector('form');
  const receipt = form.elements.receipt;
  const role = form.elements.role;
  const raw = form.elements.snapshot;
  const persist = form.elements.persist;
  const feedback = panel.querySelector('[data-case-feedback]');
  const timeline = panel.querySelector('[data-case-timeline]');
  const metrics = panel.querySelector('[data-case-metrics]');
  const clear = panel.querySelector('[data-case-clear]');
  const compareResult = panel.querySelector('[data-case-compare]');
  let record = readStorage();
  let busy = false;
  const activeReceipts = new Map();

  function status(message, error = false) {
    feedback.textContent = message;
    feedback.classList.toggle('error-text', error);
  }

  function writeStorage() {
    try {
      if (record.keep) localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
      else localStorage.removeItem(STORAGE_KEY);
      return true;
    } catch {
      status('此浏览器无法更新本机历史，当前结果仍可查看。', true);
      return false;
    }
  }

  function draw() {
    const entry = record.cases[role.value];
    metrics.replaceChildren();
    timeline.replaceChildren();
    clear.hidden = !entry;
    persist.checked = record.keep;
    compareResult.textContent = entry ? entry.lastChange : '等待首次导入';
    if (!entry) return;
    const { snapshot } = entry;
    const review = snapshot.review;
    const details = [
      ['递交日', showTime(snapshot.receivedAt)],
      ['内部更新时间', showTime(snapshot.updatedAt)],
      ['上次导入', showTime(entry.observedAt)],
      ['接口待办', review.actionRequired === true ? '有标记，请查看正式通知' :
        review.actionRequired === false ? '快照未标记待办' : '未显示'],
    ];
    for (const [label, value] of details) {
      const dt = document.createElement('dt');
      const dd = document.createElement('dd');
      dt.textContent = label;
      dd.textContent = value;
      metrics.append(dt, dd);
    }
    const rows = [
      ...snapshot.notices.map(item => ({
        text: item.appointment ? item.title + ' · 预约 ' + showTime(item.appointment) : item.title,
        at: item.at,
        kind: '通知',
      })),
      ...snapshot.events.map(item => ({ text: item.code, at: item.at, kind: '内部事件' })),
      ...entry.history.map(item => ({ text: item.change, at: item.at, kind: '导入记录' })),
    ].sort((a, b) => (b.at || '').localeCompare(a.at || ''));
    for (const row of rows.slice(0, 40)) {
      const line = document.createElement('li');
      const title = document.createElement('strong');
      const time = document.createElement('span');
      title.textContent = row.kind + ' · ' + row.text;
      time.textContent = showTime(row.at);
      line.append(title, time);
      timeline.append(line);
    }
  }

  role.addEventListener('change', () => {
    receipt.value = activeReceipts.get(role.value) || '';
    raw.value = '';
    status('');
    draw();
  });
  persist.addEventListener('change', () => {
    record.keep = persist.checked;
    if (writeStorage()) status(record.keep ? '历史会保留在当前浏览器。' : '已关闭本机保留，当前页仍可查看。');
  });
  panel.querySelector('[data-case-open]').addEventListener('click', () => {
    const number = normalizeReceipt(receipt.value);
    if (!RECEIPT.test(number)) {
      status('输入 I-485 收据号后再打开接口。', true);
      receipt.focus();
      return;
    }
    activeReceipts.set(role.value, number);
    window.open(CASE_URL + number, '_blank', 'noopener,noreferrer');
    status('请在同一个 Chrome 会话登录 myUSCIS，然后将接口返回的 JSON 粘贴到下方。');
  });
  clear.addEventListener('click', () => {
    if (busy || !window.confirm('清除当前申请人的 I-485 快照和导入历史？')) return;
    delete record.cases[role.value];
    activeReceipts.delete(role.value);
    receipt.value = '';
    raw.value = '';
    if (writeStorage()) status('已清除当前申请人的快照。');
    draw();
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy || !ROLES.includes(role.value)) return;
    const selected = role.value;
    const button = event.submitter;
    busy = true;
    if (button) button.disabled = true;
    try {
      const parsed = parseI485Snapshot(raw.value);
      const entered = normalizeReceipt(receipt.value);
      if (entered && entered !== parsed.receipt) throw Error('快照和输入框中的收据号不同，请核对后重试。');
      const key = await receiptKey(parsed.receipt, record.salt);
      const previous = record.cases[selected];
      if (previous && previous.key !== key) throw Error('快照号码与此申请人的历史不符。请选择正确的申请人。');
      if (previous && Date.parse(parsed.snapshot.updatedAt) < Date.parse(previous.snapshot.updatedAt)) {
        throw Error('这个快照比当前记录旧，已保留较新的记录。');
      }
      const change = compareSnapshots(previous?.snapshot, parsed.snapshot);
      const at = new Date().toISOString();
      const history = change === '没有变化' ? (previous?.history ?? []) : [{ at, change }, ...(previous?.history ?? [])].slice(0, 10);
      record.cases[selected] = { key, snapshot: parsed.snapshot, observedAt: at, lastChange: change, history };
      activeReceipts.set(selected, parsed.receipt);
      if (selected === role.value) {
        receipt.value = parsed.receipt;
        raw.value = '';
        draw();
      }
      if (writeStorage()) status(change);
    } catch (error) {
      status(error.message, true);
    } finally {
      busy = false;
      if (button) button.disabled = false;
    }
  });
  draw();
}
