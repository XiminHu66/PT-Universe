export const activeTask=j=>['queued','running','active','waiting','paused'].includes(j.status);
const labels={queued:'等待 VPS 接单',running:'VPS 正在处理',active:'正在下载',waiting:'等待来源响应',paused:'已暂停',complete:'文件已就绪',error:'下载失败',cancelled:'已取消',expired:'临时文件已过期',interrupted:'任务已中断'};
const phases={submitting:'正在启动下载引擎',extracting:'正在解析视频',downloading:'正在下载',processing:'正在合并视频',metadata:'正在获取 BT 元数据',peers:'等待可用做种者',queued:'引擎排队中',checking:'正在校验文件'};
export function orderedTasks(jobs){return [...jobs].sort((a,b)=>Number(activeTask(b))-Number(activeTask(a))||(b.created||0)-(a.created||0));}
export function taskView(j,now=Date.now()){
 const active=activeTask(j),stale=active&&Number.isFinite(j.updated)&&now-j.updated>90000;
 return {active,stale,label:(active&&phases[j.phase])||labels[j.status]||'正在同步状态',progress:j.total>0?Math.min(100,100*(j.completed||0)/j.total):null,
 retry:['error','cancelled','expired','interrupted'].includes(j.status)&&!['pikpak-account','pikpak-cleanup'].includes(j.kind),
 hint:stale?'状态更新已延迟，正在自动重连；请勿重复提交。':j.phase==='peers'?'BT 速度取决于做种者；无可用节点时可以取消后换一个种子。':j.status==='queued'?'任务已保存，VPS 接单后会自动更新。':j.status==='complete'?'点击保存到电脑，临时文件保留 24 小时。':j.status==='cancelled'?'可以重新下载，无需重新登录。':''};
}
