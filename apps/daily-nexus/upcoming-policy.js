/* Shared, deterministic event selection. Dates come from source snapshots. */
(function(root){
 const day=x=>String(x?.dateKey||x?.date||x?.start||'').slice(0,10);
 const ordinal=s=>/^\d{4}-\d{2}-\d{2}$/.test(s)?Date.parse(s+'T12:00:00Z')/86400000:NaN;
 const distance=(x,today)=>ordinal(day(x))-ordinal(today);
 const endDay=x=>{
  const end=String(x?.endDate||x?.end||'').slice(0,10);
  return ordinal(end)>=ordinal(day(x))?end:day(x);
 };
 const startsBy=(x,today,days)=>Number.isFinite(distance(x,today))&&distance(x,today)<=days&&ordinal(endDay(x))>=ordinal(today);
 const onDay=(items,date)=>items.filter(x=>startsBy(x,date,0));
 const time=x=>{
  if(x.allDay||x.allDay===undefined&&!x.manual&&/T12:00:00(?:$|Z|[+-])/.test(x.date))return '';
  if(x.timeKey)return x.timeKey;
  if(x.manual&&/T.*(?:Z|[+-]\d\d:\d\d)$/.test(x.date)){
   const date=new Date(x.date);
   return [date.getHours(),date.getMinutes()].map(n=>String(n).padStart(2,'0')).join(':');
  }
  return String(x.date||'').slice(11,16);
 };

 const sort=items=>[...items].sort((a,b)=>day(a).localeCompare(day(b))||time(a).localeCompare(time(b))||(b.priority||0)-(a.priority||0)||String(a.title||'').localeCompare(String(b.title||'')));

 const key=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
 function localItems(snapshot,today){
  const seen=new Set();
  return (snapshot.events||[]).filter(x=>x?.city&&x?.start&&/^https:\/\//.test(x.url||'')).sort((a,b)=>String(a.start).localeCompare(String(b.start))).flatMap(x=>{
   const id=key(x.title);
   if(!startsBy({date:x.start,end:x.end},today,45)||seen.has(id)||/(city hall.*clos|office.*clos|commission|council|board meeting|drop.in play|co.working|business advising|sculpture walk)/i.test(x.title))return [];
   seen.add(id);
   const seasonal=/(festival|market|fair|parade|lights|halloween|holiday|celebration|food|art walk|bonfire|firework)/i.test(x.title);
   const routine=/(happy hour|trivia|bingo|study hall|drop.in|weekly|storytime)/i.test(x.title);
   let source;try{source=new URL(x.url).hostname.replace(/^www\./,'')}catch{return []}
   return [{id:x.city==='Seattle'&&source==='seattlecenter.com'?'seattle-center:'+x.url.split('/').pop():'local:'+x.id,title:x.title,date:x.start.includes('T')?x.start:x.start+'T12:00:00',dateKey:x.start.slice(0,10),endDate:x.end?.slice(0,10),allDay:x.allDay===true||!x.start.includes('T'),category:'local',city:x.city,source:`${x.city} · ${x.free?'免费':x.cost||'官方活动'} · ${x.venue||''}`,sourceFamily:source,url:x.url,manual:false,stale:!!x.stale,priority:90+(seasonal?22:0)+(x.free?4:0)+(['Bellevue','Kirkland','Redmond'].includes(x.city)?5:0)-(routine?35:0)}];
  });
 }
 function within(items,days,today){return items.filter(x=>startsBy(x,today,days))}
 function overview(items,today){return items.filter(x=>startsBy(x,today,x.category==='local'?45:180))}
 function select(items){return sort(items).slice(0,6)}
 const api={day,endDay,time,sort,onDay,localItems,within,overview,select,distance};root.NexusUpcoming=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
