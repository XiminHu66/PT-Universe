// These functions execute in Browser Run; only compact records cross into the Worker.
export async function browserSiteList(input:{url:string;source:string;label:string;type:string;limit:number}) {
 const {url,source,label,type,limit}=input;
 const plain=(n:any)=>String(n?.textContent||'').replace(/\s+/g,' ').trim();
 const absolute=(s:string)=>{try{return new URL(s,url).href}catch{return ''}};
 const work=(s:string)=>{try{const p=new URL(s).pathname;return source==='linovelib'?/\/(?:novel|book)\/\d+(?:\.html)?\/?$/.test(p):/\/(?:comic|h5\/details\/comic)\/[^/]+\/?$/.test(p)}catch{return false}};
 let doc:any=(globalThis as any).document;
 try{const r=await fetch(url,{credentials:'same-origin',signal:AbortSignal.timeout(8000)});if(r.ok)doc=new (globalThis as any).DOMParser().parseFromString(await r.text(),'text/html')}catch{}
 let scope:any=doc;
 if(source==='linovelib')scope=doc.querySelector('.book-ol-normal')||doc;
 if(source==='copymanga'){
  const marker=Array.from(doc.querySelectorAll('h1,h2,h3,h4,h5,h6')).find(n=>/^(?:热门(?:漫画)?更新|熱門(?:漫畫)?更新|最新更新|最近更新|漫畫更新|漫画更新)$/.test(plain(n).replace(/\s+/g,'')));
  for(let n=(marker as any)?.parentElement;n&&n!==doc;n=n.parentElement){const count=new Set(Array.from(n.querySelectorAll('a[href]')).map((a:any)=>absolute(a.getAttribute('href'))).filter(work)).size;if(count>=4&&count<=160){scope=n;break}}
  if(scope===doc)throw Error('CopyManga 最新更新区块未找到，不能用排行榜替代');
 }
 const rows:any[]=[],seen=new Set<string>();
 for(const a of Array.from(scope.querySelectorAll('a[href]')) as any[]){
  const href=absolute(a.getAttribute('href'));if(!work(href)||seen.has(href))continue;
  let card=a;
  for(let n=a.parentElement,depth=0;n&&depth<6;n=n.parentElement,depth++){
   const count=new Set(Array.from(n.querySelectorAll('a[href]')).map((x:any)=>absolute(x.getAttribute('href'))).filter(work)).size;
   if(count<=1&&plain(n).length<1600){card=n;if(['LI','ARTICLE','TR'].includes(n.tagName))break}else break;
  }
  const img=card.querySelector('img'),heading=a.querySelector('h1,h2,h3,h4'),raw=plain(heading)||a.getAttribute('title')||plain(a);
  const title=(/\.\.\.|…/.test(raw)||!raw?img?.getAttribute('alt')||img?.getAttribute('title'):raw)||img?.getAttribute('alt')||'';
  if(title.length<2)continue;
  const context=plain(card),chapter=Array.from(card.querySelectorAll('a[href]')).find((x:any)=>x!==a&&/第\s*\S+?(?:章|话|話|回|卷)/.test(plain(x))) as any;
  const m=context.match(/(?:更新至|最新(?:章节|章節|话|話|卷)?)[：:\s]*([^|]{1,60})/);
  const latest=(chapter?plain(chapter):m?.[1]?.trim()||'').replace(/(?:更新[于於]|最後更新|最后更新)[：:\s]*.*$/,'').trim();
  seen.add(href);rows.push({type,source,source_label:label,title,latest,updated_text:context.match(/20\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2}(?:日)?(?:\s+\d{1,2}:\d{2})?/)?.[0]||'',url:href,cover:absolute(img?.getAttribute('data-src')||img?.getAttribute('data-original')||img?.getAttribute('src')||''),latest_url:chapter?absolute(chapter.getAttribute('href')):'',order:rows.length});
  if(rows.length>=limit)break;
 }
 return rows;
}

export async function browserChapterBatch(input:{urls:string[];source:string;currentUrl?:string}) {
 const plain=(n:any)=>String(n?.textContent||'').replace(/\s+/g,' ').trim();
 const parse=(doc:any,url:string)=>{
  const out:any={};const anchors=Array.from(doc.querySelectorAll('a[href]')) as any[];
  if(input.source==='linovelib'){
   const marker=anchors.find(a=>/(?:最后|最後)\s*更新/.test(plain(a)));
   if(marker){const value=plain(marker);out.latest=plain(marker.querySelector('p'))||value.replace(/^(?:最后|最後)\s*更新(?:时间|時間|日期)?[·：:\s]*20\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2}(?:日)?\s*/,'');out.updated_text=value.match(/20\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2}(?:日)?(?:\s+\d{1,2}:\d{2})?/)?.[0]||'';out.latest_url=new URL(marker.getAttribute('href'),url).href;}
  }else{
   const m=String(doc.title||'').match(/[-－]([^－-]{1,80})[-－](?:拷[贝貝]|Copy)/i);
   const latest=anchors.find(a=>/(?:最新|最后|最後)\s*(?:章节|章節|话|話|更新)/.test(plain(a))&&/第/.test(plain(a)));
   out.latest=m?.[1]?.trim()||latest&&plain(latest).match(/第\s*[^|]{1,48}?(?:话|話|章|回|卷)/)?.[0]||'';
   out.updated_text=plain(doc.body).match(/(?:最后|最後)\s*更新(?:时间|時間|日期)?[：:\s]*(20\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2}(?:日)?)/)?.[1]||'';out.latest_url=latest?new URL(latest.getAttribute('href'),url).href:url;
  }
  return out.latest&&!/^(?:最新更新|更新|目录|目錄)$/.test(out.latest)?out:{diagnostic_title:String(doc.title||'缺少页面标题')};
 };
 if(input.currentUrl)return [{url:input.currentUrl,detail:parse((globalThis as any).document,input.currentUrl)}];
 const results:any[]=new Array(input.urls.length);let cursor=0;
 const pause=(ms:number)=>new Promise(r=>setTimeout(r,ms));
 await Promise.all(Array.from({length:2},async()=>{
  while(cursor<input.urls.length){const i=cursor++,url=input.urls[i];
   for(let attempt=0;attempt<2;attempt++){
    try{const r=await fetch(url,{credentials:'same-origin',signal:AbortSignal.timeout(6000)});if((r.status===429||r.status>=500)&&attempt===0){await r.body?.cancel();await pause(1500);continue}if(!r.ok){await r.body?.cancel();throw Error('HTTP '+r.status)}const doc=new (globalThis as any).DOMParser().parseFromString(await r.text(),'text/html');results[i]={url,detail:parse(doc,url)};break}catch(e){results[i]={url,error:String(e)};break}
   }
   await pause(200);
  }
 }));return results;
}
