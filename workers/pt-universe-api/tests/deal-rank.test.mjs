import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {makeEnv} from './deal-lab-harness.mjs';
const result=await build({entryPoints:['src/deal-rank.ts'],bundle:true,format:'esm',platform:'node',write:false});
const {recordRankPage,readRankTrends}=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
let env=makeEnv();const item=(appid,rank)=>({appid,rank,title:'Game '+appid});
await recordRankPage(env,[item(1,1),item(2,2)],0,101,'2026-10-01T12:00:00Z');
let trends=await readRankTrends(env,30,Date.parse('2026-10-29T12:00:00Z'));assert.equal(trends.completeDays,0);assert.equal(trends.newEntryBaseline,null);assert.equal(trends.observedDays,1);assert.equal(trends.monthlyAddCountsAvailable,false);
await recordRankPage(env,[item(99,101)],1,101,'2026-10-01T12:00:10Z');
await recordRankPage(env,[item(3,1),item(1,2),item(2,3)],0,3,'2026-10-29T12:00:00Z');
trends=await readRankTrends(env,30,Date.parse('2026-10-29T12:00:00Z'));assert.equal(trends.completeDays,2);assert.equal(trends.observedDays,2);assert.equal(trends.items.find(x=>x.appid===1).averageRank,1.5);assert.equal(trends.items.find(x=>x.appid===1).change,-1);assert.equal(trends.items.find(x=>x.appid===3).newEntryConfirmed,true);assert.ok(trends.historyWarning.includes('仅观测2天'));
// A reread in one day updates its observation, never doubles its weight or invents another date.
await recordRankPage(env,[item(1,1)],0,3,'2026-10-29T15:00:00Z');trends=await readRankTrends(env,30,Date.parse('2026-10-29T16:00:00Z'));assert.equal(trends.items.find(x=>x.appid===1).observedDays,2);assert.equal(trends.items.find(x=>x.appid===1).averageRank,1);
console.log('PASS: rank history uses actual SQLite daily observations, complete-page coverage, real averages, partial-month disclosure and reliable new-entry baselines; no wishlist counts.');

// A real 100-row page uses four bounded inserts, rather than 100 D1 statements.
const bounded=makeEnv();const originalPrepare=bounded.DB.prepare.bind(bounded.DB);let inserts=0;bounded.DB.prepare=sql=>{const q=originalPrepare(sql);if(sql.startsWith('INSERT INTO deal_lab_rank_daily')){inserts++;const bind=q.bind.bind(q);q.bind=(...values)=>{assert.ok(values.length<=100);return bind(...values);};}return q;};await recordRankPage(bounded,Array.from({length:100},(_,i)=>item(i+1,i+1)),0,100,'2026-10-29T12:00:00Z');assert.equal(inserts,4);assert.equal((await readRankTrends(bounded)).items.length,100);console.log('PASS: complete 100-row snapshots respect D1 query and parameter budgets.');
