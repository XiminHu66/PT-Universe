import { parseReport, checkReportSize, REPORT_LIMITS, ReportError } from '../../../apps/watch-inbox/report-schema.mjs';
type Auth=(r:Request,e:Env,id:string)=>Promise<boolean>;
const hash=async(s:string)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))].map(n=>n.toString(16).padStart(2,'0')).join('');
const equal=(a:string,b:string)=>{if(a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0};
const fail=(error:string,status=400)=>({body:{error},status});
async function schema(env:Env){await env.DB.batch([env.DB.prepare('CREATE TABLE IF NOT EXISTS muse_channels(owner TEXT PRIMARY KEY, token_hash TEXT NOT NULL, created_at TEXT NOT NULL)'),env.DB.prepare('CREATE TABLE IF NOT EXISTS muse_reports(owner TEXT NOT NULL, report_id TEXT NOT NULL, report_date TEXT NOT NULL, content TEXT NOT NULL, digest TEXT NOT NULL, received_at TEXT NOT NULL, PRIMARY KEY(owner,report_id))')])}
export { validateReport } from '../../../apps/watch-inbox/report-schema.mjs';
async function limitedJSON(request:Request){
 if(Number(request.headers.get('content-length')||0)>REPORT_LIMITS.bytes)throw new ReportError('body_too_large','$','报告超过 150 KB');
 const reader=request.body?.getReader();if(!reader)throw new ReportError('missing_body','$','报告为空');
 const chunks:Uint8Array[]=[];let size=0;while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>REPORT_LIMITS.bytes){await reader.cancel();throw new ReportError('body_too_large','$','报告超过 150 KB')}chunks.push(value)}
 const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length}return parseReport(new TextDecoder().decode(bytes));
}
export async function museRoute(request:Request,env:Env,authenticate:Auth){
 const m=new URL(request.url).pathname.match(/^\/api\/muse\/([a-f0-9-]{36})\/(channel|reports|deliver)$/i);if(!m)return null;const [,owner,action]=m;
 if((action==='reports'&&request.method!=='GET')||(action!=='reports'&&request.method!=='POST'))return fail('Method not allowed',405);
 if(action!=='deliver'&&!await authenticate(request,env,owner))return fail('读取凭据无效',401);
 await schema(env);
 if(action==='channel'){const token=[...crypto.getRandomValues(new Uint8Array(32))].map(x=>x.toString(16).padStart(2,'0')).join('');await env.DB.prepare('INSERT INTO muse_channels(owner,token_hash,created_at) VALUES(?,?,?) ON CONFLICT(owner) DO UPDATE SET token_hash=excluded.token_hash,created_at=excluded.created_at').bind(owner,await hash(token),new Date().toISOString()).run();return {status:201,body:{token,owner}}}
 if(action==='reports'){const rows=await env.DB.prepare('SELECT content,received_at FROM muse_reports WHERE owner=? ORDER BY report_date DESC,received_at DESC LIMIT 60').bind(owner).all<{content:string;received_at:string}>();return {body:{reports:rows.results.map(r=>({...JSON.parse(r.content),receivedAt:r.received_at}))}}}
 const token=(request.headers.get('authorization')||'').replace(/^Bearer\s+/i,''),channel=await env.DB.prepare('SELECT token_hash FROM muse_channels WHERE owner=?').bind(owner).first<{token_hash:string}>();if(!token||!channel||!equal(channel.token_hash,await hash(token)))return fail('投递凭据无效或已更换',401);
 try{const report=await limitedJSON(request),content=JSON.stringify(report);checkReportSize(content);const digest=await hash(content),at=new Date().toISOString();
 const inserted=await env.DB.prepare('INSERT OR IGNORE INTO muse_reports(owner,report_id,report_date,content,digest,received_at) VALUES(?,?,?,?,?,?)').bind(owner,report.reportId,report.date,content,digest,at).run();
 const prior=await env.DB.prepare('SELECT digest,received_at FROM muse_reports WHERE owner=? AND report_id=?').bind(owner,report.reportId).first<{digest:string;received_at:string}>();
 if(prior?.digest!==digest)return fail('该 reportId 已存在不同内容；修订请使用新 reportId（例如加 -r2）',409);
 await env.DB.prepare('DELETE FROM muse_reports WHERE owner=? AND report_id NOT IN (SELECT report_id FROM muse_reports WHERE owner=? ORDER BY report_date DESC,received_at DESC LIMIT 60)').bind(owner,owner).run();
 return {status:inserted.meta.changes?201:200,body:{ok:true,reportId:report.reportId,receivedAt:prior?.received_at,duplicate:!inserted.meta.changes}};
 }catch(e){if(e instanceof ReportError)return {status:400,body:{error:e.message,code:e.code,field:e.field,...(e.limit===undefined?{}:{limit:e.limit,actual:e.actual})}};return fail(e instanceof Error?e.message:String(e))}
}
