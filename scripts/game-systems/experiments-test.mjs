import assert from 'node:assert/strict';
import {recipeStudy,prepareStudy,rowConfig,assessStudy,validateStudy,setParameter} from '../../apps/game-systems-studio/experiments.mjs';
import {runStudy} from '../../apps/game-systems-studio/experiment-worker.mjs';
import {readWorkspace,KEYS,configurationDiff} from '../../apps/game-systems-studio/workspace.mjs';
import {applyStudyCandidate,recordStudyDecision} from '../../apps/game-systems-studio/study-actions.mjs';
const studies={};
for(const type of ['cards','incremental','rpg']){
 const spec=recipeStudy(type),snapshot=structuredClone(spec),events=[];
 const result=runStudy(spec,p=>events.push(p));studies[type]=result;
 assert.deepEqual(spec,snapshot);assert.equal(events.at(-1),1);assert.equal(JSON.stringify(validateStudy(result,type)),JSON.stringify(result));
 assert.equal(result.rows[0].id,'base');
 for(const row of result.rows){const diff=configurationDiff(result.baseConfig,rowConfig(result,row));assert.equal(diff.length,row.id==='base'?0:1)}
 const repeat=runStudy(spec);assert.deepEqual(assessStudy(result).rows.map(x=>x.metricValue),assessStudy(repeat).rows.map(x=>x.metricValue));
 const storage={getItem:()=>null},state={...readWorkspace(storage,type).state,studies:[result]},before=JSON.stringify(state);
 const keep=recordStudyDecision(state,result.id,'keep','base','保留原方案，等待实测');assert.deepEqual(keep.data,state.data);assert.equal(keep.last,null);assert.equal(keep.baseline,null);assert.equal(JSON.stringify(state),before);
 const row=assessStudy(result).best,adopt=applyStudyCandidate(state,state.data,result,row.id,'达到了设定的体验范围');assert.deepEqual(adopt.data,rowConfig(result,row));assert.deepEqual(adopt.history[0].data,state.data);assert.equal(adopt.last.hash,row.hash);assert.equal(adopt.baseline.hash,result.rows[0].hash);assert.deepEqual(adopt.studies[0].replacedExperiments,{last:state.last,baseline:state.baseline});assert.equal(JSON.stringify(state),before);
 assert.equal(readWorkspace({getItem:()=>JSON.stringify(adopt)},type).blocked,false);
 const tamper=structuredClone(adopt);tamper.studies[0].rows[0].hash='wrong';const raw=JSON.stringify(tamper);assert.equal(readWorkspace({getItem:()=>raw},type).blocked,true);
 assert.throws(()=>applyStudyCandidate(state,state.data,result,row.id,''));assert.throws(()=>recordStudyDecision(state,result.id,'adopt',row.id,'x'));
}
assert.equal(studies.cards.rows.find(r=>r.value===3).result.wins,643);assert.equal(studies.cards.rows.find(r=>r.value===4).result.wins,789);assert.equal(assessStudy(studies.cards).best.value,4);
assert.equal(assessStudy(studies.incremental).best.value,8000);assert.equal(assessStudy(studies.rpg).best.value,.144);
const spec=recipeStudy('cards'),base={config:spec.baseConfig,title:spec.title,parameter:spec.parameter,values:[3,4],metric:spec.metric,min:70,max:80,runs:1000,seed:42};
for(const bad of [{parameter:'__proto__:polluted'},{values:[NaN]},{values:[3]},{values:Array(8).fill(4)},{min:81,max:80},{max:101},{runs:10001},{seed:-1}])assert.throws(()=>prepareStudy({...base,...bad}));
assert.throws(()=>setParameter(base.config,'cards:bleed:cost',1.5));
const current=runStudy(prepareStudy(base)),state={...readWorkspace({getItem:()=>null},'cards').state,studies:[current]},changed=structuredClone(state.data);changed.name+=' changed';assert.throws(()=>applyStudyCandidate(state,changed,current,'v0','调整'),/发生变化/);
const noGoal=structuredClone(studies.incremental);noGoal.rows.forEach(r=>r.result.goalTime=null);assert.equal(assessStudy(noGoal).best,null);assert.equal(assessStudy(noGoal).allUnreached,true);
console.log('PASS: reproducible controlled studies across 3 engines, single-variable isolation, target ranking, null-goal handling, bounded validation, drift protection, decision/adoption, and full-backup roundtrip');

const prior={...state,last:{id:'old-last'},baseline:{id:'old-base'}};const archived=applyStudyCandidate(prior,state.data,current,'v0','保留旧实验');assert.deepEqual(archived.studies[0].replacedExperiments,{last:prior.last,baseline:prior.baseline});
