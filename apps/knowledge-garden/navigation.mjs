// One user-facing knowledge application; the VPS-native service remains the
// sole backend. Apply only to the known hub shell, never to native APIs.
export const KNOWLEDGE_UI='https://ximinhu66.github.io/PT-Universe/apps/knowledge-garden/';
export function unifyKnowledgeHTML(html){return html.replace(/<a\b[^>]*href=(["'])\/karakeep\/\1[^>]*>[\s\S]*?<\/a>/g,()=>`<a class="card" href="${KNOWLEDGE_UI}" target="_top"><span class="icon">❧</span><span class="arrow">↗</span><h3>Knowledge Garden</h3><p>网页、PDF、笔记和问答，统一使用同一份私有资料库。</p><span class="status" data-tool="karakeep">检查中</span></a>`);}
export function unifyKnowledgeScript(script){
 const descriptor=/,\s*\{id:'karakeep',name:'Karakeep',path:'\/karakeep\/'\}/;
 const select='function select(id,{remember=true}={}){',initial="select(valid(initial)?initial:'home');";
 if(!descriptor.test(script)||!script.includes(select)||!script.includes(initial))return script;
 return script.replace(descriptor,'').replace(select,select+`\n if(id==='karakeep'){location.replace(${JSON.stringify(KNOWLEDGE_UI)});return;}`).replace(initial,"select(initial==='karakeep'?'karakeep':valid(initial)?initial:'home');");
}
