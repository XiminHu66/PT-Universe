// SurveyGraph-inspired MEKG: typed entities, audited edges and anchor-preserving
// one-hop retrieval. Derived ranks are local connectivity, not citation impact.
import {buildGraph,entityLabels,relationLabels,currentExtraction,matchQuote} from './model.mjs?v=semantic-hub-20261026';
import {semanticDocumentLinks} from './semantic.mjs?v=semantic-hub-20261026';
export {entityLabels,currentExtraction};
export function graphLinks(items) {
 const graph=buildGraph(items),links=[...graph.edges.filter(e=>e.type!=='mentions'),...semanticDocumentLinks(items)],mentions=graph.edges.filter(e=>e.type==='mentions');
 for(const n of graph.nodes.filter(n=>['method','task','dataset'].includes(n.type))){
  const sources=mentions.filter(e=>e.to===n.id);
  for(let i=0;i<sources.length;i++)for(let j=i+1;j<sources.length;j++)links.push({from:sources[i].from,to:sources[j].from,type:'shares_'+n.type,entity:n.label,quoteFrom:sources[i].quote,quoteTo:sources[j].quote,fromVersion:sources[i].version,toVersion:sources[j].version,confidence:.7,grounded:true,derived:true});
 }
 return {graph,links};
}
export function graphNeighbors(items,seeds) {
 const ids=new Set(seeds),{links}=graphLinks(items),found=new Map();
 for(const e of links){const id=ids.has(e.from)?e.to:ids.has(e.to)?e.from:null;if(!id||ids.has(id))continue;
  const score=(e.derived ? .35 : e.confidence||.6);
  if(!found.has(id)||found.get(id).score<score)found.set(id,{id,score,edge:e,label:relationLabels[e.type]||e.type,quote:ids.has(e.from)?e.quoteTo:e.quoteFrom});
 }
 return [...found.values()].sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id)).slice(0,5);
}
export function graphOverview(items) {
 const {graph,links}=graphLinks(items),ids=items.map(b=>b.id),rank=new Map(ids.map(id=>[id,1/Math.max(ids.length,1)])),adj=new Map(ids.map(id=>[id,new Map()]));
 for(const e of links){const weight=e.derived ? .35 : e.confidence||.6;for(const [a,b] of [[e.from,e.to],[e.to,e.from]])adj.get(a)?.set(b,(adj.get(a).get(b)||0)+weight);}
 for(let k=0;k<30;k++){const next=new Map(ids.map(id=>[id,.15/Math.max(ids.length,1)]));let dangling=0;for(const id of ids){const edges=adj.get(id),total=[...edges.values()].reduce((a,b)=>a+b,0);if(!total)dangling+=rank.get(id);else for(const [to,w] of edges)next.set(to,next.get(to)+.85*rank.get(id)*w/total);}for(const id of ids)rank.set(id,next.get(id)+.85*dangling/Math.max(ids.length,1));}
 const core=items.map(b=>({id:b.id,title:b.title,score:rank.get(b.id),connections:adj.get(b.id).size})).sort((a,b)=>b.score-a.score||a.title.localeCompare(b.title));
 const seen=new Set(),communities=[];
 for(const id of ids){if(seen.has(id)||!adj.get(id).size)continue;const group=[],queue=[id];seen.add(id);while(queue.length){const at=queue.shift();group.push(at);for(const to of adj.get(at).keys())if(!seen.has(to)){seen.add(to);queue.push(to)}}const entities=graph.nodes.filter(n=>n.type!=='document').map(n=>({...n,count:graph.edges.filter(e=>e.to===n.id&&group.includes(e.from)).length})).filter(n=>n.count>=2).sort((a,b)=>b.count-a.count);communities.push({ids:group,label:entities.slice(0,2).map(e=>e.label).join(' / ')||'已核查的方法关系'});}
 const stale=items.filter(b=>b.meta.extraction&&!currentExtraction(b)).length;
 return {graph,links,core,communities,stale,extracted:items.filter(currentExtraction).length,semantic:links.filter(e=>!e.derived).length,shared:links.filter(e=>e.derived).length};
}
// Spread the extraction budget across long documents instead of reading only
// the opening pages. IDs still refer to exact original paragraphs.
export function samplePassages(ps,budget=44000) {
 ps=ps.flatMap(p=>p.text.length>3500?Array.from({length:Math.ceil(p.text.length/3500)},(_,i)=>({...p,id:p.id+'-S'+(i+1),text:p.text.slice(i*3500,(i+1)*3500)})):[p]);
 if(ps.reduce((n,p)=>n+p.text.length,0)<=budget)return ps;
 const slots=Math.min(ps.length,24),ids=new Set(Array.from({length:slots},(_,i)=>Math.round(i*(ps.length-1)/Math.max(1,slots-1)))),out=[];
 for(const i of [...ids].sort((a,b)=>a-b)){const p=ps[i],allow=Math.floor((budget-out.reduce((n,p)=>n+p.text.length,0))/(ids.size-out.length));out.push({...p,text:p.text.slice(0,allow)});}return out;
}
export function relationDocuments(items,maxCharacters=15000) {
 return items.map(b=>{const pages=b.meta.index?.pages||[],parts=pages.flatMap(p=>{const text=String(p.text||'');return Array.from({length:Math.ceil(text.length/1800)},(_,i)=>({id:'',text:text.slice(i*1800,(i+1)*1800),page:p.page||null}));}),selected=samplePassages(parts,maxCharacters),text=selected.map(p=>p.text).join('\n\n');return {id:b.id,title:b.title,version:b.meta.index?.version,text,entities:(currentExtraction(b)?b.meta.extraction.entities:[])?.filter(e=>e.grounded).map(e=>({name:e.name,type:e.type})),coverage:{characters:text.length,total:pages.reduce((n,p)=>n+p.text.length,0)}};});
}
export function relationSnapshot(r,items) {
 const resolve=(id,quote)=>{const b=items.find(x=>x.id===id);return {version:b?.meta.index?.version,page:b?.meta.index?.pages?.find(p=>matchQuote(p.text,quote))?.page||null};};
 const a=resolve(r.from,r.quoteFrom),b=resolve(r.to,r.quoteTo);return {...r,fromVersion:a.version,toVersion:b.version,fromPage:a.page,toPage:b.page};
}
export function graphOutline(overview) {
 return overview.communities.map(c=>({theme:c.label,sources:c.ids.map(id=>overview.core.find(p=>p.id===id)).sort((a,b)=>b.score-a.score).slice(0,5).map(p=>({id:p.id,title:p.title}))}));
}
