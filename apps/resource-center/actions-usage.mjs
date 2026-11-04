import {finite} from './model.mjs?v=3';
export function actionsQuotas(data){
 const u=data.actionUsage,privateRepos=data.repositories.filter(r=>r.visibility==='private'&&(r.workflows?.length||r.artifacts)),artifacts=privateRepos.map(r=>r.artifacts),available=artifacts.filter(Boolean),bytes=available.reduce((n,a)=>n+(a.bytes||0),0),sample=available.length?new Date(Math.min(...available.map(a=>Date.parse(a.observedAt)))).toISOString():null;
 const storageLimit=data.quotas?.find(q=>q.id==='gh-storage')?.limit;
 const base={readonly:true,provider:'GitHub Actions',url:'https://github.com/settings/billing',maxAgeHours:8};
 const q=[{...base,id:'gh-compute-usage',name:'本月计算额度',period:'month',cumulative:true,used:finite(u?.computeUsedPercent)?u.computeUsedPercent:null,limit:100,unit:'%',observedAt:u?.observedAt,coveragePartial:!!u?.coveragePartial,source:'GitHub 官方用量报告 · 私有仓库分类',note:'按账户附带计算额度折算占比；公共标准运行不占用此额度。不是本月应付金额。',impact:'暂缓新增私有仓库构建，先核对剩余计算额度。'},
 {...base,id:'gh-artifacts',name:'私有产物存储',period:'point',used:available.length?bytes/1e6:null,limit:finite(storageLimit)?storageLimit*1000:null,unit:'MB',observedAt:sample,maxAgeHours:2,lowerBound:available.length!==privateRepos.length||available.some(a=>a.partial),source:'GitHub Artifacts API · 未过期私有产物',note:'当前私有产物占用；对照已核对的套餐容量，不等同月度累计 GB-hours。',impact:'私有产物接近套餐容量，先核对大产物与保留期限。'}];
 const cached=data.repositories.filter(r=>r.cache&&finite(r.cache.bytes)).sort((a,b)=>b.cache.bytes-a.cache.bytes),worst=cached[0];
 q.push({...base,id:'gh-cache',name:'单仓库最大缓存',period:'point',used:worst?worst.cache.bytes/1e9:null,limit:10,unit:'GB',lowerBound:data.repositories.some(r=>r.workflows?.length&&!r.cache)||data.automatic?.['github-storage']?.state==='partial',observedAt:worst?.cache.observedAt,maxAgeHours:2,source:'GitHub Cache API · 仓库逐项读取',note:worst?`${worst.name}；10 GB 为每仓库的默认免费额度，各仓库独立计算。`:'未取得缓存占用',impact:'此仓库缓存接近默认额度，请核对缓存键与保留策略。'});
 return q;
}
