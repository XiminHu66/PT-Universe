// Presentation only: use the saved entity names and relations without inventing
// translations, definitions or new claims.
export function relationSentence(edge,nodes){
 const from=nodes.find(n=>n.id===edge.from)?.label||edge.from;
 const to=nodes.find(n=>n.id===edge.to)?.label||edge.to;
 return relationText(from,edge.type,to);
}
function relationText(from,type,to){
 const verbs={uses:'采用',addresses:'用于解决',measured_by:'通过以下指标评估：',implements:'实现',extends:'延伸自',improves:'改进',competes_with:'与以下方案竞争：',produces:'生成',mentions:'提及',supports:'支持',contradicts:'与以下结论存在分歧：',compares_with:'对比',applies:'应用于'};
 if(type==='evaluated_on')return `${from} 在 ${to} 中评测`;
 if(type==='part_of')return `${from} 是 ${to} 的组成部分`;
 return `${from} ${verbs[type]||'关联'} ${to}`;
}
export function relationshipGroups(graph){
 const groups=new Map();
 for(const edge of graph.edges){if(edge.type==='mentions')continue;const key=edge.from+'|'+edge.type;if(!groups.has(key))groups.set(key,{node:edge.from,type:edge.type,targets:new Set(),sources:new Set(),edges:[]});const g=groups.get(key);g.targets.add(edge.to);for(const e of edge.evidence||[])g.sources.add(e.sourceId);g.edges.push(edge);}
 return [...groups.values()].sort((a,b)=>b.edges.length-a.edges.length).map(g=>({...g,sentence:relationText(graph.nodes.find(n=>n.id===g.node)?.label||g.node,g.type,[...g.targets].map(id=>graph.nodes.find(n=>n.id===id)?.label||id).join('、'))}));
}
export function nodeShape(label){
 const measure=s=>[...s].reduce((sum,c)=>sum+(/[\u0000-\u00ff]/.test(c)?7.7:14),0);
 const lines=[];let line='';
 for(const c of String(label)){if(measure(line+c)>164&&line){lines.push(line);line=c;}else line+=c;}
 if(line)lines.push(line);
 const shown=lines.slice(0,3);if(lines.length>3){while(measure(shown[2]+'…')>164)shown[2]=shown[2].slice(0,-1);shown[2]+='…';}
 return {lines:shown,width:Math.max(88,...shown.map(measure))+36,height:Math.max(1,shown.length)*18+20};
}
