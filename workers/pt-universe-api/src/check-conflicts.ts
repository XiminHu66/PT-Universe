type Obj=Record<string,any>;
// This is a conservative consistency check, not an assertion that either report is true.
export function officialResponseSignals(paragraphs:Obj[]){
 let absent=false,present=false;
 for(const p of paragraphs)for(const sentence of String(p.text||'').split(/[。！？\n]/)){
  const negative=/(?:尚未|均未|未|没有|暂无).{0,20}(?:公开回应|正式声明|发布.{0,8}声明|召回方案|官方回应)/.test(sentence);
  absent ||= negative;
  if(!negative&&/(?:官方|品牌方|厂商|车企).{0,45}(?:承诺|宣布|已回应|回应称|免费升级|召回|发布.{0,8}声明)/.test(sentence))present=true;
 }
 return {official_response_absent:absent,official_response_reported:present};
}
export function checkSourceConflicts(sources:Obj[],mode:string){
 if(mode!=='claim')return [];
 const rows=sources.map(s=>({id:s.id,type:s.source_type,signals:s.claim_signals||officialResponseSignals(s.paragraphs||[])}));
 const absent=rows.filter(s=>s.signals.official_response_absent),present=rows.filter(s=>s.signals.official_response_reported);
 if(!absent.length||!present.length||!absent.some(a=>present.some(p=>p.id!==a.id)))return [];
 return [{topic:'官方回应 / 整改状态',sourceIds:[...new Set([...absent,...present].map(s=>s.id))],unresolved:!rows.some(s=>s.type==='official'&&s.signals.official_response_reported),text:'不同报道对官方回应或整改状态的说法不一致。可能涉及报道时间或内容差异，需一手声明及发布时间核对，不能择一写成官方确认。'}];
}
export function guardCheckResult(payload:Obj,query:string,mode:string){
 const conflicts=checkSourceConflicts(payload.sources||[],mode),unresolved=conflicts.filter(c=>c.unresolved);
 if(!unresolved.length)return {...payload,source_conflicts:conflicts,policyVersion:1};
 const out=payload.output,summary=String(out.summary||''),acknowledges=/(?:官方|回应|整改|召回|升级)[^。]{0,80}(?:冲突|分歧|不一致|矛盾|无法确认|不能确认)|(?:冲突|分歧|不一致|矛盾|无法确认|不能确认)[^。]{0,80}(?:官方|回应|整改|召回|升级)/.test(summary);
 return {...payload,policyVersion:1,source_conflicts:conflicts,output:{...out,verdict:'insufficient',summary:acknowledges?summary:`关于「${query}」：现有报道对官方回应与整改状态存在分歧，且未获得可核对的一手声明，暂不能形成可靠的综合结论。应分别核对各来源的说法与发布时间，不能把单篇报道的主张当成官方确认。`,reasoning:(out.reasoning||[]).filter((p:Obj)=>!officialResponseSignals([p]).official_response_reported),unknowns:[...new Set([...unresolved.map(c=>c.text),...(out.unknowns||[])])].slice(0,8),scope:'仅公开报道；存在未解决的来源冲突，不代表官方确认',humanVerified:false}};
}
