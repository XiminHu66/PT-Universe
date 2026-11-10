import {facts, pathFor, suiteId} from './suite.mjs';
import {runSuite, summarize, validateReport} from './evaluate.mjs';

const $ = selector => document.querySelector(selector);
const esc = text => String(text ?? '').replace(/[&<>"']/g, c =>
  ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[c]);
const labels = {recall: '召回失败', relation: '关系失败', citation: '引用失败'};
const byId = new Map(facts.map(fact => [fact.id, fact]));
const format = (value, formatter) => value == null ? '未知' : formatter(value);
const badge = row => `<span class="badge ${row.failure ? 'fail' : 'pass'}">${labels[row.failure] || '通过'}</span>`;
let report;
let imported = false;

function status(text, error = false) {
  $('#status').textContent = text;
  $('#status').toggleAttribute('data-error', error);
}

function renderResult(row, label) {
  const {result} = row;
  const answer = result.answers.map(item =>
    `<li>${esc(item.path.join(' → ') || item.id)} <small>[${esc(item.citation ?? '无引用')}]</small></li>`).join('');
  const evidence = result.retrieved.map(id => `<li><code>${esc(id)}</code> ${esc(byId.get(id).text)}</li>`).join('');
  return `<div class="result"><h3>${esc(label)} ${badge(row)}</h3>
    <p>召回 ${row.hits}/${row.expected} · ${format(result.latencyMs, n => n.toFixed(2) + ' ms')} · ${format(result.costUsd, n => '$' + n.toFixed(4))}</p>
    ${row.missed.length ? `<p>缺失证据 ${esc(row.missed.join('、'))}</p>` : ''}
    ${answer ? `<ul class="answer">${answer}</ul>` : '<p>未给出答案</p>'}
    <div class="evidence">返回证据${evidence ? `<ol>${evidence}</ol>` : ' · 无'}</div></div>`;
}

function render() {
  const filter = $('#filter').value;
  const [left, right] = report.runs.map(summarize);
  $('#summary').innerHTML = [left, right].map((summary, i) => `<article class="panel">
    <h3>${esc(report.runs[i].label)}</h3><dl class="metrics">
    <div><dt>通过</dt><dd>${summary.passed}/${summary.rows.length}</dd></div>
    <div><dt>Recall@${report.topK}</dt><dd>${(summary.recall * 100).toFixed(1)}%</dd></div>
    <div><dt>P50 延迟 (${summary.latencyCount}/${summary.rows.length})</dt><dd>${format(summary.p50, n => n.toFixed(2) + ' ms')}</dd></div>
    <div><dt>总 API 费用</dt><dd>${format(summary.costUsd, n => '$' + n.toFixed(4))}</dd></div></dl></article>`).join('');
  $('#cases').innerHTML = left.rows.map((a, i) => {
    const b = right.rows[i], q = a.question;
    if (filter === 'failed' && !a.failure && !b.failure ||
        filter === 'different' && a.failure === b.failure && a.hits === b.hits ||
        filter === 'negative' && q.expected.length ||
        Object.hasOwn(labels, filter) && a.failure !== filter && b.failure !== filter) return '';
    const expected = q.expected.map(id => pathFor(byId.get(id), q.goal).join(' → ')).join('；');
    return `<details class="case"><summary><span class="case-id">${q.id}</span><strong>${esc(q.query)}</strong>
      <span class="marks"><span aria-label="向量检索">${badge(a)}</span><span aria-label="关系检索">${badge(b)}</span></span></summary>
      <p class="expected">期望 · ${esc(expected || '应拒答 · 无符合约束的证据')}</p>
      <div class="results">${renderResult(a, report.runs[0].label)}${renderResult(b, report.runs[1].label)}</div></details>`;
  }).join('') || '<p>没有符合筛选条件的题目。</p>';
}
function run() {
  report = runSuite(Number($('#top-k').value));
  imported = false;
  render();
  status(`本机已评测 ${report.runs[0].cases.length} 道题 · Top ${report.topK}`);
}
$('#run-form').onsubmit = event => { event.preventDefault(); run(); };
$('#filter').onchange = render;
$('#import').onclick = () => $('#file').click();
$('#file').onchange = async event => {
  const input = event.target;
  try {
    const file = input.files[0];
    if (!file) return;
    if (file.size > 1024 * 1024) throw Error('请选择小于 1 MiB 的 JSON 结果。');
    report = validateReport(JSON.parse(await file.text()));
    imported = true;
    $('#top-k').value = String(report.topK);
    render();
    status(`已按 ${suiteId} 重算导入结果 · Top ${report.topK}`);
  } catch (error) { status('导入失败 · ' + error.message, true); }
  finally { input.value = ''; }
};
$('#export').onclick = () => {
  const blob = new Blob([JSON.stringify(report, null, 2)], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${suiteId}-${imported ? 'import' : 'local'}-k${report.topK}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
run();
