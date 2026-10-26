import {entityKey,matchQuote,currentExtraction} from './model.mjs?v=semantic-hub-20261026';
export const SEMANTIC_VERSION='pt-semantic-v1';
export const semanticLabels={uses:'采用',addresses:'解决任务',evaluated_on:'评测于',measured_by:'评估指标',implements:'实现',part_of:'组成部分',extends:'延伸',improves:'改进',competes_with:'竞争方案',produces:'生成'};
const normal=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
const nodeId=name=>'entity:'+normal(String(name).match(/\(([A-Za-z0-9-]{2,16})\)\s*$/)?.[1]||name);
const typePriority={method:0,model:1,tool:2,task:3,dataset:4,metric:5,innovation:6,concept:7};
const confidence=n=>Math.max(0,Math.min(1,Number(n)||0));
export function validateSemantic(raw,passages){
 const entities=(Array.isArray(raw.entities)?raw.entities:[]).slice(0,24).map(e=>{
  const name=String(e.name||'').trim().slice(0,100),type=['method','tool','task','dataset','metric','model','innovation','concept'].includes(e.type)?e.type:'concept',p=passages.find(p=>p.id===e.paragraph),quote=p?matchQuote(p.text,e.quote):'';
  return {name,type,paragraph:e.paragraph,quote,grounded:!!name&&quote.length>=8&&normal(quote).includes(normal(name))};
 }).filter(e=>e.grounded);
 const resolve=name=>entities.find(e=>normal(e.name)===normal(name));
 const relations=(Array.isArray(raw.relations)?raw.relations:[]).slice(0,24).map(r=>{
  const from=resolve(r.from),to=resolve(r.to),p=passages.find(p=>p.id===r.paragraph),quote=p?matchQuote(p.text,r.quote):'',type=Object.hasOwn(semanticLabels,r.type)?r.type:'';
  // A quote must contain both endpoints, not merely mention them elsewhere.
  const grounded=!!from&&!!to&&entityKey(from.type,from.name)!==entityKey(to.type,to.name)&&!!type&&quote.length>=12&&normal(quote).includes(normal(from.name))&&normal(quote).includes(normal(to.name));
  return {id:crypto.randomUUID(),from:from?entityKey(from.type,from.name):'',to:to?entityKey(to.type,to.name):'',fromName:from?.name,toName:to?.name,type,quote,paragraph:r.paragraph,reason:String(r.reason||'').slice(0,600),confidence:confidence(r.confidence),grounded,status:'evidence',semantic:true};
 }).filter(r=>r.grounded&&r.confidence>=.65);
 return {schema:SEMANTIC_VERSION,entities,relations,createdAt:new Date().toISOString()};
}
export function semanticCurrent(b){return currentExtraction(b)&&b.meta.semantic?.schema===SEMANTIC_VERSION&&b.meta.semantic.contentVersion===b.meta.index?.version;}
export function semanticGraph(items,{includeSources=false,includeCandidates=false}={}){
 const nodes=new Map(),edges=new Map();
 for(const b of items){if(!semanticCurrent(b))continue;const state=b.meta.semantic,text=(b.meta.index?.pages||[]).map(p=>p.text).join('\n\n');
  for(const r of state.relations||[]){if(!r.grounded||r.status==='rejected'||r.confidence<.65||!matchQuote(text,r.quote))continue;
   const a=state.entities.find(e=>entityKey(e.type,e.name)===r.from),z=state.entities.find(e=>entityKey(e.type,e.name)===r.to);if(!a||!z)continue;
   for(const e of [a,z]){const id=nodeId(e.name);if(!nodes.has(id))nodes.set(id,{id,label:e.name,type:e.type,sources:[]});const n=nodes.get(id);if((typePriority[e.type]??8)<(typePriority[n.type]??8))n.type=e.type;if(!n.sources.includes(b.id))n.sources.push(b.id);}
   const from=nodeId(a.name),to=nodeId(z.name),key=[from,r.type,to].join('|'),evidence={sourceId:b.id,title:b.title,sourceType:b.meta.resourceType,quote:r.quote,version:state.contentVersion,page:b.meta.index.pages.find(p=>matchQuote(p.text,r.quote))?.page||null,relationId:r.id,model:state.model};
   if(!edges.has(key))edges.set(key,{...r,from,to,evidence:[],owner:b.id});edges.get(key).evidence.push(evidence);
  }
 }
 if(includeSources)for(const b of items){const targets=[...nodes.values()].filter(n=>n.sources.includes(b.id));if(!targets.length)continue;nodes.set(b.id,{id:b.id,label:b.title,type:'document',sources:[b.id]});for(const n of targets)edges.set('source:'+b.id+':'+n.id,{from:b.id,to:n.id,type:'mentions',sourceId:b.id,evidence:[],derived:true});}
 return {nodes:[...nodes.values()],edges:[...edges.values()]};
}
export function paperIdentity(b){const id=[b.url,b.title,b.meta.originalFileName].filter(Boolean).join(' ').match(/(?:arxiv\D*)?(\d{4}\.\d{4,5})(?:v\d+)?/i)?.[1];return id?'arxiv:'+id:'title:'+normal(b.title).replace(/pdf$/,'');}
export function semanticStats(items){const graph=semanticGraph(items);return {sources:items.length,works:new Set(items.map(paperIdentity)).size,processed:items.filter(semanticCurrent).length,entities:graph.nodes.length,relations:graph.edges.length};}
export function semanticDocumentLinks(items){const graph=semanticGraph(items),out=[];for(const e of graph.edges){const a=graph.nodes.find(n=>n.id===e.from),b=graph.nodes.find(n=>n.id===e.to);for(const source of e.evidence)for(const other of new Set([...a.sources,...b.sources]))if(source.sourceId!==other)out.push({from:source.sourceId,to:other,type:e.type,entity:a.label+' → '+b.label,quoteFrom:source.quote,quoteTo:e.evidence.find(x=>x.sourceId===other)?.quote||'',confidence:e.confidence,semanticEntity:true,derived:true});}return out.filter(e=>e.quoteTo.length>=12);}
