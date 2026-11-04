// Owner-private, on-demand reader. All source scripts execute only in the
// existing dedicated browser; the delivered document contains plain text only.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
export const HOSTS=new Set(['www.bilinovel.net','www.bilinovel.com','bilinovel.com','bilinovel.net','www.linovelib.com','tw.linovelib.com','w.linovelib.com']);
export function sourceURL(raw){
 const u=new URL(raw);if(u.protocol!=='https:'||!HOSTS.has(u.hostname)||u.port||u.username||u.password||u.href.length>2048)throw Error('请输入 Bilinovel / Linovelib 的 HTTPS 链接');
 if(!/^\/(?:$|novel\/\d+(?:\.html|\/catalog|\/(?:vol_)?\d+(?:_\d+)?\.html)|(?:login|userdetail|bookcase)\.php|wenku\/(?:[\w.-]*)?)$/.test(u.pathname))throw Error('仅支持书库、作品、目录、章节和登录页面');
 return u.href;
}
export const chapterKey=url=>new URL(url).pathname.replace(/(\/\d+)_\d+(?=\.html$)/,'$1');
export function canJoin(start,next){try{sourceURL(start);sourceURL(next);return chapterKey(start)===chapterKey(next)&&/^\/novel\/\d+\/\d+(?:_\d+)?\.html$/.test(new URL(next).pathname)}catch{return false}}
// This function is serialized into the source tab. Never return source HTML.
export function snapshot(){
 const text=e=>(e?.innerText||'').trim();
 // Match the source's live visibility, including scale(0) bait paragraphs.
 // Off-screen paragraphs remain readable; text is never deduplicated by value.
 const visible=e=>{for(let n=e;n&&n.nodeType===1;n=n.parentElement){const s=getComputedStyle(n);if(s.display==='none'||['hidden','collapse'].includes(s.visibility)||Number(s.opacity)===0)return false;if(s.transform&&s.transform!=='none'){const m=new DOMMatrixReadOnly(s.transform);if(m.m11===0&&m.m12===0&&m.m21===0&&m.m22===0)return false}}return true};
 const body=text(document.body),params=typeof ReadParams==='object'?ReadParams:{},root=document.querySelector('#acontent,.bcontent');
 const pageText=[];
 if(root)for(const p of root.querySelectorAll(':scope > p')){
  if(!visible(p))continue;
  const walk=n=>{if(n.nodeType===3)return n.textContent;if(n.nodeType!==1||!visible(n)||/^(SCRIPT|STYLE|IFRAME|INS|IMG|DIV|VIDEO|AUDIO)$/.test(n.tagName)||/^[a-z]\d{4}$/i.test(n.tagName)||n.matches('.tp,.bd,[class*="advert"],[id*="google_ads"]'))return '';return n.tagName==='BR'?'\n':[...n.childNodes].map(walk).join('')};
  const v=walk(p).replace(/\u00a0/g,' ').trim();if(v)pageText.push(v);
 }
 const heading=text(document.querySelector('#atitle,h1,.book-title'))||document.title.split('_')[0];
 const unstyled=!!root&&[...root.querySelectorAll('p')].some(p=>[...p.attributes].some(a=>/^data-k\d+$/.test(a.name)))&&[...document.querySelectorAll('link[rel~=stylesheet]')].some(l=>!l.disabled&&!l.sheet);
 const permissionWords=v=>{const t=v.replace(/\s+/g,'');return /(观看|觀看|播放|看).{0,12}(广告|廣告)/i.test(t)&&/权限|權限|解锁|解鎖|继续|繼續|获得|獲得/.test(t)};
 const permissionGate=[...document.querySelectorAll('dialog[open],[role=dialog],.layui-layer,.swal2-popup,.van-popup,.ant-modal,.el-dialog,.modal,.popup,.dialog,[class*=overlay],[class*=mask]')].some(e=>visible(e)&&permissionWords(text(e)))||[...document.querySelectorAll('body *')].slice(0,4000).some(e=>{const t=text(e);if(t.length>1500||!permissionWords(t)||!visible(e))return false;const s=getComputedStyle(e);return s.position==='fixed'||Number(s.zIndex)>=1000});
 const challenge=/^(Just a moment|Attention Required)/i.test(document.title)||!!document.querySelector('#challenge-running,#cf-challenge-running');
 const loading=unstyled||/(?:内容|內容).{0,3}(?:加载|加載|載入).{0,3}(?:失败|失敗|中)/.test(pageText.join(''));
 const loginNeeded=[...document.querySelectorAll('input[type=password]')].some(visible)||(!root&&body.length<2000&&/(?:请先|請先|尚未|未).{0,6}登[录錄入]|登[录錄入]失[败敗]/.test(body));
 const reason=permissionGate||challenge?'source-verification':loginNeeded?'login':loading?'loading':!pageText.length&&/^\/novel\/\d+\/\d+(?:_\d+)?\.html$/.test(location.pathname)&&/积分广告|積分廣告|观看广告|觀看廣告|阅读授权|閱讀授權|請先登[錄入]|请先登录/.test(body)?'source-verification':null;

 const id=String(params.articleid||location.pathname.match(/\/novel\/(\d+)/)?.[1]||'');
 const validLink=a=>{try{const u=new URL(a.href,location.href);return u.protocol==='https:'&&['www.bilinovel.net','bilinovel.net','www.bilinovel.com','bilinovel.com','www.linovelib.com','tw.linovelib.com','w.linovelib.com'].includes(u.hostname)?u:null}catch{return null}};
 const isCatalog=/\/catalog\/?$/.test(location.pathname),chapters=[];let volume='';
 if(isCatalog){
  const items=[...document.querySelectorAll('.volume-chapters > li')];
  if(items.length)for(const item of items){if(item.classList.contains('chapter-bar')){volume=text(item.querySelector('h3'))||text(item);continue}if(!item.classList.contains('jsChapter'))continue;const a=item.querySelector('a[href]'),u=a&&validLink(a);if(u&&new RegExp('^/novel/'+id+'/\\d+(?:_\\d+)?\\.html$').test(u.pathname)&&text(a))chapters.push({title:text(a),url:u.href,volume,illustration:/^(插[图圖]|彩[图圖]|[图圖]片)(?:[（(].*?[）)])?$/.test(text(a))});}
  else for(const a of document.querySelectorAll('#catalogWrapper a.chapter-li-a,.chapter-list a[href]')){const u=validLink(a);if(u&&new RegExp('^/novel/'+id+'/\\d+(?:_\\d+)?\\.html$').test(u.pathname)&&text(a)&&!/^([上下]一[页頁章]|目[录錄])/.test(text(a)))chapters.push({title:text(a),url:u.href,volume:''});}
 }
 const books=[];if(!root&&!isCatalog)for(const a of document.querySelectorAll('a[href]')){const u=validLink(a),title=text(a);if(u&&/^\/novel\/\d+\.html$/.test(u.pathname)&&title&&!/^(返回|首页|首頁)$/.test(title))books.push({title,url:u.href});}
 const nextLabel=text(document.querySelector('#footlink .nextlink,.footlink .nextlink'));
 const nav=(name,selector)=>{try{const raw=params[name]||document.querySelector(selector)?.getAttribute('href');return raw?new URL(raw,location.href).href:null}catch{return null}};
 return {url:location.href,title:heading,bookTitle:params.articlename||text(document.querySelector('.book-title'))||text(document.querySelector('.atitle h3'))||heading,bookId:id,paragraphs:reason?[]:pageText,reason,category:isCatalog?'catalog':root?'chapter':'books',next:nav('url_next','#footlink .nextlink'),previous:nav('url_previous','#footlink .prevlink'),catalog:nav('url_index','#footlink .indexlink')||(id?new URL('/novel/'+id+'/catalog',location.href).href:null),nextPage:/下一[页頁]/.test(nextLabel),chapters:[...new Map(chapters.map(x=>[x.url,x])).values()].slice(0,4000),books:[...new Map(books.map(x=>[x.url,x])).values()].slice(0,80),ready:document.readyState==='complete',illustration:!!root&&!pageText.length&&/插[图圖]|彩[图圖]/.test(heading)};
}

const BLOCKED=['*doubleclick.net*','*googlesyndication.com*','*googletagservices.com*','*google-analytics.com*','*adservice.google.*','*popads.net*','*popcash.net*','*juicyads.com*','*exoclick.com*','*.mp4*','*.webm*','*.m3u8*','*.jpg*','*.jpeg*','*.png*','*.gif*','*.webp*'];
export const VERSION='3.0.2';
export function destinationMatches(actual,expected){try{const a=new URL(sourceURL(actual)),b=new URL(sourceURL(expected));return a.pathname.replace(/\/$/,'')===b.pathname.replace(/\/$/,'')}catch{return false}}
export function assertMemoryBudget(info){const total=Number(String(info).match(/MemTotal:\s+(\d+)/)?.[1]),available=Number(String(info).match(/MemAvailable:\s+(\d+)/)?.[1]);if(!Number.isFinite(total)||total<=0||!Number.isFinite(available)||available<0)throw Error('暂时无法确认服务器可用内存，请稍后再试');if(available<total*.15)throw Error('VPS 可用内存已到15%保留边界，请稍后再读')}
const delay=ms=>new Promise(r=>setTimeout(r,ms));
export class Reader {
 constructor({data,endpoint,control,admit=async()=>{},clock=Date.now}={}){
  if(!control)throw Error('Dedicated browser control required');this.control=control;this.endpoint=endpoint||control.endpoint;this.targetFile=join(data,'reader-target.json');this.admit=admit;this.clock=clock;this.last=0;this.manual=false;this.verifying=false;this.paused=false;this.busy=false;this.pending=null;
  this.startup=Promise.resolve().then(()=>control.connect()).then(()=>control.closePages()).catch(()=>{}).finally(()=>control.disconnect?.());
  this.timer=setInterval(()=>{if(!this.busy&&this.last&&this.clock()-this.last>180000)void this.suspend({keepPending:true}).catch(()=>{})},10000);this.timer.unref();
 }
 async serial(fn,{touch=true}={}){if(this.busy)throw Error('上一项操作仍在进行，请稍候');this.busy=true;if(touch)this.last=this.clock();this.deadline=this.clock()+65000;try{await this.startup;return await fn()}finally{this.busy=false;if(touch&&this.last)this.last=this.clock()}}
 async memoryGuard(){let info;try{info=await readFile('/proc/meminfo','utf8')}catch{throw Error('暂时无法确认服务器可用内存，请稍后再试')}assertMemoryBudget(info);}
 async ensure(){
  let fresh=false;try{await this.control.connect()}catch{
   await this.admit();await this.memoryGuard();const r=await fetch(this.endpoint+'/json/new?about:blank',{method:'PUT',signal:AbortSignal.timeout(6000)});if(!r.ok)throw Error('阅读浏览器未就绪');const t=await r.json();if(!/^[A-Fa-f0-9]+$/.test(t.id))throw Error('浏览器窗口无效');await mkdir(dirname(this.targetFile),{recursive:true});await writeFile(this.targetFile,JSON.stringify({id:t.id}),{mode:0o600});this.control.owned.add(t.id);await this.control.connect(t.id);fresh=true;
  }
  this.hasTab=true;this.last||=this.clock();
  if(this.paused){await this.control.command('Page.setWebLifecycleState',{state:'active'}).catch(()=>{});this.paused=false;}
  await this.control.command('Emulation.setDeviceMetricsOverride',{width:390,height:760,deviceScaleFactor:1,mobile:true});await this.control.command('Network.enable');
  if(this.guardedSocket!==this.control.ws&&this.control.ws){this.guardedSocket=this.control.ws;this.control.ws.addEventListener('message',event=>{let m;try{m=JSON.parse(event.data)}catch{return}if(m.method!=='Fetch.requestPaused')return;const p=m.params;let allow=this.manual&&!this.paused;if(!allow&&!this.paused)try{const u=new URL(p.request.url);allow=u.protocol==='https:'&&HOSTS.has(u.hostname)&&!['Image','Media','Font'].includes(p.resourceType)}catch{}void this.control.command(allow?'Fetch.continueRequest':'Fetch.failRequest',allow?{requestId:p.requestId}:{requestId:p.requestId,errorReason:'BlockedByClient'}).catch(()=>{});});}
  await this.control.command('Fetch.enable',{patterns:[{urlPattern:'*',requestStage:'Request'}]});await this.filters();return fresh;
 }
 async filters(){await this.control.command('Network.setBlockedURLs',{urls:this.paused?['*']:this.manual?[]:BLOCKED});}
 async navigate(raw){const url=sourceURL(raw);await this.ensure();this.control.selected=null;await this.control.connect(await this.control.mainId());await this.filters();this.lastURL=url;const nav=await this.control.command('Page.navigate',{url});if(nav.errorText)throw Error('原站暂时无法打开，请稍后重试');return this.wait(url,nav.loaderId)}
 async read(){const r=await this.control.command('Runtime.evaluate',{expression:`(${snapshot.toString()})()`,returnByValue:true});const s=r.result?.value;if(!s)throw Error('页面尚未就绪，请稍后重试');sourceURL(s.url);return s;}
 async wait(url,loaderId){const until=Math.min(this.deadline||Infinity,this.clock()+22000);let latest,signature='',stable=0;
  while(this.clock()<until){if(this.cancelled)throw Error('已取消读取');if(this.control.dialog)return {kind:'verification',reason:'dialog',url:url||this.lastURL};try{
   if(loaderId){const tree=await this.control.command('Page.getFrameTree');if(tree.frameTree?.frame?.loaderId!==loaderId){await delay(300);continue;}}
   const s=await this.read();if((!url||destinationMatches(s.url,url)||s.reason==='login'&&!!loaderId)&&s.ready){latest=s;if(s.reason==='login'&&url&&!destinationMatches(s.url,url))this.returnAfterLogin=url;if(s.reason==='loading'){await delay(450);continue;}const sig=JSON.stringify([s.url,s.reason,s.paragraphs,s.chapters?.length,s.books?.length]);stable=sig===signature?stable+1:0;signature=sig;if(s.reason||stable>=1&&(s.paragraphs?.length||s.chapters?.length||s.books?.length||s.illustration))return s;}
  }catch{}await delay(450);}
  if(latest?.reason)return {...latest,reason:latest.reason==='loading'?'source-verification':latest.reason};throw Error(url?.endsWith('/catalog')?'目录尚未加载完成，请重试；不会使用上一页内容':'原站加载超时，已保留当前阅读内容，请重试');
 }
 async collect(s){
  if(s.reason||s.kind==='verification'){this.pending??={start:this.returnAfterLogin||s.url||this.lastURL,paragraphs:[],pages:0,title:s.title,bookTitle:s.bookTitle,bookId:s.bookId,previous:s.previous,catalog:s.catalog};this.verifying=true;return {kind:'verification',reason:s.reason||'source-verification',url:s.url||this.lastURL,message:s.reason==='login'?'请先登录原站，再继续读取账号内容。':'原站要求验证或正文尚未完整加载，请在原站窗口确认后继续。'};}
  if(!s.paragraphs?.length){if(s.category==='catalog'||/\/catalog$/.test(s.url||'')){if(!s.chapters?.length)throw Error('原站目录为空或尚未加载完成，请重试');return {kind:'catalog',url:s.url,title:s.title,bookTitle:s.bookTitle,bookId:s.bookId,chapters:s.chapters};}if(s.illustration)return {kind:'illustration',...s};if(s.books?.length)return {kind:'books',url:s.url,title:s.title,books:s.books};this.verifying=true;return {kind:'verification',url:s.url,message:'原站暂未提供可读文字，请检查原站页面。'};}
  const p=this.pending||{start:s.url,paragraphs:[],pages:0,seen:[],title:s.title,bookTitle:s.bookTitle,bookId:s.bookId,previous:s.previous,catalog:s.catalog};this.pending=p;p.seen??=[];
  let current=s;
  for(;;){if(this.cancelled)throw Error('已取消读取');if(!canJoin(p.start,current.url))throw Error('章节已切换，请重新打开目标章节');if(!p.seen.includes(current.url)){p.paragraphs.push(...current.paragraphs);p.pages++;p.seen.push(current.url);}if(p.paragraphs.join('').length>400000)throw Error('章节过长，请分段读取');
   if(!current.nextPage||!current.next||!canJoin(p.start,current.next)){const result={kind:'chapter',formatVersion:3,url:p.start,title:p.title||current.title,bookTitle:p.bookTitle||current.bookTitle,bookId:p.bookId||current.bookId,previous:p.previous,next:current.next,catalog:p.catalog,paragraphs:p.paragraphs,pages:p.pages,readAt:new Date().toISOString()};this.pending=null;this.lastResult=result;return result;}
   if(p.seen.includes(current.next))throw Error('原站分页出现循环，请稍后重试');if(p.pages>=16||this.clock()>(this.deadline||Infinity)-5000)throw Error('本章读取超过限额，已暂停，请重试');current=await this.navigate(current.next);
   if(current.reason||!current.paragraphs?.length){this.verifying=true;return {kind:'verification',url:current.url,message:'本章后续分页需要验证；已读取文字暂存，验证后继续。'};}
  }
 }
 async finish(result){if(result.kind!=='verification'){this.verifying=false;await this.suspend({keepPending:true});}return result;}
 async open(url){url=sourceURL(url);const normalized=new URL(url);normalized.pathname=normalized.pathname.replace(/(\/\d+)_\d+(?=\.html$)/,'$1');url=normalized.href;return this.serial(async()=>{await this.admit();this.pending=null;this.returnAfterLogin=null;this.manual=false;this.verifying=false;this.cancelled=false;try{return await this.finish(await this.collect(await this.navigate(url)))}catch(e){await this.suspend({keepPending:false});throw e}})}
 async resume(){return this.serial(async()=>{this.cancelled=false;try{const fresh=await this.ensure();this.control.selected=null;await this.control.connect(await this.control.mainId());this.manual=false;await this.filters();let s=fresh?await this.navigate(this.returnAfterLogin||this.lastURL||'https://www.bilinovel.net/'):await this.wait();if(this.returnAfterLogin&&!s.reason){const dest=this.returnAfterLogin;this.returnAfterLogin=null;s=await this.navigate(dest)}return await this.finish(await this.collect(s));}catch(e){await this.suspend({keepPending:true});throw e}})}
 async manualStart({login=false,allowVerification=false}={}){return this.serial(async()=>{this.cancelled=false;this.verifying=true;this.manual=allowVerification===true||login===true;const fresh=await this.ensure();await this.filters();if(login){this.returnAfterLogin=this.pending?.start||this.lastURL&&!this.lastURL.includes('/login.php')&&this.lastURL||null;this.pending=null;await this.navigate('https://www.bilinovel.net/login.php')}else if(fresh)await this.navigate(this.lastURL||'https://www.bilinovel.net/');else if(this.manual)await this.control.action({type:'reload'});return {ok:true,manual:this.manual}})}
 async leaveManual(){return this.serial(async()=>{this.manual=false;this.verifying=false;if(this.control.ws)await this.filters().catch(()=>{});await this.suspend({keepPending:true});return {ok:true}})}
 async pause(){return this.serial(async()=>{if(this.verifying&&this.control.ws){this.paused=true;await this.filters().catch(()=>{});await this.control.command('Page.stopLoading').catch(()=>{});await this.control.command('Page.setWebLifecycleState',{state:'frozen'}).catch(()=>{});}return {ok:true}},{touch:false})}
 async wake(){return this.serial(async()=>{if(!this.verifying)throw Error('验证会话已释放，请重新连接');await this.ensure();return {ok:true}})}
 async screen(){return this.serial(async()=>{if(!this.verifying||this.paused||!this.last||this.clock()-this.last>180000){if(!this.paused)await this.suspend({keepPending:true});throw Error(this.paused?'验证已暂停，点击恢复连接':'验证会话已释放，点击重新连接');}await this.control.connect();const tabs=await this.control.targets();for(const t of tabs.slice(4))await this.control.command('Target.closeTarget',{targetId:t.id}).catch(()=>{});return {...await this.control.screen(),manual:this.manual,width:390,height:760}},{touch:false})}
 async action(input){return this.serial(async()=>{if(!this.verifying||this.paused)throw Error('请先恢复验证连接');await this.control.action(input);return {ok:true}})}
 async suspend({keepPending=false}={}){this.last=0;this.manual=false;this.verifying=false;this.paused=false;if(!keepPending)this.pending=null;if(this.hasTab||this.control.ws)await this.control.closePages().catch(()=>{});this.control.disconnect?.();this.hasTab=false;}
 async close(){clearInterval(this.timer);await this.startup;await this.suspend()}
}
export function createReader({data,origin,token,control,admit,reader=new Reader({data,control,admit})}){
 const assets=join(dirname(fileURLToPath(import.meta.url)),'public');
 const json=(res,status,value)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'private,no-store'});res.end(JSON.stringify(value))};
 const handler=async(req,res,url)=>{
  if(url.pathname!=='/reader'&&!url.pathname.startsWith('/reader/'))return false;
  if(url.pathname==='/reader'){res.writeHead(308,{location:'/bilipack/reader/'});res.end();return true}
  try{
   if(req.method==='POST'&&req.headers.origin!==origin){json(res,403,{error:'请从私有阅读页操作'});return true}
   const route=url.pathname.slice('/reader'.length);
   if(req.method==='GET'&&route==='/api/state'){json(res,200,{token,version:VERSION,idleMinutes:3,session:'按需浏览器会话',active:!!reader.hasTab,manual:reader.verifying});return true}
   let input={};if(req.method==='POST'){let raw='';for await(const b of req){raw+=b;if(raw.length>16000)throw Error('请求过大')}input=JSON.parse(raw||'{}')}
   let value;
   if(req.method==='POST'&&route==='/api/open')value=await reader.open(sourceURL(input.url));
   else if(req.method==='POST'&&route==='/api/cancel'){reader.cancelled=true;value={ok:true}}
   else if(req.method==='POST'&&route==='/api/resume')value=await reader.resume();
   else if(req.method==='POST'&&route==='/api/manual')value=await reader.manualStart(input);
   else if(req.method==='POST'&&route==='/api/leave-manual')value=await reader.leaveManual();
   else if(req.method==='POST'&&route==='/api/pause')value=await reader.pause();
   else if(req.method==='POST'&&route==='/api/wake')value=await reader.wake();
   else if(req.method==='POST'&&route==='/api/action')value=await reader.action(input);
   else if(req.method==='POST'&&route==='/api/suspend'){await reader.suspend();value={ok:true}}
   else if(req.method==='POST'&&route==='/api/screen')value=await reader.screen();
   else if(['GET','HEAD'].includes(req.method)&&['/','/app.js','/style.css','/manifest.webmanifest','/icon.svg'].includes(route)){
    const name=route==='/'?'index.html':route.slice(1),bytes=await readFile(join(assets,name));res.writeHead(200,{'content-type':name.endsWith('.js')?'text/javascript; charset=utf-8':name.endsWith('.css')?'text/css; charset=utf-8':name.endsWith('.svg')?'image/svg+xml':name.endsWith('.webmanifest')?'application/manifest+json':'text/html; charset=utf-8','cache-control':'private,no-store'});res.end(req.method==='HEAD'?undefined:bytes);return true;
   }else{json(res,404,{error:'页面不存在'});return true}
   json(res,200,value);
  }catch(e){json(res,400,{error:String(e.message).slice(0,180)})}return true;
 };
 handler.close=()=>reader.close();return handler;
}
