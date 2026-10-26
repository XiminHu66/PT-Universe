// The existing owner-private PT Tool origin hosts the sole daily knowledge UI.
export const KNOWLEDGE_UI='/knowledge/';
export function unifyKnowledgeHTML(html){return html.replace(/<a\b[^>]*href=(["'])(?:\/karakeep\/|https:\/\/ximinhu66\.github\.io\/PT-Universe\/apps\/knowledge-garden\/|\/knowledge\/)\1[^>]*>[\s\S]*?<\/a>/g,()=>`<a class="card" href="${KNOWLEDGE_UI}"><span class="icon">❧</span><span class="arrow">↗</span><h3>知识库</h3><p>网页、PDF、笔记、语义图谱与带出处问答。</p><span class="status" data-tool="karakeep">检查中</span></a>`);}
export function unifyKnowledgeScript(script){return script.replaceAll('https://ximinhu66.github.io/PT-Universe/apps/knowledge-garden/','/knowledge/').replace(/\{id:'karakeep',name:'Karakeep',path:'\/karakeep\/'\}/,"{id:'karakeep',name:'知识库',path:'/knowledge/'}");}
