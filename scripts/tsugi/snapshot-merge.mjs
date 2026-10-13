const pacificDay=stamp=>{const d=new Date(stamp);return Number.isFinite(+d)?new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles'}).format(d):''};
export function mergeFallback(current,incoming,now=new Date()){
 if(Date.parse(current?.generated_at)>Date.parse(incoming.generated_at))return {snapshot:current,skip:true};
 if(!incoming.items||!current?.items)return {snapshot:incoming,skip:false};
 const kept=[];const today=pacificDay(now);
 for(const [id,old] of Object.entries(current.sources||{})){
  const next=incoming.sources?.[id]||{};
  if(pacificDay(old.checked_at)!==today)continue;
  if((old.ok&&!old.degraded&&!old.fallback&&(!next.ok||next.degraded||next.fallback))||Number(old.verifiedChapterCount||0)>Number(next.verifiedChapterCount||0))kept.push(id);
 }
 const sources={...incoming.sources};let items=incoming.items.filter(x=>!kept.includes(x.source));
 for(const id of kept){sources[id]={...current.sources[id],preserved_from:current.refresh_source||'cloudflare'};items.push(...current.items.filter(x=>x.source===id));}
 return {snapshot:{...incoming,items,sources,preserved_sources:kept},skip:false};
}
