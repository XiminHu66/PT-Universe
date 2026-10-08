import {zoomLevel} from '../../apps/research-workbench/graph-motion.mjs';
import assert from 'node:assert/strict';
import {visibleGraph} from '../../apps/research-workbench/graph-view.mjs';

const nodes=[{id:'a',name:'Graph paper',type:'Paper'},{id:'b',name:'Graph retrieval',type:'Method'},{id:'c',name:'HotpotQA',type:'Dataset'},{id:'d',name:'RAG',type:'Topic'},{id:'e',name:'Unconnected object',type:'Model'}];
const edges=[{from:'a',to:'b',type:'uses',inferred:true},{from:'b',to:'c',type:'evaluated_on'},{from:'a',to:'d',type:'classified_as',inferred:true}];
const data={nodes,edges},original=structuredClone(data);
assert.deepEqual(visibleGraph(data).nodes.map(n=>n.id),['a','b','c','e']);
assert.equal(visibleGraph(data,{topics:true}).edges.length,3);
assert.deepEqual(visibleGraph(data,{type:'Paper'}).nodes.map(n=>n.id),['a','b']); // One hop, no cascading expansion.
assert.deepEqual(visibleGraph(data,{term:'HOTPOT'}).nodes.map(n=>n.id),['c','b']);
assert.equal(visibleGraph(data,{origin:'manual'}).edges.length,1);
assert.equal(visibleGraph(data,{origin:'candidate'}).edges.length,1);
assert.deepEqual(visibleGraph(data,{focus:'b'}).nodes.map(n=>n.id),['a','b','c']);
assert.equal(visibleGraph(data,{term:'missing'}).nodes.length,0);
const large={nodes:Array.from({length:300},(_,i)=>({id:String(i),name:'Object '+i,type:'Method'})),edges:Array.from({length:299},(_,i)=>({from:String(i),to:String(i+1),type:'extends'}))};
const limited=visibleGraph(large);
assert.equal(limited.total,300);assert.equal(limited.nodes.length,250);
assert.ok(limited.edges.every(e=>limited.nodes.some(n=>n.id===e.from)&&limited.nodes.some(n=>n.id===e.to)));
assert.equal(visibleGraph(large,{term:'Object 299'}).nodes[0].id,'299');
assert.deepEqual(data,original);
console.log('Graph filtering passed: one-hop context, source filters, topics, search, focus and bounded edge integrity');

assert.ok(zoomLevel(1,-120)>1.7);
assert.equal(zoomLevel(1,-7.5,1),zoomLevel(1,-120));
assert.equal(zoomLevel(1,-0.2,2,600),zoomLevel(1,-120));
assert.equal(zoomLevel(3.5,-120),3.5);assert.equal(zoomLevel(0.08,120),0.08);
assert.ok(Math.abs(zoomLevel(zoomLevel(1,-120),120)-1)<1e-10);
console.log('Zoom normalization passed: mouse/trackpad units, reversible scaling and boundaries');
