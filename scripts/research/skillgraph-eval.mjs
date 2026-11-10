import {facts, questions, roles, skills, topics, suiteId} from '../../apps/research-workbench/skillgraph/suite.mjs';
import {runSuite} from '../../apps/research-workbench/skillgraph/evaluate.mjs';

const arg = process.argv[2];
if (arg === '--suite') {
  console.log(JSON.stringify({suiteId, roles, skills, topics, facts, questions}, null, 2));
} else if (arg === '--help') {
  console.log('node scripts/research/skillgraph-eval.mjs [1–10 | --suite]');
} else {
  console.log(JSON.stringify(runSuite(arg === undefined ? 3 : Number(arg)), null, 2));
}
