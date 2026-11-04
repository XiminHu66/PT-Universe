// Convert official usage quantities into allowance consumption. Net charges are never a usage proxy.
const valid=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
const sku=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
const standards=new Map([['actions_linux','linux'],['actions_linux_slim','linux'],['actions_linux_arm','linux'],['actions_windows','windows'],['actions_windows_arm','windows'],['actions_macos','macos']]);
export function actionsUsage(report,repositories,snapshot,at){
 if(!Array.isArray(report?.usageItems)||!Array.isArray(repositories))throw Error('invalid-actions-usage');
 const owned=new Map(repositories.filter(r=>r.owner?.login?.toLowerCase()==='ximinhu66').map(r=>[r.name.toLowerCase(),r.private===true?'private':'public']));
 let consumed=0,incomplete=repositories.length>=100,publicMinutes=0;const minutes={linux:0,windows:0,macos:0},byRepo=new Map();
 for(const row of report.usageItems){
  const product=String(row.product||'').toLowerCase(),code=sku(row.sku),unit=String(row.unitType||'').toLowerCase();
  if(product.includes('sandbox')){if(valid(row.grossAmount))consumed+=row.grossAmount;else incomplete=true;continue;}
  if(product!=='actions'||/storage|cache|image/.test(code))continue;
  if(String(row.date||'').slice(0,7)!==at.slice(0,7)){incomplete=true;continue;}
  if(!standards.has(code)){if(row.grossAmount!==0)incomplete=true;continue;}
  const raw=String(row.repositoryName||'').toLowerCase(),name=raw.startsWith('ximinhu66/')?raw.slice(10):raw.includes('/')?'':raw,visibility=owned.get(name);
  if(!visibility||unit!=='minutes'||!valid(row.quantity)||!valid(row.grossAmount)){incomplete=true;continue;}
  if(visibility==='public'){publicMinutes+=row.quantity;continue;}
  consumed+=row.grossAmount;minutes[standards.get(code)]+=row.quantity;
  const previous=byRepo.get(name)||{name,minutes:0};previous.minutes+=row.quantity;byRepo.set(name,previous);
 }
 const allowance=snapshot.quotas?.find(q=>q.id==='gh-compute'),limitUSD=allowance?.unit==='USD'&&valid(allowance.limit)&&allowance.limit>0?allowance.limit:null;
 return {observedAt:at,computeUsedPercent:limitUSD===null?null:consumed/limitUSD*100,allowanceUSD:limitUSD,coveragePartial:incomplete,minutes,privateMinutes:Object.values(minutes).reduce((n,v)=>n+v,0),publicMinutes,repositoryMinutes:[...byRepo.values()].sort((a,b)=>b.minutes-a.minutes),note:'按当前仓库可见性排除公共仓库标准运行；使用官方计量原值折算附带计算额度，不使用折扣后的应付金额。'};
}
