// Public REST reads can run directly in the owner's browser when shared edge
// egress cannot read GitHub. No credentials or private repository requests.
export async function readPublicGithub(previous,{fetcher=fetch,clock=Date.now}={}){
 const started=clock(),at=()=>new Date(clock()).toISOString(),owner='XiminHu66';
 async function json(path){const r=await fetcher('https://api.github.com'+path,{credentials:'omit',redirect:'error',headers:{accept:'application/vnd.github+json'},signal:AbortSignal.timeout(8000)});if(!r.ok)throw Error('公开 GitHub API 暂不可用（'+r.status+'）');return r.json();}
 const list=await json('/users/'+owner+'/repos?per_page=100&sort=pushed');if(!Array.isArray(list))throw Error('公开清单格式无效');
 const repos=list.filter(r=>r.owner?.login===owner&&!r.private).slice(0,20),metadata=[],storage=[];let partial=list.length>20;
 for(let i=0;i<repos.length;i+=3){if(clock()-started>24000){partial=true;break;}await Promise.all(repos.slice(i,i+3).map(async r=>{
  const old=previous.find(x=>x.name===r.name),base='/repos/'+owner+'/'+encodeURIComponent(r.name),row={name:r.name,visibility:'public',url:'https://github.com/'+owner+'/'+encodeURIComponent(r.name),note:'公开仓库 · 浏览器自动读取',workflows:old?.workflows||[],inventoryObservedAt:at()},results=await Promise.allSettled([json(base+'/actions/workflows?per_page=100'),json(base+'/actions/artifacts?per_page=100')]);
  if(results[0].status==='fulfilled'&&Array.isArray(results[0].value.workflows)){row.workflows=results[0].value.workflows.map(w=>({...old?.workflows?.find(x=>x.path===w.path),name:w.name,path:w.path,state:w.state,url:w.html_url,note:'名称与状态自动读取；触发规则保留源码盘点',observedAt:at()}));if(results[0].value.total_count>100)partial=true;}else partial=true;
  if(results[1].status==='fulfilled'&&Array.isArray(results[1].value.artifacts)){const d=results[1].value,a=d.artifacts.filter(x=>!x.expired);storage.push({name:r.name,artifacts:{bytes:a.reduce((n,x)=>n+(typeof x.size_in_bytes==='number'?x.size_in_bytes:0),0),count:a.length,partial:d.total_count>100,observedAt:at()}});}else partial=true;
  metadata.push(row);
 }));}
 const status=provider=>({provider,state:partial?'partial':'ok',coverage:'浏览器自动读取公开数据；私有仓库及缓存用量需要一次性授权',observedAt:at(),checkedAt:at()});
 return {inventory:{repositories:metadata,status:status('github-inventory')},storage:{repositories:storage,status:status('github-storage')}};
}
