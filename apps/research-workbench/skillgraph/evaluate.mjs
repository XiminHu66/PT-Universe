import {facts, pathFor, questions, suiteId} from './suite.mjs';

const byId = new Map(facts.map(fact => [fact.id, fact]));
const tokenize = text => text.toLowerCase().match(/[a-z0-9]+/g) || [];
const documents = facts.map(fact => tokenize(fact.text));
const vocabulary = [...new Set(documents.flat())];
const idf = new Map(vocabulary.map(term => [
  term, 1 + Math.log((documents.length + 1) / (documents.filter(doc => doc.includes(term)).length + 1))
]));
function vector(terms) {
  const weights = new Map();
  for (const term of terms) {
    if (idf.has(term)) weights.set(term, (weights.get(term) || 0) + idf.get(term));
  }
  const norm = Math.hypot(...weights.values());
  for (const [term, weight] of weights) weights.set(term, weight / norm);
  return weights;
}
const index = facts.map((fact, i) => ({fact, weights: vector(documents[i])}));
const adjacency = new Map();
for (const entry of index) {
  const role = entry.fact.role;
  if (!adjacency.has(role)) adjacency.set(role, []);
  adjacency.get(role).push(entry);
}
const matches = (fact, question) =>
  fact.relation === question.relation &&
  (question.goal !== 'topic' || fact.topic === question.filter) &&
  (question.goal !== 'training' || fact.skill === question.filter);

export function runSuite(topK = 3) {
  if (!Number.isInteger(topK) || topK < 1 || topK > 10) throw Error('Top K 必须为 1–10 的整数。');
  const runs = ['vector', 'graph'].map(method => ({
    method, label: method === 'vector' ? 'TF-IDF 向量检索' : '关系约束检索',
    cases: questions.map(question => {
      const started = performance.now();
      const query = vector(tokenize(question.query));
      const pool = method === 'graph'
        ? adjacency.get(question.role).filter(({fact}) => matches(fact, question)) : index;
      const ranked = pool.map(({fact, weights}) => ({
        fact, score: [...query].reduce((sum, [term, weight]) => sum + weight * (weights.get(term) || 0), 0)
      })).sort((a, b) => b.score - a.score || a.fact.id.localeCompare(b.fact.id)).slice(0, topK);
      const retrieved = ranked.map(({fact}) => fact.id);
      // Identical evidence reader for both retrievers. It can only use returned facts.
      const answers = ranked.filter(({fact}) => fact.role === question.role && matches(fact, question))
        .map(({fact}) => ({id: fact.id, citation: fact.id, path: pathFor(fact, question.goal)}));
      return {id: question.id, retrieved, answers, latencyMs: performance.now() - started, costUsd: 0};
    })
  }));
  return {suiteId, topK, runs};
}

export function scoreCase(question, result) {
  const expected = new Set(question.expected);
  const retrieved = new Set(result.retrieved);
  const answers = new Set(result.answers.map(answer => answer.id));
  const missed = [...expected].filter(id => !retrieved.has(id));
  const wrong = [...answers].some(id => !expected.has(id)) || [...expected].some(id => !answers.has(id)) ||
    result.answers.some(answer => byId.has(answer.id) && expected.has(answer.id) &&
      JSON.stringify(answer.path) !== JSON.stringify(pathFor(byId.get(answer.id), question.goal)));
  const unsupported = result.answers.some(answer => answer.citation !== answer.id || !retrieved.has(answer.citation));
  const failure = missed.length ? 'recall' : wrong ? 'relation' : unsupported ? 'citation' : null;
  return {failure, hits: expected.size - missed.length, expected: expected.size, missed};
}

export function summarize(run) {
  const rows = questions.map((question, i) => ({question, result: run.cases[i], ...scoreCase(question, run.cases[i])}));
  const hit = rows.reduce((n, row) => n + row.hits, 0);
  const total = rows.reduce((n, row) => n + row.expected, 0);
  const latency = rows.map(row => row.result.latencyMs).filter(Number.isFinite).sort((a, b) => a - b);
  const cost = rows.map(row => row.result.costUsd);
  return {rows, passed: rows.filter(row => !row.failure).length, recall: hit / total,
    p50: latency.length ? (latency[Math.floor((latency.length - 1) / 2)] + latency[Math.floor(latency.length / 2)]) / 2 : null,
    latencyCount: latency.length, costUsd: cost.every(Number.isFinite) ? cost.reduce((a, b) => a + b, 0) : null};
}

export function validateReport(input) {
  const invalid = () => { throw Error('结果格式无效。请使用同一题集、Top K 和两组完整逐题结果。'); };
  const {topK, runs} = input || {};
  if (input?.suiteId !== suiteId || !Number.isInteger(topK) || topK < 1 || topK > 10 ||
      !Array.isArray(runs) || runs.length !== 2 || new Set(runs.map(run => run?.method)).size !== 2) invalid();
  return {suiteId, topK, runs: ['vector', 'graph'].map(method => {
    const run = runs.find(entry => entry?.method === method);
    if (!run || typeof run.label !== 'string' || !run.label.trim() || run.label.length > 80 ||
        !Array.isArray(run.cases) || run.cases.length !== questions.length) invalid();
    const cases = new Map(run.cases.map(result => [result?.id, result]));
    return {method, label: run.label, cases: questions.map(({id}) => {
      const result = cases.get(id);
      if (!result || !Array.isArray(result.retrieved) || result.retrieved.length > topK ||
          new Set(result.retrieved).size !== result.retrieved.length || !result.retrieved.every(x => byId.has(x)) ||
          !Array.isArray(result.answers) || result.answers.length > facts.length ||
          new Set(result.answers.map(answer => answer?.id)).size !== result.answers.length) invalid();
      const answers = result.answers.map(answer => {
        if (!answer || typeof answer.id !== 'string' || !answer.id || answer.id.length > 80 ||
            !(answer.citation == null || typeof answer.citation === 'string' && answer.citation.length <= 80) ||
            !Array.isArray(answer.path) || answer.path.length > 5 ||
            !answer.path.every(part => typeof part === 'string' && part.length <= 120)) invalid();
        return {id: answer.id, citation: answer.citation ?? null, path: [...answer.path]};
      });
      for (const value of [result.latencyMs, result.costUsd]) {
        if (value != null && (!Number.isFinite(value) || value < 0 || value > 1e9)) invalid();
      }
      return {id, retrieved: [...result.retrieved], answers, latencyMs: result.latencyMs ?? null, costUsd: result.costUsd ?? null};
    })};
  })};
}
