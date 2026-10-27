export const BENCH_TEMPLATES=[
 {id:'summary',name:'中文技术文章摘要',system:'你是严谨的技术研究助理。忠于原文，只返回合法 JSON，不添加 Markdown 围栏。',prompt:'总结以下技术文章：\n{{input}}\n返回 summary（100字内）、key_points（3-5项）、takeaway。',input:'一项研究将向量检索与知识图谱结合：先用向量搜索召回段落，再沿关系扩展上下文。混合检索在多跳问答上的准确率优于纯向量检索，但引入额外延迟，依赖图谱构建质量。',schema:'{"type":"object","required":["summary","key_points","takeaway"],"properties":{"summary":{"type":"string"},"key_points":{"type":"array","minItems":3,"items":{"type":"string"}},"takeaway":{"type":"string"}}}',reference:'检索'},
 {id:'classify',name:'信息流分类',system:'你是信息流分类器。严格按指定标签分类，只输出 JSON。',prompt:'分类以下内容。category 为 AI、游戏、投资、其他之一；priority 为 high、medium、low 之一；返回 reason。\n{{input}}',input:'某研究团队发布开源 GraphRAG 评估框架，包含多跳检索与答案引用准确率评测。',schema:'{"type":"object","required":["category","priority","reason"],"properties":{"category":{"type":"string","enum":["AI","游戏","投资","其他"]},"priority":{"type":"string","enum":["high","medium","low"]},"reason":{"type":"string"}}}',reference:'"category"'},
 {id:'paper',name:'论文快速解析',system:'你是研究助理。区分原文证据、推测及未知，不编造。只输出 JSON。',prompt:'解析以下摘要，提取研究问题、方法、主要结论和局限：\n{{input}}',input:'We propose adaptive LLM agent execution, dynamically choosing planning or tools. Three multi-step benchmarks suggest better task completion but higher latency. Limitations include few domains and sensitivity to prompts.',schema:'{"type":"object","required":["question","method","findings","limitations"],"properties":{"question":{"type":"string"},"method":{"type":"string"},"findings":{"type":"array","items":{"type":"string"}},"limitations":{"type":"array","items":{"type":"string"}}}}',reference:'agent'},
 {id:'game',name:'游戏系统设计',system:'你是独立游戏系统策划，注重可实现性、权衡与测试。',prompt:'给出核心循环、玩家决策、失败风险、资源反馈、最小可玩验证。\n目标：{{input}}',input:'搜打撤+基地经营。高价值物品可出售或作为一次性战术卡使用。',schema:'',reference:'核心循环\n风险'}
];
export function parseJsonAnswer(value){
 const text=String(value||'').trim();
 const match=text.match(/^\x60{3,}(?:json)?\s*\n([\s\S]*?)\n\x60{3,}$/i);
 try{return JSON.parse(match?match[1]:text)}catch{return null}
}
const allowed=new Set(['type','required','properties','items','enum','minItems','maxItems','minLength','maxLength','minimum','maximum','additionalProperties']);
export function checkSchemaDefinition(schema,depth=0){
 if(!schema||typeof schema!=='object'||Array.isArray(schema)||depth>10)throw Error('JSON Schema 必须是对象，最多 10 层');
 for(const key of Object.keys(schema))if(!allowed.has(key))throw Error('暂不支持 JSON Schema 字段：'+key);
 if(schema.type&&!['object','array','string','number','integer','boolean','null'].includes(schema.type))throw Error('不支持的 type');
 if(schema.required&&(!Array.isArray(schema.required)||schema.required.some(x=>typeof x!=='string')))throw Error('required 必须为字符串数组');
 if(schema.enum&&!Array.isArray(schema.enum))throw Error('enum 必须是数组');
 if(schema.properties){if(typeof schema.properties!=='object'||Array.isArray(schema.properties))throw Error('properties 应为对象');for(const s of Object.values(schema.properties))checkSchemaDefinition(s,depth+1)}
 if(schema.items)checkSchemaDefinition(schema.items,depth+1);
 if(schema.additionalProperties!==undefined&&typeof schema.additionalProperties!=='boolean')throw Error('additionalProperties 仅支持布尔');
 return schema;
}
export function validateValue(value,s){
 if(!s)return true;
 const t=s.type;
 if(t==='null'&&value!==null||t==='array'&&!Array.isArray(value)||t==='object'&&(value===null||typeof value!=='object'||Array.isArray(value))||t==='integer'&&!Number.isInteger(value)||t==='number'&&(typeof value!=='number'||!Number.isFinite(value))||t==='string'&&typeof value!=='string'||t==='boolean'&&typeof value!=='boolean')return false;
 if(s.enum&&!s.enum.some(x=>JSON.stringify(x)===JSON.stringify(value)))return false;
 if(typeof value==='string'&&(s.minLength!=null&&value.length<s.minLength||s.maxLength!=null&&value.length>s.maxLength))return false;
 if(typeof value==='number'&&(s.minimum!=null&&value<s.minimum||s.maximum!=null&&value>s.maximum))return false;
 if(Array.isArray(value)){
  if(s.minItems!=null&&value.length<s.minItems||s.maxItems!=null&&value.length>s.maxItems)return false;
  if(s.items&&!value.every(v=>validateValue(v,s.items)))return false;
 }
 if(value&&typeof value==='object'&&!Array.isArray(value)){
  if(s.required&&!s.required.every(k=>Object.hasOwn(value,k)))return false;
  if(s.additionalProperties===false&&Object.keys(value).some(k=>!Object.hasOwn(s.properties||{},k)))return false;
  if(s.properties&&Object.entries(s.properties).some(([k,v])=>Object.hasOwn(value,k)&&!validateValue(value[k],v)))return false;
 }
 return true;
}
export function evaluateAnswer(answer,{schema=null,reference=''}={}){
 const json=schema?parseJsonAnswer(answer):null;
 const terms=String(reference||'').split('\n').map(x=>x.trim()).filter(Boolean).slice(0,20);
 return {jsonValid:schema?json!==null:null,schemaPass:schema?json!==null&&validateValue(json,schema):null,referencePass:terms.length?terms.every(t=>String(answer).toLocaleLowerCase().includes(t.toLocaleLowerCase())):null};
}
export function runStats(entries){
 const n=entries.length,success=entries.filter(e=>e.status==='ok'&&!e.substituted);
 const mean=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:null;
 const tokens=success.map(x=>x.usage?.total_tokens).filter(Number.isFinite);
 const ratings=success.map(x=>x.rating).filter(x=>Number.isInteger(x)&&x>=1&&x<=5);
 const checks=k=>{const applicable=success.filter(x=>typeof x.checks?.[k]==='boolean');return applicable.length?{passed:applicable.filter(x=>x.checks[k]).length,total:applicable.length}:null};
 return {n,ok:success.length,latencyMs:mean(success.map(e=>e.elapsedMs).filter(Number.isFinite)),tokens:mean(tokens),reportedTokens:tokens.length,rating:mean(ratings),rated:ratings.length,schema:checks('schemaPass'),reference:checks('referencePass')};
}
export function recommendedModels(runs,taskId){
 const groups=new Map();
 for(const r of runs)if(r.taskId===taskId)for(const e of r.entries||[]){const key=e.provider+'/'+e.model;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(e)}
 return [...groups].map(([key,entries])=>({key,...runStats(entries)})).sort((a,b)=>(b.n?b.ok/b.n:0)-(a.n?a.ok/a.n:0)||(b.rating||0)-(a.rating||0)||(a.latencyMs??Infinity)-(b.latencyMs??Infinity));
}
