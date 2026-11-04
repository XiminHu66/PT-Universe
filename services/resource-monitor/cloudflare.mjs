// Fixed aggregate queries only. No product data, session creation or account mutations.
const number=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
const sum=(rows,field)=>rows.reduce((n,r)=>{if(!number(r.sum?.[field]))throw Error('invalid-metric');return n+r.sum[field]},0);
const rows=(value,max=100)=>{if(!Array.isArray(value)||value.length>=max)throw Error('incomplete-result');return value;};
export function cloudflareDatasets(at){
 const day=at.slice(0,10),dates=`date_geq: "${day}", date_leq: "${day}"`,times=`datetime_geq: "${day}T00:00:00Z", datetime_leq: "${at}"`;
 const peaks=(value,dimension,field)=>{const r=rows(value);if(!r.length)throw Error('no-storage-samples');const seen=new Set();return r.map(x=>{const id=x.dimensions?.[dimension],bytes=x.max?.[field];if(!id||seen.has(id)||!number(bytes))throw Error('invalid-storage');seen.add(id);return bytes;});};
 return [
  {key:'workers',name:'Workers 请求',ids:['cf-requests'],body:`workersInvocationsAdaptive(limit: 10, filter: {${times}}) { sum { requests } }`,take:a=>[['cf-requests',sum(rows(a.workersInvocationsAdaptive,10),'requests')]]},
  {key:'kv',name:'KV 操作',ids:['cf-kv-read','cf-kv-write','cf-kv-delete','cf-kv-list'],body:`kvOperationsAdaptiveGroups(limit: 20, filter: {${dates}}) { sum { requests } dimensions { actionType } }`,take:a=>{const r=rows(a.kvOperationsAdaptiveGroups,20);return ['read','write','delete','list'].map(action=>['cf-kv-'+action,sum(r.filter(x=>x.dimensions?.actionType===action),'requests')]);}},
  {key:'d1',name:'D1 行数',ids:['cf-d1-read','cf-d1-write'],body:`d1AnalyticsAdaptiveGroups(limit: 10, filter: {${dates}}) { sum { rowsRead rowsWritten } }`,take:a=>{const r=rows(a.d1AnalyticsAdaptiveGroups,10);return [['cf-d1-read',sum(r,'rowsRead')],['cf-d1-write',sum(r,'rowsWritten')]];}},
  {key:'kv-storage',name:'KV 存储',ids:['cf-kv-storage'],body:`kvStorageAdaptiveGroups(limit: 100, filter: {${dates}}) { max { byteCount } dimensions { namespaceId } }`,note:'有样本命名空间的当日峰值合计；Analytics 估计，非即时全账户清单。',partial:true,take:a=>[['cf-kv-storage',peaks(a.kvStorageAdaptiveGroups,'namespaceId','byteCount').reduce((n,v)=>n+v,0)/1e9]]},
  {key:'d1-storage',name:'D1 存储',ids:['cf-d1-storage','cf-d1-db-storage'],body:`d1StorageAdaptiveGroups(limit: 100, filter: {${dates}}) { max { databaseSizeBytes } dimensions { databaseId } }`,note:'有样本数据库的当日峰值；未采样库可能缺失，非即时全账户清单。',partial:true,take:a=>{const p=peaks(a.d1StorageAdaptiveGroups,'databaseId','databaseSizeBytes');return [['cf-d1-storage',p.reduce((n,v)=>n+v,0)/1e9],['cf-d1-db-storage',Math.max(...p)/1e6]];}},
  {key:'queues',name:'Queues 操作',ids:['cf-queues'],body:`queueMessageOperationsAdaptiveGroups(limit: 10, filter: {${times}}) { sum { billableOperations } }`,take:a=>[['cf-queues',sum(rows(a.queueMessageOperationsAdaptiveGroups,10),'billableOperations')]]}
 ];
}
export function browserHistoryPacket(history,at=Date.now()){
 if(!Array.isArray(history))throw Error('invalid-history');
 const start=Date.parse(new Date(at).toISOString().slice(0,10)+'T00:00:00Z'),seen=new Set();let ms=0,count=0;
 for(const row of history){if(typeof row.sessionId!=='string'||seen.has(row.sessionId))continue;seen.add(row.sessionId);if(!number(row.startTime)||!number(row.endTime)||row.endTime<row.startTime||row.endTime>at+60000)continue;const overlap=Math.max(0,Math.min(at,row.endTime)-Math.max(start,row.startTime));if(overlap){ms+=overlap;count++;}}
 return {quotas:[{id:'cf-browser',used:ms/60000,observedAt:new Date(at).toISOString(),maxAgeHours:.5,lowerBound:true,source:'Cloudflare 现有 Browser binding · 会话历史',note:'今日最近已结束会话的时长下限；可能缺少较早或运行中的会话，不代表完整计费用量。'}],status:{provider:'browser',state:'partial',checkedAt:new Date(at).toISOString(),observedAt:new Date(at).toISOString(),coverage:`读取 ${count} 个今日已结束会话；仅下限，不启动浏览器`}};
}
