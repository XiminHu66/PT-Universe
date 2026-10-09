type Obj=Record<string,any>;
const norm=(v:string)=>v.normalize('NFKC').toLowerCase().replace(/r[\s-]*2[\s-]*r/g,'r2r').replace(/[—–_]/g,' ');
export const canonicalCheckQuery=(q:string)=>q.replace(/\bstreamdeck\b/gi,'stream deck').replace(/\bsteamdeck\b/gi,'steam deck').replace(/\s+/g,' ').trim();
function productTokens(q:string){return norm(canonicalCheckQuery(q)).replace(/([a-z])\s+(\d)/g,'$1$2').replace(/口碑|评价|评测|测评|参数|怎么样|好不好|值得买吗|购买建议/g,' ').match(/[a-z0-9]+|[\u3400-\u9fff]+/g)?.filter(x=>x.length>1&&!['review','reviews','spec','specs','specifications','official','the','and','for'].includes(x))||[];}
export function matchesProduct(text:string,q:string){const t=norm(text),words=new Set(t.match(/[a-z0-9]+|[\u3400-\u9fff]+/g)||[]),compact=t.replace(/[^\p{L}\p{N}]/gu,''),tokens=productTokens(q);const phrase=new RegExp('(?:^|[^a-z0-9])'+tokens.join('[\\s-]*')+'(?:$|[^a-z0-9])');return !!tokens.length&&(phrase.test(t)||tokens.every(x=>words.has(x)||((/\d/.test(x)||x.length>=6)&&compact.includes(x))||(/[\u3400-\u9fff]/.test(x)&&t.includes(x))));}
export function checkSourceType(row:Obj){const u=new URL(row.url),t=row.title||'';if(/\/weibo\/|\/bbs\/|\/forum|blogspot\.|reddit\.|head-fi\.|audiosciencereview\./i.test(u.href))return 'commentary';if(/(?:elgato|fiio|sennheiser|topping|sony|apple|nintendo)\./i.test(u.hostname))return 'official';if(/review|测评|评测|体验/i.test(t+' '+u.pathname))return 'review';if(/sina\.|qq\.|reuters\.|bbc\.|apnews\.|factcheck\./i.test(u.hostname))return 'report';return 'reference';}
export function publisherKey(raw:string){const h=new URL(raw).hostname.replace(/^www\./,'');if(/(^|\.)sina\.(cn|com\.cn)$/.test(h))return 'sina';if(/(^|\.)qq\.com$/.test(h))return 'qq';if(/(^|\.)elgato\.com$/.test(h))return 'elgato';return h;}
export function checkRelevance(row:Obj,q:string,mode:string){
 const identity=(row.title||'')+' '+row.url;
 if(mode==='product'){if(matchesProduct(identity,q))return {score:100,match:'exact'};if(matchesProduct(identity+' '+(row.excerpt||''),q))return {score:30,match:'context'};return {score:0,match:'unrelated'};}
 const text=norm(identity+' '+(row.excerpt||'')),runs=q.match(/[\u3400-\u9fff]{2,}/g)||[];
 if(runs.length){const grams=new Set<string>();for(const run of runs)for(let i=0;i<run.length-1;i++)grams.add(run.slice(i,i+2));const hits=[...grams].filter(x=>text.includes(x)).length;return {score:hits>=Math.max(2,Math.ceil(grams.size*.4))?60+hits:0,match:'topic'};}
 return {score:matchesProduct(identity+' '+(row.excerpt||''),q)?70:0,match:'topic'};
}
export function rankCheckSources(rows:Obj[],q:string,mode:string){return rows.map(row=>{const r=checkRelevance(row,q,mode),type=checkSourceType(row);return {...row,relevance:r.score,match_type:r.match,source_type:type,publisher:publisherKey(row.url)};}).filter(x=>x.relevance>0).sort((a,b)=>b.relevance-a.relevance+(mode==='claim'?({'report':16,'reference':5,'official':18,'commentary':-20,'review':0}[b.source_type as 'report']||0)-({'report':16,'reference':5,'official':18,'commentary':-20,'review':0}[a.source_type as 'report']||0):0));}
export function recommendCheckSources(rows:Obj[],mode:string):Obj[]{
 const eligible=rows.filter(x=>x.readable&&(mode!=='product'||x.match_type==='exact')),chosen=new Set<string>(),counts=new Map<string,number>();
 for(const cap of [1,2,3])for(const row of eligible){const key=row.publisher||publisherKey(row.url);if(chosen.size>=6)break;if(chosen.has(row.url)||(counts.get(key)||0)>=cap)continue;chosen.add(row.url);counts.set(key,(counts.get(key)||0)+1);}
 return rows.map(x=>({...x,recommended:chosen.has(x.url)}));
}
export function selectCheckParagraphs(article:Obj,q:string,limit=16):Obj[]{
 const rows=(article.paragraphs||[]).filter((p:Obj)=>p.text),terms=productTokens(q);
 const score=(p:Obj)=>{const t=norm(p.text+' '+(p.section||''));return terms.filter(x=>t.includes(x)).length*5+(matchesProduct(t,q)?15:0)+(/\d/.test(t)?3:0)+(/keys|touch sensors|spec|technical|power|resistor|connectivity|OS$/i.test(p.section||'')?5:0)+(/however|but\b|drawback|conclusion|verdict|limitation|缺点|不足|结论|总结|争议|测试|通报/i.test(t)?4:0);};
 if(rows.length<=limit)return rows;
 const ranked=rows.map((p:Obj,i:number)=>({i,score:score(p)})).sort((a:any,b:any)=>b.score-a.score),picked=new Set<number>();
 const pick=(i:number)=>{if(picked.size<limit)picked.add(i);};
 const metadata=rows.findIndex((p:Obj)=>p.origin==='publisher_metadata');if(metadata>=0)pick(metadata);
 // Keep different kinds of material: modes, controls, power/specs, and criticism.
 for(const pattern of [/\bNOS\b|\bOS mode\b|oversampling|模式/i,/LCD keys|customizable keys|按键/i,/touch points|touch sensors|触摸/i,/output power|under.*load|gain level|输出功率|增益/i,/however|drawback|conclusion|verdict|limitations|缺点|不足|结论|总结/i]){const candidate=ranked.find((x:any)=>!picked.has(x.i)&&pattern.test(rows[x.i].text));if(candidate)pick(candidate.i);}
 for(let bucket=0;bucket<8;bucket++){const start=Math.floor(bucket*rows.length/8),end=Math.floor((bucket+1)*rows.length/8);const best=ranked.find((x:any)=>x.i>=start&&x.i<end&&!picked.has(x.i));if(best)pick(best.i);}
 for(const x of ranked)if(picked.size<limit)pick(x.i);
 return [...picked].sort((a,b)=>a-b).map(i=>rows[i]);
}
