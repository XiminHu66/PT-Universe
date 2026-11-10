export const suiteId = 'skillgraph-public-v1';
export const roles = {
  ds: 'Data Scientist', ml: 'ML Engineer', de: 'Data Engineer', rs: 'Research Scientist'
};
export const topics = {
  stats: 'Statistics', mlops: 'ML Operations', data: 'Data Platforms', research: 'Research Methods'
};
export const skills = {
  ab: ['A/B Testing', 'stats', 'Randomization and controlled experiment analysis', 'Experiment Design Lab'],
  causal: ['Causal Inference', 'stats', 'Estimate treatment effects from observational data', 'Causal Methods Lab'],
  sql: ['SQL', 'data', 'Query, join and aggregate tabular data', 'SQL Practice Lab'],
  dash: ['Data Visualization', 'stats', 'Communicate results with plots and dashboards', 'Visualization Studio'],
  eval: ['Model Evaluation', 'mlops', 'Use validation splits and evaluate predictive metrics', 'Evaluation Lab'],
  serve: ['Model Serving', 'mlops', 'Deploy and monitor model inference endpoints', 'Serving Lab'],
  ci: ['CI/CD', 'mlops', 'Automate validation and release pipelines', 'Release Engineering Lab'],
  orch: ['Data Orchestration', 'data', 'Schedule and operate dependency-aware data workflows', 'Pipeline Lab'],
  stream: ['Stream Processing', 'data', 'Process event-time data and streaming windows', 'Streaming Lab'],
  repro: ['Reproducibility', 'research', 'Pin datasets, environments and random seeds', 'Reproducibility Lab'],
  review: ['Literature Review', 'research', 'Compare published methods and synthesize evidence', 'Literature Review Lab'],
  ablation: ['Ablation Studies', 'research', 'Isolate the effect of a model component', 'Ablation Lab']
};
const requirements = {
  ds: {critical: ['ab', 'eval'], required: ['sql', 'causal', 'dash']},
  ml: {critical: ['serve', 'eval'], required: ['ci', 'repro', 'sql']},
  de: {critical: ['orch', 'sql'], required: ['stream', 'ci', 'dash']},
  rs: {critical: ['repro', 'ablation'], required: ['causal', 'eval', 'review']}
};
export const facts = Object.entries(requirements).flatMap(([role, groups]) =>
  Object.entries(groups).flatMap(([relation, ids]) => ids.map(skill => {
    const [label, topic, description] = skills[skill];
    return {id: role + '-' + skill, role, relation, skill, topic,
      text: `${roles[role]} · ${relation} · ${label} · ${topics[topic]}. ${description}.`};
  }))
);
export function pathFor(fact, goal) {
  const path = [roles[fact.role], fact.relation.toUpperCase(), skills[fact.skill][0]];
  if (goal === 'topic') path.push('BELONGS_TO', topics[fact.topic]);
  if (goal === 'training') path.push('TRAINED_BY', skills[fact.skill][3]);
  return path;
}

// The explicit search filters belong to the query contract. Gold IDs are separate
// and are used only by the scorer, never by either retriever.
const cases = [
  ['01', 'What skills are critical for a Data Scientist?', 'ds', 'critical', 'skills', null, ['ds-ab', 'ds-eval']],
  ['02', 'What other skills are required of a Data Scientist?', 'ds', 'required', 'skills', null, ['ds-sql', 'ds-causal', 'ds-dash']],
  ['03', 'What is critical to ML Engineer work?', 'ml', 'critical', 'skills', null, ['ml-serve', 'ml-eval']],
  ['04', 'Find required skills for the ML Engineer role.', 'ml', 'required', 'skills', null, ['ml-ci', 'ml-repro', 'ml-sql']],
  ['05', 'What is critical in Data Engineer work?', 'de', 'critical', 'skills', null, ['de-orch', 'de-sql']],
  ['06', 'List required skills for a Research Scientist.', 'rs', 'required', 'skills', null, ['rs-causal', 'rs-eval', 'rs-review']],
  ['07', 'Find critical Data Scientist skills in Statistics.', 'ds', 'critical', 'topic', 'stats', ['ds-ab']],
  ['08', 'Find required Data Engineer skills in Data Platforms.', 'de', 'required', 'topic', 'data', ['de-stream']],
  ['09', 'Find required Research Scientist skills in Research Methods.', 'rs', 'required', 'topic', 'research', ['rs-review']],
  ['10', 'Find critical ML Engineer skills in ML Operations.', 'ml', 'critical', 'topic', 'mlops', ['ml-serve', 'ml-eval']],
  ['11', 'Find required ML Engineer skills in Research Methods.', 'ml', 'required', 'topic', 'research', ['ml-repro']],
  ['12', 'Find required Data Scientist skills in Statistics.', 'ds', 'required', 'topic', 'stats', ['ds-causal', 'ds-dash']],
  ['13', 'Which lab trains Model Evaluation, a critical ML Engineer skill?', 'ml', 'critical', 'training', 'eval', ['ml-eval']],
  ['14', 'Which lab trains SQL for a Data Engineer, where it is critical?', 'de', 'critical', 'training', 'sql', ['de-sql']],
  ['15', 'Which lab trains required Causal Inference for a Data Scientist?', 'ds', 'required', 'training', 'causal', ['ds-causal']],
  ['16', 'Which lab trains critical Reproducibility for a Research Scientist?', 'rs', 'critical', 'training', 'repro', ['rs-repro']],
  ['17', 'Find critical Research Scientist skills in Data Platforms.', 'rs', 'critical', 'topic', 'data', []],
  ['18', 'Which lab trains critical SQL for a Data Scientist?', 'ds', 'critical', 'training', 'sql', []],
  ['19', 'Find required Data Engineer skills in Research Methods.', 'de', 'required', 'topic', 'research', []],
  ['20', 'Which lab trains required Model Serving for a Research Scientist?', 'rs', 'required', 'training', 'serve', []]
];
export const questions = cases.map(([id, query, role, relation, goal, filter, expected]) =>
  ({id, query, role, relation, goal, filter, expected}));
