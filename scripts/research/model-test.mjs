import assert from 'node:assert/strict';
import {empty,normalize,upsertPaper,extract,evidenceStatus,importExtraction,merge,graph,compareMarkdown,paragraphs,identity,safeUrl} from '../../apps/research-workbench/model.mjs';
let {state,paper}=upsertPaper(empty(),{title:'Graph retrieval study',url:'https://arxiv.org/abs/2404.16130v1',arxivId:'2404.16130',abstract:'We propose graph retrieval for multi-hop question answering. We evaluate on HotpotQA. Our method improves F1 by 4.6.',authors:['Test'],source:'arXiv'});
paper=extract(paper);assert.ok(paper.fields.idea?.value);assert.ok(paper.fields.dataset?.value);assert.equal(evidenceStatus(paper.fields.idea,paper),'matched');
assert.equal(evidenceStatus({...paper.fields.idea,confirmed:true},paper),'confirmed');assert.equal(evidenceStatus({...paper.fields.idea,quote:'Fabricated result'},paper),'mismatch');
const ai=importExtraction(paper,{fields:{results:{value:'Incorrect interpretation',quote:'Fabricated',paragraphId:'p1'}}});assert.equal(evidenceStatus(ai.fields.results,ai),'mismatch');assert.equal(ai.fields.results.confirmed,false);
state.papers[0]=paper;assert.equal(upsertPaper(state,{title:'Same version',url:'https://arxiv.org/abs/2404.16130v2',arxivId:'2404.16130'}).duplicate.id,paper.id);
assert.equal(identity({arxivId:'2404.16130v4'}),identity(paper));assert.equal(safeUrl('javascript:alert(1)'), '');assert.equal(safeUrl('https://user:pass@example.com'),'');
const deleted=structuredClone(state);deleted.papers[0].deleted=true;deleted.papers[0].updatedAt++;assert.equal(merge(state,deleted).papers[0].deleted,true);
const other=structuredClone(empty());other.entities.push({id:'method-1',name:'Hybrid Retrieval',type:'Method',updatedAt:Date.now(),paperId:paper.id});assert.equal(merge(state,other).entities.length,1);
const g=graph(state);assert.ok(g.nodes.some(n=>n.type==='Method'));assert.ok(g.edges.every(e=>e.inferred));assert.ok(compareMarkdown([paper,paper]).includes('原文匹配 / 待确认'));
assert.equal(normalize({...state,dimensions:undefined,comparisonNotes:undefined}).dimensions.length,0);assert.equal(paragraphs('Intro\n\nMethod\n\nResults').length,3);
assert.throws(()=>normalize({...state,papers:[{...paper,id:'<bad>'}]}));
assert.equal(normalize({...state,version:1,researchSessions:undefined}).version,3);
console.log('Research model passed: import dedupe, candidate extraction, evidence match, AI validation, merge/tombstones, graph and export');

const snapshots=structuredClone(state);snapshots.papers[0].aiDigest={summary:'关键要点',takeaways:['以后复用'],evidence:[{quote:'原文',paragraphId:'p9',matched:true}]};snapshots.researchSessions=[{id:'round-1',updatedAt:Date.now(),topic:'RAG',step:4,report:{overview:'文章要点'},roundSummary:{overview:'完整研究',evidenceAppendix:[{paperId:paper.id,evidence:snapshots.papers[0].aiDigest.evidence}]},organizedAt:1}];const restored=normalize(snapshots);assert.equal(restored.papers[0].aiDigest.takeaways[0],'以后复用');assert.equal(restored.researchSessions[0].roundSummary.evidenceAppendix[0].evidence[0].paragraphId,'p9');assert.equal(normalize({...state,version:2}).version,3);

const {keyPassages,roundInput,exportReport}=await import('../../apps/research-workbench/workflow.mjs');const picked=keyPassages([{id:'p1',section:'Related work',text:'x'.repeat(500)},{id:'p2',section:'Results',text:'result evidence'}],20);assert.equal(picked[0].id,'p2');const compact=roundInput({...paper,fields:ai.fields,digest:restored.papers[0].aiDigest},paper);assert.equal(compact.fields.results.quote,'');assert.ok(exportReport('RAG',restored.researchSessions[0].roundSummary).includes('来源段落：p9'));
