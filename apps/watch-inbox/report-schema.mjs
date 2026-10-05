// Shared by the browser preflight and Worker: keep field limits identical.
export const REPORT_LIMITS = Object.freeze({bytes:150000, summary:30000, itemSummary:12000, detail:6000});
export class ReportError extends Error {
 constructor(code, field, message, details={}) { super(message); this.name='ReportError'; this.code=code; this.field=field; Object.assign(this,details); }
}
function invalid(code,field,message,details){throw new ReportError(code,field,message,details)}
function text(value,field,max,required=false){
 if(value==null&&required)invalid('missing_field',field,`${field} 缺失，请补齐该字段`);
 if(value==null&&!required)value='';
 if(typeof value!=='string')invalid('invalid_field',field,`${field} 必须是文本${required?'（必填）':''}`);
 if(required&&!value.trim())invalid('missing_field',field,`${field} 缺失或为空，请补齐该字段`);
 if(value.length>max)invalid('field_too_long',field,`${field} 有 ${value.length} 字符，最多 ${max} 字符；请只调整这个字段`,{limit:max,actual:value.length});
 return value.trim();
}
export function checkReportSize(raw){const bytes=new TextEncoder().encode(raw).length;if(bytes>REPORT_LIMITS.bytes)invalid('body_too_large','$',`报告为 ${bytes} 字节，超过 ${REPORT_LIMITS.bytes} 字节（150 KB）`,{limit:REPORT_LIMITS.bytes,actual:bytes});return bytes}
export function parseReport(raw){checkReportSize(raw);let body;try{body=JSON.parse(raw)}catch{invalid('invalid_json','$','日报 JSON 格式无效，请检查引号、逗号和括号')}return validateReport(body)}
export function validateReport(b){
 if(!b||typeof b!=='object'||Array.isArray(b))invalid('invalid_field','$','报告必须是 JSON 对象');
 if(typeof b.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(b.date)||!Number.isFinite(Date.parse(b.date))||new Date(b.date).toISOString().slice(0,10)!==b.date)invalid('invalid_field','date','date 必须是有效 YYYY-MM-DD');
 if(typeof b.reportId!=='string'||! /^[A-Za-z0-9_-]{1,80}$/.test(b.reportId))invalid('invalid_field','reportId','reportId 需为 1–80 位字母、数字、- 或 _');
 const summary=text(b.summary,'summary',REPORT_LIMITS.summary,true);
 if(!Array.isArray(b.items)||b.items.length>100)invalid('invalid_field','items','items 必须是数组，最多 100 项');
 const seen=new Set();const items=b.items.map((x,i)=>{
  const path=`items[${i}]`,field=k=>`${path}.${k}`;
  if(!x||typeof x!=='object'||Array.isArray(x))invalid('invalid_field',path,`${path} 必须是对象`);
  const id=text(x.id,field('id'),100,true);if(seen.has(id))invalid('duplicate_item',field('id'),`${field('id')} 重复：${id}`);seen.add(id);
  if(!['changed','unchanged','failed','action'].includes(x.status))invalid('invalid_field',field('status'),`${field('status')} 需为 changed / unchanged / failed / action`);
  const title=text(x.title,field('title'),200,true),itemSummary=text(x.summary,field('summary'),REPORT_LIMITS.itemSummary,true);
  const urls=x.urls??[];if(!Array.isArray(urls)||urls.length>10)invalid('invalid_field',field('urls'),`${field('urls')} 必须是数组，每项最多 10 个证据链接`);
  const cleanURLs=urls.map((u,n)=>{const f=`${field('urls')}[${n}]`,s=text(u,f,2000,true);let p;try{p=new URL(s)}catch{invalid('invalid_field',f,`${f} 必须是完整 HTTP(S) URL`)}if(!['https:','http:'].includes(p.protocol)||p.username||p.password)invalid('invalid_field',f,`${f} 必须是无内嵌凭据的 HTTP(S) URL`);return s});
  if(!cleanURLs.length&&x.status!=='failed')invalid('missing_evidence',field('urls'),`${field('urls')}：成功的监视项必须提供原始证据 URL`);
  const observedAt=text(x.observedAt,field('observedAt'),40,true);
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(observedAt)||!Number.isFinite(Date.parse(observedAt))||Date.parse(observedAt)>Date.now()+300000)invalid('invalid_field',field('observedAt'),`${field('observedAt')} 无效或位于未来，需带 Z 或时区的实际检查时间`);
  return {id,title,status:x.status,summary:itemSummary,before:text(x.before,field('before'),REPORT_LIMITS.detail),after:text(x.after,field('after'),REPORT_LIMITS.detail),action:text(x.action,field('action'),REPORT_LIMITS.detail),priority:['high','normal','low'].includes(x.priority)?x.priority:'normal',category:text(x.category??'其他',field('category'),80),observedAt,urls:cleanURLs};
 });
 return {reportId:b.reportId,date:b.date,summary,items};
}
