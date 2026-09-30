type Auth=(r:Request,e:Env,id:string)=>Promise<boolean>;
const hash=async(s:string)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))].map(n=>n.toString(16).padStart(2,'0')).join('');
const equal=(a:string,b:string)=>{if(a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0};
const fail=(error:string,status=400)=>({body:{error},status});
async function schema(env:Env){await env.DB.batch([env.DB.prepare('CREATE TABLE IF NOT EXISTS muse_channels(owner TEXT PRIMARY KEY, token_hash TEXT NOT NULL, created_at TEXT NOT NULL)'),env.DB.prepare('CREATE TABLE IF NOT EXISTS muse_reports(owner TEXT NOT NULL, report_id TEXT NOT NULL, report_date TEXT NOT NULL, content TEXT NOT NULL, digest TEXT NOT NULL, received_at TEXT NOT NULL, PRIMARY KEY(owner,report_id))')])}
function str(v:unknown,max:number,required=false){if(typeof v!=='string'||v.length>max||(required&&!v.trim()))throw Error('报告文本字段缺失或超长');return v.trim()}
export function validateReport(b:any){
 if(!b||!/^\d{4}-\d{2}-\d{2}$/.test(b.date)||!Number.isFinite(Date.parse(b.date))||new Date(b.date).toISOString().slice(0,10)!==b.date)throw Error('date 必须是有效 YYYY-MM-DD');
 if(!/^[A-Za-z0-9_-]{1,80}$/.test(b.reportId))throw Error('reportId 需为 1–80 位字母、数字、- 或 _');
 if(!Array.isArray(b.items)||b.items.length>100)throw Error('items 最多 100 项');
 const seen=new Set<string>();const items=b.items.map((x:any)=>{const id=str(x.id,100,true);if(seen.has(id))throw Error('监视任务 id 重复');seen.add(id);if(!['changed','unchanged','failed','action'].includes(x.status))throw Error('status 需为 changed / unchanged / failed / action');
 const urls=(x.urls||[]);if(!Array.isArray(urls)||urls.length>10)throw Error('每项最多 10 个证据链接');for(const u of urls){const p=new URL(str(u,2000,true));if(!['https:','http:'].includes(p.protocol)||p.username||p.password)throw Error('证据 URL 无效')}
 if(!urls.length&&x.status!=='failed')throw Error('成功的监视项必须提供原始证据 URL');
 const observedAt=str(x.observedAt,40,true);if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(observedAt)||!Number.isFinite(Date.parse(observedAt))||Date.parse(observedAt)>Date.now()+300000)throw Error('observedAt 无效或位于未来');
 return {id,title:str(x.title,200,true),status:x.status,summary:str(x.summary,4000,true),before:str(x.before??'',2000),after:str(x.after??'',2000),action:str(x.action??'',2000),priority:['high','normal','low'].includes(x.priority)?x.priority:'normal',category:str(x.category??'其他',80),observedAt,urls};});
 return {reportId:b.reportId,date:b.date,summary:str(b.summary,6000,true),items};
}
async function limitedJSON(request:Request){if(Number(request.headers.get('content-length')||0)>150000)throw Error('报告超过 150 KB');const reader=request.body?.getReader();if(!reader)throw Error('报告为空');const chunks:Uint8Array[]=[];let size=0;while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>150000){await reader.cancel();throw Error('报告超过 150 KB')}chunks.push(value)}const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length}return JSON.parse(new TextDecoder().decode(bytes))}
export async function museRoute(request:Request,env:Env,authenticate:Auth){
 const m=new URL(request.url).pathname.match(/^\/api\/muse\/([a-f0-9-]{36})\/(channel|reports|deliver)$/i);if(!m)return null;const [,owner,action]=m;
 if((action==='reports'&&request.method!=='GET')||(action!=='reports'&&request.method!=='POST'))return fail('Method not allowed',405);
 if(action!=='deliver'&&!await authenticate(request,env,owner))return fail('读取凭据无效',401);
 await schema(env);
 if(action==='channel'){const token=[...crypto.getRandomValues(new Uint8Array(32))].map(x=>x.toString(16).padStart(2,'0')).join('');await env.DB.prepare('INSERT INTO muse_channels(owner,token_hash,created_at) VALUES(?,?,?) ON CONFLICT(owner) DO UPDATE SET token_hash=excluded.token_hash,created_at=excluded.created_at').bind(owner,await hash(token),new Date().toISOString()).run();return {status:201,body:{token,owner}}}
 if(action==='reports'){const rows=await env.DB.prepare('SELECT content,received_at FROM muse_reports WHERE owner=? ORDER BY report_date DESC,received_at DESC LIMIT 60').bind(owner).all<{content:string;received_at:string}>();return {body:{reports:rows.results.map(r=>({...JSON.parse(r.content),receivedAt:r.received_at}))}}}
 const token=(request.headers.get('authorization')||'').replace(/^Bearer\s+/i,''),channel=await env.DB.prepare('SELECT token_hash FROM muse_channels WHERE owner=?').bind(owner).first<{token_hash:string}>();if(!token||!channel||!equal(channel.token_hash,await hash(token)))return fail('投递凭据无效或已更换',401);
 try{const report=validateReport(await limitedJSON(request)),content=JSON.stringify(report),digest=await hash(content),at=new Date().toISOString();
 const inserted=await env.DB.prepare('INSERT OR IGNORE INTO muse_reports(owner,report_id,report_date,content,digest,received_at) VALUES(?,?,?,?,?,?)').bind(owner,report.reportId,report.date,content,digest,at).run();
 const prior=await env.DB.prepare('SELECT digest,received_at FROM muse_reports WHERE owner=? AND report_id=?').bind(owner,report.reportId).first<{digest:string;received_at:string}>();
 if(prior?.digest!==digest)return fail('该 reportId 已存在不同内容；修订请使用新 reportId（例如加 -r2）',409);
 await env.DB.prepare('DELETE FROM muse_reports WHERE owner=? AND report_id NOT IN (SELECT report_id FROM muse_reports WHERE owner=? ORDER BY report_date DESC,received_at DESC LIMIT 60)').bind(owner,owner).run();
 return {status:inserted.meta.changes?201:200,body:{ok:true,reportId:report.reportId,receivedAt:prior?.received_at,duplicate:!inserted.meta.changes}};
 }catch(e){return fail(String(e))}
}
