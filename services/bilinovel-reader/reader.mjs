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
export const chapterKey=url=>new URL(url).pathname.replace(/_\d+(?=\.html$)/,'');
export function canJoin(start,next){try{return HOSTS.has(new URL(next).hostname)&&chapterKey(start)===chapterKey(next)&&/^\/novel\/\d+\/\d+(?:_\d+)?\.html$/.test(new URL(next).pathname)}catch{return false}}
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
 const gate=unstyled||permissionGate||/^(Just a moment|Attention Required)/i.test(document.title)||!!document.querySelector('#challenge-running,#cf-challenge-running')||/(?:内容|內容).{0,3}(?:加载|加載|載入).{0,3}(?:失败|失敗|中)/.test(pageText.join(''));
 const reason=gate?'source-verification':!pageText.length&&/^\/novel\/\d+\/\d+(?:_\d+)?\.html$/.test(location.pathname)&&/积分广告|積分廣告|观看广告|觀看廣告|阅读授权|閱讀授權|請先登[錄入]|请先登录/.test(body)?'source-verification':document.querySelector('input[type=password]')?'login':null;
 const links=[...document.querySelectorAll('a[href]')].map(a=>({title:text(a).replace(/\s+/g,' '),url:a.href}));
 const chapters=links.filter(a=>/^\/novel\/\d+\/\d+(?:_\d+)?\.html$/.test(new URL(a.url).pathname)&&a.title);
 const books=links.filter(a=>/^\/novel\/\d+\.html$/.test(new URL(a.url).pathname)&&a.title&&!/^(返回|首页|首頁)$/.test(a.title));
 const chaptersUnique=[...new Map(chapters.map(x=>[x.url,x])).values()].slice(0,4000),booksUnique=[...new Map(books.map(x=>[x.url,x])).values()].slice(0,80);
 const nextLabel=text(document.querySelector('#footlink .nextlink,.footlink .nextlink'));
 const volume=chaptersUnique.length?text(document.querySelector('.volume-title,h2')):'';
 return {url:location.href,title:heading,bookTitle:params.articlename||text(document.querySelector('.book-title'))||heading,bookId:String(params.articleid||location.pathname.match(/\/novel\/(\d+)/)?.[1]||''),paragraphs:reason?[]:pageText,reason,next:params.url_next?new URL(params.url_next,location.href).href:null,previous:params.url_previous?new URL(params.url_previous,location.href).href:null,catalog:params.url_index?new URL(params.url_index,location.href).href:null,nextPage:/下一[页頁]/.test(nextLabel),chapters:chaptersUnique,books:booksUnique,volume,ready:document.readyState==='complete'};
}
const BLOCKED=['*doubleclick.net*','*googlesyndication.com*','*googletagservices.com*','*google-analytics.com*','*adservice.google.*','*popads.net*','*popcash.net*','*juicyads.com*','*exoclick.com*','*.mp4*','*.webm*','*.m3u8*','*.jpg*','*.jpeg*','*.png*','*.gif*','*.webp*'];
export class Reader {
 constructor({data,endpoint,control}={}){this.endpoint=endpoint||control?.endpoint;this.targetFile=join(data,'reader-target.json');if(!control)throw Error('Dedicated browser control required');this.control=control;this.manual=false;this.busy=false;this.last=0;this.pending=null;this.lastURL=null;this.lastResult=null;this.timer=setInterval(()=>{if(!this.busy&&this.last&&Date.now()-this.last>10*60*1000)void this.suspend()},60000);this.timer.unref();}
 async serial(fn){if(this.busy)throw Error('上一项操作仍在进行，请稍候');this.busy=true;this.last=Date.now();try{return await fn()}finally{this.busy=false;this.last=Date.now()}}
 async ensure(){
  try{await this.control.connect()}catch{
   const r=await fetch(this.endpoint+'/json/new?about:blank',{method:'PUT',signal:AbortSignal.timeout(6000)});if(!r.ok)throw Error('阅读浏览器未就绪');const t=await r.json();if(!/^[A-Fa-f0-9]+$/.test(t.id))throw Error('浏览器窗口无效');await mkdir(dirname(this.targetFile),{recursive:true});await writeFile(this.targetFile,JSON.stringify({id:t.id}),{mode:0o600});this.control.owned.add(t.id);await this.control.connect(t.id);
  }
  await this.control.command('Emulation.setDeviceMetricsOverride',{width:390,height:760,deviceScaleFactor:1,mobile:true});
  await this.control.command('Network.enable');
  if(this.guardedSocket!==this.control.ws&&this.control.ws){
   this.guardedSocket=this.control.ws;
   this.control.ws.addEventListener('message',event=>{let m;try{m=JSON.parse(event.data)}catch{return}if(m.method!=='Fetch.requestPaused')return;const p=m.params;let allow=this.manual;
    if(!allow)try{const u=new URL(p.request.url);allow=u.protocol==='https:'&&HOSTS.has(u.hostname)&&!['Image','Media','Font'].includes(p.resourceType)}catch{}
    void this.control.command(allow?'Fetch.continueRequest':'Fetch.failRequest',allow?{requestId:p.requestId}:{requestId:p.requestId,errorReason:'BlockedByClient'}).catch(()=>{});
   });
  }
  await this.control.command('Fetch.enable',{patterns:[{urlPattern:'*',requestStage:'Request'}]});await this.filters();
 }
 async filters(){await this.control.command('Network.setBlockedURLs',{urls:this.manual?[]:BLOCKED});}
 async navigate(raw){const url=sourceURL(raw);await this.ensure();this.control.selected=null;await this.control.connect(await this.control.mainId());await this.filters();await this.control.command('Page.navigate',{url});this.lastURL=url;return this.wait(url)}
 async read(){const r=await this.control.command('Runtime.evaluate',{expression:`(${snapshot.toString()})()`,returnByValue:true});const s=r.result?.value;if(!s)throw Error('页面尚未就绪，请稍后重试');if(!HOSTS.has(new URL(s.url).hostname))throw Error('当前是外部弹窗，请切回原章节');return s;}
 async wait(url){
  const deadline=Date.now()+22000;let latest;
  while(Date.now()<deadline){
   if(this.control.dialog)return {kind:'verification',reason:'dialog',url};
   try{latest=await this.read();if(latest.url!=='about:blank'&&HOSTS.has(new URL(latest.url).hostname)&&latest.ready){if(latest.reason||latest.paragraphs.length||latest.chapters.length||latest.books.length){await new Promise(r=>setTimeout(r,450));return await this.read()}}}catch{}
   await new Promise(r=>setTimeout(r,450));
  }
  if(latest?.reason)return latest;
  return latest||{url,reason:'source-verification',paragraphs:[]};
 }
 async collect(s){
  if(s.reason||s.kind==='verification'){this.pending??={start:s.url,paragraphs:[],pages:0,title:s.title,bookTitle:s.bookTitle,bookId:s.bookId,previous:s.previous,catalog:s.catalog};return {kind:'verification',reason:s.reason||'source-verification',url:s.url,message:'请在验证窗口完成原站要求，再继续读取。'};}
  if(!s.paragraphs?.length){
   if(s.chapters?.length)return {kind:'catalog',...s,paragraphs:undefined};
   if(s.books?.length)return {kind:'books',title:s.title,url:s.url,books:s.books};
   return {kind:'verification',url:s.url,message:'未识别到可读正文，请检查原站页面。'};
  }
  const p=this.pending||{start:s.url,paragraphs:[],pages:0,title:s.title,bookTitle:s.bookTitle,bookId:s.bookId,previous:s.previous,catalog:s.catalog};this.pending=p;
  let current=s;
  for(;;){
   if(!canJoin(p.start,current.url))throw Error('章节已切换，请重新打开目标章节');
   p.paragraphs.push(...current.paragraphs);p.pages++;
   if(p.paragraphs.join('').length>400000)throw Error('章节过长，请分段读取');
   if(!current.nextPage||!current.next||!canJoin(p.start,current.next)){
    const value={kind:'chapter',formatVersion:2,url:p.start,title:p.title,bookTitle:p.bookTitle,bookId:p.bookId,previous:p.previous,next:current.next,catalog:p.catalog,paragraphs:p.paragraphs,pages:p.pages,readAt:new Date().toISOString()};this.pending=null;this.lastResult=value;return value;
   }
   if(p.pages>=16)throw Error('章节超过 16 页，请在原站继续阅读');
   current=await this.navigate(current.next);
   if(current.reason||current.kind==='verification'||!current.paragraphs?.length)return {kind:'verification',url:current.url,message:'本章后续分页需要验证；已读取部分会保留，验证后继续。'};
  }
 }
 async open(url){return this.serial(async()=>{this.pending=null;this.manual=false;return this.collect(await this.navigate(url))})}
 async resume(){return this.serial(async()=>{await this.ensure();this.control.selected=null;await this.control.connect(await this.control.mainId());this.manual=false;await this.filters();let s=await this.wait(this.lastURL);if(this.returnAfterLogin&&!s.reason){const destination=this.returnAfterLogin;this.returnAfterLogin=null;s=await this.navigate(destination)}return this.collect(s)})}
 async manualStart({login=false,allowVerification=false}={}){return this.serial(async()=>{await this.ensure();this.manual=allowVerification===true||login===true;await this.filters();if(login){this.returnAfterLogin=this.lastURL&&!this.lastURL.includes('/login.php')?this.lastURL:null;this.pending=null;await this.navigate('https://www.bilinovel.net/login.php')}else if(this.manual)await this.control.action({type:'reload'});return {ok:true,manual:this.manual}})}
 async leaveManual(){return this.serial(async()=>{this.manual=false;await this.ensure();await this.filters();return {ok:true}})}
 async screen(){return this.serial(async()=>{await this.ensure();return {...await this.control.screen(),manual:this.manual,width:390,height:760}})}
 async action(a){return this.serial(async()=>{await this.ensure();await this.control.action(a);return {ok:true}})}
 async suspend(){const used=!!this.last||!!this.control.ws;this.last=0;this.pending=null;this.lastResult=null;if(used)await this.control.closePages().catch(()=>{});this.control.disconnect();}
 async close(){clearInterval(this.timer);await this.suspend()}
}
// Legacy endpoint retained only to send old bookmarks to the local reader.
// No Reader instance, browser creation, screenshot polling or idle timer.
export function createReader({control}={}){
 const destination='https://ximinhu66.github.io/PT-Universe/apps/bilinovel-reader/';
 const cleanup=control ? Promise.resolve().then(()=>control.connect()).then(()=>control.closePages()).catch(()=>{}).finally(()=>control.disconnect()) : Promise.resolve();
 const handler=async(req,res,url)=>{
  if(url.pathname!=='/reader'&&!url.pathname.startsWith('/reader/'))return false;
  if(['GET','HEAD'].includes(req.method)&&['/reader','/reader/'].includes(url.pathname)){
   res.writeHead(302,{location:destination,'cache-control':'no-store'});res.end();return true;
  }
  res.writeHead(410,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});
  res.end(JSON.stringify({mode:'local',version:'2.0.0',url:destination,message:'远程阅读已停用，请使用原站净读。'}));return true;
 };
 handler.close=()=>cleanup;return handler;
}
