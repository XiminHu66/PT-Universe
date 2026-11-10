import assert from 'node:assert/strict';
import {questions} from '../../apps/research-workbench/skillgraph/suite.mjs';
import {runSuite, scoreCase, summarize, validateReport} from '../../apps/research-workbench/skillgraph/evaluate.mjs';

const report = runSuite(3);
assert.equal(questions.length, 20);
assert.deepEqual(validateReport(JSON.parse(JSON.stringify(report))), report);
assert.equal(summarize(report.runs[0]).passed, 15);
assert.equal(summarize(report.runs[1]).passed, 20);
assert.ok(summarize(runSuite(1).runs[1]).recall < 1);

const question = questions[0];
const good = report.runs[1].cases[0];
assert.equal(scoreCase(question, {...good, retrieved: []}).failure, 'recall');
assert.equal(scoreCase(question, {...good, answers: [{...good.answers[0], path: []}, good.answers[1]]}).failure, 'relation');
assert.equal(scoreCase(question, {...good, answers: [{...good.answers[0], citation: null}, good.answers[1]]}).failure, 'citation');
const negative = report.runs[1].cases.at(-1);
assert.deepEqual(negative.answers, []);
assert.equal(scoreCase(questions.at(-1), {...negative, answers: good.answers}).failure, 'relation');
const bad = structuredClone(report);
bad.runs[0].cases[0].retrieved.push('unknown-fact');
assert.throws(() => validateReport(bad));
assert.throws(() => runSuite(0));
console.log('PASS: 20 SkillGraph cases, shared Top K, abstention, three failure classes and report validation');
