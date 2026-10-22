export const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const inline=text=>esc(text).replace(/`([^`]+)`/g,'<code>$1</code>').replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,'<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
// Intentionally small Markdown subset. Raw HTML, images and embedded content are never rendered.
export function markdown(text){
 let html='',list='',paragraph=[],code=null,table=[];
 const flush=()=>{if(paragraph.length){html+='<p>'+paragraph.map(inline).join('<br>')+'</p>';paragraph=[]}if(list){html+='</'+list+'>';list=''}};
 const flushTable=()=>{if(table.length){const rows=table.filter(r=>!/^\s*\|?[\s:|-]+\|?\s*$/.test(r));html+='<table>'+rows.map((r,i)=>'<tr>'+r.trim().replace(/^\||\|$/g,'').split('|').map(c=>`<${i===0?'th':'td'}>${inline(c.trim())}</${i===0?'th':'td'}>`).join('')+'</tr>').join('')+'</table>';table=[]}};
 for(const line of String(text).split('\n')){
  if(/^\s*```/.test(line)){flush();flushTable();if(code!==null){html+='<pre><code>'+esc(code.join('\n'))+'</code></pre>';code=null}else code=[];continue}
  if(code!==null){code.push(line);continue}
  if(/^\s*\|.*\|\s*$/.test(line)){flush();table.push(line);continue}flushTable();
  const heading=line.match(/^#{1,6}\s+(.+)/),bullet=line.match(/^\s*[-*]\s+(.+)/),ordered=line.match(/^\s*\d+[.)]\s+(.+)/);
  if(!line.trim()){flush();continue}
  if(heading){flush();html+='<h3>'+inline(heading[1])+'</h3>';continue}
  if(bullet||ordered){if(paragraph.length){html+='<p>'+paragraph.map(inline).join('<br>')+'</p>';paragraph=[]}const type=ordered?'ol':'ul';if(list!==type){if(list)html+='</'+list+'>';html+='<'+type+'>';list=type}html+='<li>'+inline((bullet||ordered)[1])+'</li>';continue}
  if(/^>\s?/.test(line)){flush();html+='<blockquote>'+inline(line.replace(/^>\s?/,''))+'</blockquote>';continue}
  if(list){html+='</'+list+'>';list=''}paragraph.push(line);
 }
 flush();flushTable();if(code!==null)html+='<pre><code>'+esc(code.join('\n'))+'</code></pre>';return html;
}
export async function consumeChat(response,onDelta){
 if(!response.ok){const data=await response.json().catch(()=>null);const error=Error(data?.error?.message||data?.error||'请求失败 HTTP '+response.status);error.status=response.status;error.retryAfter=response.headers.get('retry-after');throw error}
 let full='',reasoning='',model='',usage=null,finished=false;
 function accept(data){
  if(data.error)throw Error(data.error.message||String(data.error));
  if(data.model)model=data.model;if(data.usage)usage=data.usage;
  const choice=data.choices?.[0],delta=choice?.delta||choice?.message||{};
  const content=typeof delta.content==='string'?delta.content:Array.isArray(delta.content)?delta.content.map(x=>x.text||'').join(''):'';
  const thought=delta.reasoning_content||delta.reasoning||'';
  full+=content;reasoning+=thought;if(content)onDelta(content,{model,usage});
  if(choice?.finish_reason){finished=true;if(choice.finish_reason==='error')throw Error('后端在生成过程中报错')}
 }
 const type=response.headers.get('content-type')||'';
 if(!type.includes('text/event-stream')){accept(await response.json());finished=true}else{
  if(!response.body)throw Error('后端没有返回数据流');
  const reader=response.body.getReader(),decoder=new TextDecoder();let pending='',event=[];
  const dispatch=()=>{const payload=event.join('\n');event=[];if(!payload)return;if(payload==='[DONE]'){finished=true;return}let data;try{data=JSON.parse(payload)}catch{throw Error('后端返回无法解析的数据流')};accept(data)};
  const line=raw=>{const s=raw.replace(/\r$/,'');if(!s){dispatch();return}if(s.startsWith('data:'))event.push(s.slice(5).trimStart())};
  try{while(true){const {done,value}=await reader.read();pending+=decoder.decode(value,{stream:!done});let index;while((index=pending.indexOf('\n'))!==-1){line(pending.slice(0,index));pending=pending.slice(index+1)}if(done)break}if(pending)line(pending);dispatch()}finally{await reader.cancel().catch(()=>{});reader.releaseLock()}
 }
 if(!full.trim())throw Error(reasoning?'模型只返回了推理内容，没有最终回答。请增加输出上限或换模型。':'后端未返回回答，请检查模型是否支持聊天');
 if(!finished)throw Error('连接提前结束；已保留收到的内容，可点击重试');
 return {content:full,model,usage};
}
export function directBase(raw){
 const u=new URL(raw);if(u.username||u.password||u.search||u.hash)throw Error('Base URL 不应包含账号、查询参数或片段');
 if(u.protocol!=='https:'&&!(u.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname)))throw Error('自定义接口需 HTTPS；本机 localhost 可以使用 HTTP');
 if(/\/chat\/completions\/?$/.test(u.pathname))throw Error('请填写 Base URL，不要附加 /chat/completions');
 return u.href.replace(/\/$/,'');
}
export function normalizeBackup(value){
 if(!value||value.version!==1||!Array.isArray(value.workspaces)||!Array.isArray(value.chats)||value.chats.length>1000||value.workspaces.length>50)throw Error('不是有效的 AnythingLLM 对话备份');
 const ids=new Set(),workspaces=value.workspaces.map(w=>{if(typeof w.id!=='string'||ids.has(w.id))throw Error('工作区 ID 无效');ids.add(w.id);return {id:w.id.slice(0,80),name:String(w.name||'工作区').slice(0,40),icon:'◈',system:String(w.system||'').slice(0,5000),temperature:Math.max(0,Math.min(2,Number(w.temperature)||.7)),maxTokens:Math.max(64,Math.min(8192,Number(w.maxTokens)||2048))}});
 if(!workspaces.length)throw Error('备份没有工作区');
 const chats=value.chats.map(c=>({id:crypto.randomUUID(),workspace:ids.has(c.workspace)?c.workspace:workspaces[0].id,title:String(c.title||'导入对话').slice(0,80),updatedAt:Number(c.updatedAt)||Date.now(),messages:(Array.isArray(c.messages)?c.messages:[]).slice(0,200).filter(m=>['user','assistant'].includes(m.role)).map(m=>({id:crypto.randomUUID(),role:m.role,content:String(m.content||'').slice(0,100000),provider:String(m.provider||'').slice(0,100),model:String(m.model||'').slice(0,200),status:['done','error','stopped'].includes(m.status)?m.status:'stopped'}))}));
 return {version:1,workspaces,chats};
}
