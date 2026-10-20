const activeTask=j=>['queued','running','active','waiting','paused'].includes(j.status);
const labels={queued:'等待 VPS 接单',running:'VPS 正在处理',active:'正在下载',waiting:'等待来源响应',paused:'已暂停',complete:'文件已就绪',error:'下载失败',cancelled:'已取消',expired:'临时文件已过期',interrupted:'任务已中断'};
const phases={submitting:'正在启动下载引擎',extracting:'正在解析视频',downloading:'正在下载',processing:'正在合并视频',metadata:'正在获取 BT 元数据',peers:'等待可用做种者',queued:'引擎排队中',checking:'正在校验文件'};
function videoInput(raw){
 let u;try{u=new URL(String(raw).trim());}catch{throw Error('请输入完整的 HTTPS 视频页面链接。');}
 if(u.protocol!=='https:'||u.username||u.password||u.port||u.hash)throw Error('请使用不含账号密码、端口或片段的公开 HTTPS 视频链接。');
 const host=u.hostname.toLowerCase(),youtube=['youtube.com','www.youtube.com','m.youtube.com','music.youtube.com','youtu.be','www.youtu.be','www.youtube-nocookie.com'].includes(host);
 if(!youtube)return u.href;
 const id=host.endsWith('youtu.be')?u.pathname.slice(1):u.pathname==='/watch'?u.searchParams.get('v'):/^\/(?:shorts|live|embed)\/([^/]+)\/?$/.exec(u.pathname)?.[1];
 if(!/^[A-Za-z0-9_-]{11}$/.test(id||''))throw Error('请粘贴 YouTube 单个视频的 watch、youtu.be 或 Shorts 链接；频道、搜索和播放列表不能作为单个视频下载。');
 return 'https://www.youtube.com/watch?v='+id;
}
function videoFailureInfo(j){
 if(j.kind!=='video'||j.status!=='error')return null;
 const e=String(j.error||'');
 const match=(code,legacy)=>e.includes('['+code+']')||legacy?.test(e);
 let message,label;
 if(match('VIDEO_BOT_CHECK',/not a bot/i)){label='来源验证受阻';message='来源要求 VPS 完成人机验证。本机登录不会同步到 VPS；当前版本不接收来源 Cookie，重复下载无法解决。';}
 else if(match('VIDEO_AUTH',/来源要求登录或验证|来源要求登录|sign in|cookies|authentication/i)||match('VIDEO_ACCESS')){label='需要来源权限';message='VPS 没有该来源的登录会话或访问权限。连接 Media Vault 只授权本工具，电脑上登录来源网站不会同步到 VPS。';}
 else if(match('VIDEO_RUNTIME')){label='解析引擎需维护';message='视频签名解析或运行依赖失败，需要维护下载引擎；重复提交相同链接无法修复。';}
 else if(match('VIDEO_FORBIDDEN')){label='来源拒绝访问';message='来源拒绝 VPS 访问或限制地区；过期媒体直链需要重新获取。';}
 else if(match('VIDEO_FORMAT')||match('VIDEO_EXTRACT')||/暂不受视频引擎支持/.test(e)){label='当前链接未解析成功';message='当前解析器未提取到可下载媒体。请确认是具体视频页，或改用有效媒体直链；上游列出网站不代表所有链接都能下载。';}
 else if(match('VIDEO_RATE_LIMIT')){label='来源限流';message='来源正在限制请求频率，请稍后再试，勿连续重新提交。';}
 else return null;
 return {label,message};
}
function orderedTasks(jobs){return [...jobs].sort((a,b)=>Number(activeTask(b))-Number(activeTask(a))||(b.created||0)-(a.created||0));}
function taskView(j,now=Date.now()){
 const active=activeTask(j),stale=active&&Number.isFinite(j.updated)&&now-j.updated>90000,failure=videoFailureInfo(j);
 return {active,stale,failure,label:failure?.label||(active&&phases[j.phase])||labels[j.status]||'正在同步状态',progress:j.total>0?Math.min(100,100*(j.completed||0)/j.total):null,
 retry:!failure&&['error','cancelled','expired','interrupted'].includes(j.status)&&!['pikpak-account','pikpak-cleanup'].includes(j.kind),
 hint:stale?'状态更新已延迟，正在自动重连；请勿重复提交。':j.phase==='peers'?'BT 速度取决于做种者；无可用节点时可以取消后换一个种子。':j.status==='queued'?'任务已保存，VPS 接单后会自动更新。':j.status==='complete'?'点击保存到电脑，临时文件保留 24 小时。':j.status==='cancelled'?'可以重新下载，无需重新登录。':''};
}
