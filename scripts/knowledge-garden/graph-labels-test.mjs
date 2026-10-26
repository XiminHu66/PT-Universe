import assert from 'node:assert/strict';
import {relationSentence,relationshipGroups,nodeShape} from '../../apps/knowledge-garden/graph-labels.mjs';
const nodes=[{id:'a',label:'Agima'},{id:'s',label:'Sokoban'},{id:'p',label:'Pacman'},{id:'r',label:'RL'},{id:'g',label:'GRPO'}];
const edges=[{from:'a',to:'s',type:'evaluated_on',evidence:[{sourceId:'paper'},{sourceId:'abstract'}]},{from:'a',to:'p',type:'evaluated_on',evidence:[{sourceId:'paper'}]},{from:'r',to:'g',type:'uses',evidence:[{sourceId:'paper'}]}];
const groups=relationshipGroups({nodes,edges});
assert.equal(groups[0].sentence,'Agima 在 Sokoban、Pacman 中评测');
assert.equal(groups[0].sources.size,2);assert.equal(groups[0].edges.length,2);
assert.equal(relationSentence(edges[2],nodes),'RL 采用 GRPO');
assert.equal(relationshipGroups({nodes,edges:[{from:'a',to:'s',type:'mentions'}]}).length,0);
for(const label of ['Agima','完整中文方法名称','A very long method name that spans several different lines and needs truncation']){const shape=nodeShape(label);assert.ok(shape.width<=200);assert.ok(shape.height>=38);assert.ok(shape.lines.length<=3);assert.ok(shape.lines.join('').length>0);}
console.log('PASS: graph sentences preserve saved direction/names, group targets, deduplicate source counts, exclude mere mentions, and bound readable node geometry.');
