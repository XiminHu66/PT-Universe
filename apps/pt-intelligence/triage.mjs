import * as M from './model.mjs';
export const fresh=x=>!x.sourceUpdatedAt||Date.now()-Date.parse(x.sourceUpdatedAt)<=36*36e5;
export const visibleTask=x=>x.type==='task'&&x.status!=='completed'&&(!x.snoozeUntil||x.snoozeUntil<=M.stamp());
export function focusItems(s){
 const terms=String(s.settings.keywords||'').split(/[,，]/).map(x=>x.trim().toLowerCase()).filter(Boolean);
 return M.ranked(s,s.inbox.filter(x=>M.active(s,x)).map(x=>M.viewItem(s,x)).filter(x=>!x.saved&&(x.action_required||x.important||x.source==='PT Intelligence'||fresh(x)&&Date.now()-Date.parse(x.timestamp||x.firstSeen)<7*864e5&&terms.some(t=>x.title.toLowerCase().includes(t)))));
}
export function pending(s){return M.ranked(s,[...s.inbox.filter(x=>M.active(s,x)).map(x=>M.viewItem(s,x)).filter(x=>x.action_required),...s.entities.filter(x=>x.type==='decision'&&x.reviewDate&&x.reviewDate<=M.day())])}
export function inboxItems(s,filter='focus',query='',source=''){
 let xs=s.inbox.map(x=>M.viewItem(s,x));
 if(filter==='focus')xs=focusItems(s);
 else if(filter==='changes')xs=changedItems(s).items;
 else xs=xs.filter(x=>filter==='archived'?x.archived:filter==='snoozed'?x.snoozeUntil>M.stamp()&&!x.archived:filter==='saved'?x.saved&&!x.archived:filter==='action'?M.active(s,x)&&x.action_required:filter==='important'?M.active(s,x)&&x.important:filter==='unread'?M.active(s,x)&&!x.read:M.active(s,x));
 const filtered=xs.filter(x=>(!query||M.fuzzy(x.title+' '+x.body+' '+x.source,query))&&(!source||x.source===source));return ['focus','action','important'].includes(filter)?M.ranked(s,filtered):filtered.sort((a,b)=>String(b.timestamp||b.firstSeen||'').localeCompare(String(a.timestamp||a.firstSeen||'')));
}
export function taskItems(s,filter,query=''){
 return M.tasks(s).filter(x=>filter==='all'?true:filter==='today'?M.dueTasks(s).some(t=>t.id===x.id):x.status===filter).filter(x=>!query||M.fuzzy(x.title+' '+x.body+' '+x.tags?.join(' '),query)).sort((a,b)=>(a.order||0)-(b.order||0));
}
export function addToday(s,source){
 const existing=M.tasks(s).find(x=>!x.readonly&&x.status!=='completed'&&(x.originId===source.id||x.related?.includes(source.id)));
 if(existing){existing.status='today';existing.snoozeUntil=null;existing.updatedAt=M.stamp();return {task:existing,created:false}}
 const t={id:M.uid(),type:'task',title:source.title,body:source.body||'',url:source.url||'',status:'today',priority:source.action_required?3:2,projectId:source.projectId||'',related:[source.id,...(source.projectId?[source.projectId]:[])],originId:source.id,source:'PT Intelligence',createdAt:M.stamp(),updatedAt:M.stamp(),order:M.tasks(s).length};
 s.entities.push(t);return {task:t,created:true};
}
export function sourceIssues(s){return Object.entries(s.sources).filter(([,x])=>x.state==='error'||x.warning||x.updatedAt&&Date.now()-Date.parse(x.updatedAt)>36*36e5)}

export function changedItems(s){const dates=Object.keys(s.snapshots||{}).filter(d=>d<M.day()).sort(),baseline=dates.at(-1);if(!baseline)return {baseline:null,items:[]};const prior=s.snapshots[baseline]||{};return {baseline,items:s.inbox.filter(x=>M.active(s,x)&&(!prior[x.id]||prior[x.id]!==M.hash(x.title+'|'+x.body))).map(x=>M.viewItem(s,x))}}
