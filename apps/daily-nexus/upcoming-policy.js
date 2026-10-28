/* Shared, deterministic event selection. Dates come from source snapshots. */
(function(root){
 const day=x=>String(x?.dateKey||x?.date||x?.start||'').slice(0,10);
 const ordinal=s=>/^\d{4}-\d{2}-\d{2}$/.test(s)?Date.parse(s+'T12:00:00Z')/86400000:NaN;
 const distance=(x,today)=>ordinal(day(x))-ordinal(today);
 const key=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
 function localItems(snapshot,today){
  const seen=new Set();
  return (snapshot.events||[]).filter(x=>x?.city&&x?.start&&/^https:\/\//.test(x.url||'')).sort((a,b)=>String(a.start).localeCompare(String(b.start))).flatMap(x=>{
   const id=key(x.title),days=distance({date:x.start},today);
   if(!Number.isFinite(days)||days<0||days>45||seen.has(id)||/(city hall.*clos|office.*clos|commission|council|board meeting|drop.in play|co.working|business advising|sculpture walk)/i.test(x.title))return [];
   seen.add(id);
   const seasonal=/(festival|market|fair|parade|lights|halloween|holiday|celebration|food|art walk|bonfire|firework)/i.test(x.title);
   const routine=/(happy hour|trivia|bingo|study hall|drop.in|weekly|storytime)/i.test(x.title);
   let source;try{source=new URL(x.url).hostname.replace(/^www\./,'')}catch{return []}
   return [{id:x.city==='Seattle'&&source==='seattlecenter.com'?'seattle-center:'+x.url.split('/').pop():'local:'+x.id,title:x.title,date:x.start.includes('T')?x.start:x.start+'T12:00:00',dateKey:x.start.slice(0,10),endDate:x.end?.slice(0,10),category:'local',city:x.city,source:`${x.city} · ${x.free?'免费':x.cost||'官方活动'} · ${x.venue||''}`,sourceFamily:source,url:x.url,manual:false,stale:!!x.stale,priority:90+(seasonal?22:0)+(x.free?4:0)+(['Bellevue','Kirkland','Redmond'].includes(x.city)?5:0)-(routine?35:0)}];
  });
 }
 function within(items,days,today){return items.filter(x=>{const d=distance(x,today);return Number.isFinite(d)&&d>=0&&d<=days})}
 function overview(items,today){return items.filter(x=>{const d=distance(x,today);return Number.isFinite(d)&&d>=0&&d<=(x.category==='local'?45:180)})}
 function select(items,mode,today){
  const sorted=[...items].sort((a,b)=>distance(a,today)-distance(b,today)||(b.priority||0)-(a.priority||0));
  if(mode!=='all')return sorted.slice(0,4);
  const out=[];
  const add=x=>{if(x&&!out.some(r=>r.id===x.id))out.push(x)};
  const best=predicate=>sorted.filter(predicate).sort((a,b)=>((b.priority||0)-Math.max(0,distance(b,today))*.8)-((a.priority||0)-Math.max(0,distance(a,today))*.8))[0];
  add(best(x=>x.pinned));
  if(!out.some(x=>x.category==='local'))add(best(x=>x.category==='local'));
  if(!out.some(x=>x.category==='event'||x.category==='acg'))add(best(x=>x.category==='event'||x.category==='acg'));
  if(!out.some(x=>x.category==='tech'))add(best(x=>x.category==='tech'));
  for(const x of [...sorted].sort((a,b)=>(b.priority||0)-(a.priority||0))){
   if(out.length>=3)break;
   if(x.category==='local'&&(out.filter(y=>y.category==='local').length>=2||out.some(y=>y.category==='local'&&(y.city===x.city||(y.sourceFamily&&y.sourceFamily===x.sourceFamily)))))continue;
   add(x);
  }
  return out.sort((a,b)=>distance(a,today)-distance(b,today));
 }
 const api={localItems,within,overview,select,distance};root.NexusUpcoming=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
