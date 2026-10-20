export const MAX_NOVEL_CHAPTERS=10000;
export const MAX_JOB_BODY=131072;
const kinds=new Set(['novel','manga','torrent','video','pikpak-account','pikpak','pikpak-cleanup']);
export function validUrl(raw,kind){
  if(typeof raw!=='string'||raw.length>2048)return false;
  if(['torrent','pikpak'].includes(kind)&&/^magnet:\?xt=urn:btih:(?:[a-f0-9]{40}|[a-z2-7]{32})(?:&[^#\r\n]*)?$/i.test(raw))return true;
  try {
    const u=new URL(raw);
    if(u.username||u.password||u.port||u.hash||u.protocol!=='https:'||!u.hostname.includes('.'))return false;
    if(/^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2[0-9]|3[01])\.)/i.test(u.hostname))return false;
    if(kind==='novel'&&!['www.wenku8.net','wenku8.net','www.bilinovel.com','www.bilinovel.net','www.linovelib.com','w.linovelib.com'].includes(u.hostname))return false;
    return true;
  }catch{return false}
}
export const mangaDexUrl=raw=>typeof raw==='string'&&/^https:\/\/mangadex\.org\/chapter\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(raw);
export function permittedJob(o){
  if(!o||typeof o!=='object'||Array.isArray(o)||!kinds.has(o.kind))return false;
  if(o.kind==='pikpak-cleanup')return /^[a-f0-9]{24}$/.test(o.source_job||'')&&/^[a-f0-9]{24}$/.test(o.profile_id||'')&&/^[A-Za-z0-9_-]{1,128}$/.test(o.file_id||'')&&o.confirm_permanent===true;
  if(o.kind==='pikpak-account'&&o.auth_type==='rclone')return typeof o.label==='string'&&!!o.label.trim()&&o.label.length<=24&&o.store_credentials===true&&typeof o.username==='string'&&o.username.length>0&&o.username.length<=254&&!/\s/.test(o.username)&&typeof o.password==='string'&&o.password.length>0&&o.password.length<=256&&!/[\r\n\x00]/.test(o.password);
  if(o.kind==='pikpak-account')return (o.auth_type===undefined||o.auth_type==='pat')&&typeof o.label==='string'&&o.label.trim().length>0&&o.label.length<=24&&typeof o.token==='string'&&o.token.length>=20&&o.token.length<=4096&&!/\s/.test(o.token);
  if(o.kind==='pikpak'&&(!/^[a-f0-9]{24}$/.test(o.profile_id||'')||o.cleanup_after_download!==true))return false;
  if(o.text_only!==undefined&&typeof o.text_only!=='boolean'||o.skip_images!==undefined&&typeof o.skip_images!=='boolean')return false;
  if(o.kind==='novel'&&o.text_only!==undefined&&o.skip_images!==undefined&&o.text_only!==o.skip_images)return false;
  if(o.layout!==undefined&&(!o.layout||typeof o.layout!=='object'||Array.isArray(o.layout)||Object.entries(o.layout).some(([k,v])=>Object.hasOwn(layoutChoices,k)?!layoutChoices[k].includes(v):!Object.hasOwn(layoutBounds,k)||typeof v!=='number'||!Number.isFinite(v)||v<layoutBounds[k][0]||v>layoutBounds[k][1])))return false;
  if(o.kind==='manga'){
   if(typeof o.title!=='string'||!o.title.trim()||o.title.length>=200)return false;
   if(o.provider==='mangadex')return mangaDexUrl(o.url)&&o.files===undefined&&[['max_bytes',100*1024**2],['max_pages',80]].every(([key,cap])=>o[key]===undefined||Number.isSafeInteger(o[key])&&o[key]>0&&o[key]<=cap);
   if(o.provider!==undefined&&o.provider!=='commons')return false;
   return Array.isArray(o.files)&&o.files.length>0&&o.files.length<=20&&new Set(o.files).size===o.files.length&&o.files.every(x=>typeof x==='string'&&/^File:[^<>#\r\n]{2,190}\.(png|jpe?g|gif|webp)$/i.test(x));
  }
  if(!validUrl(o.url,o.kind))return false;
  if(o.kind==='novel'&&!(Array.isArray(o.indices)&&o.indices.length>0&&o.indices.length<=MAX_NOVEL_CHAPTERS&&new Set(o.indices).size===o.indices.length&&o.indices.every(i=>Number.isSafeInteger(i)&&i>=0&&i<=100000)))return false;
  return true;
}
export const layoutChoices={titleAlign:['left','center'],textAlign:['left','justify']};
export const layoutBounds={fontScale:[70,180],lineHeight:[1.1,2.5],paragraphGap:[0,3],indent:[0,4],pageMargin:[0,3]};
export function canonicalJob(raw){
 if(!permittedJob(raw)||raw.format!==undefined&&(typeof raw.format!=='string'||raw.format.length>120))return null;
 if(raw.kind==='pikpak-cleanup')return {kind:raw.kind,source_job:raw.source_job,profile_id:raw.profile_id,file_id:raw.file_id,confirm_permanent:true};
 if(raw.kind==='pikpak-account'&&raw.auth_type==='rclone')return {kind:raw.kind,label:raw.label.trim(),auth_type:'rclone',username:raw.username,password:raw.password,store_credentials:true};
 if(raw.kind==='pikpak-account')return {kind:raw.kind,label:raw.label.trim(),token:raw.token};
 if(raw.kind==='pikpak')return {kind:raw.kind,url:raw.url,profile_id:raw.profile_id,cleanup_after_download:true};
 const spec={kind:raw.kind};
 const keys=raw.kind==='manga'?(raw.provider==='mangadex'?['provider','url','title','max_bytes','max_pages']:['title','files']):raw.kind==='novel'?['url','text_only','skip_images']:['url','format'];
 for(const key of keys)if(raw[key]!==undefined)spec[key]=raw[key];
 if(raw.kind==='novel'){
  spec.indices=[...raw.indices].sort((a,b)=>a-b);
  if(raw.layout!==undefined)spec.layout=Object.fromEntries([...Object.keys(layoutBounds),...Object.keys(layoutChoices)].filter(k=>raw.layout[k]!==undefined).map(k=>[k,raw.layout[k]]));
 }
 return spec;
}
export function rowFormat(row){
 const spec=JSON.parse(row.request_json),content=['novel','manga'].includes(row.kind),status=row.status;
 if(row.kind==='pikpak-account'){
  let result=null;try{const d=JSON.parse(row.detail||'{}');if(d.id===row.id&&d.ready===true)result={id:d.id,label:String(d.label||spec.label||'PikPak').slice(0,24),ready:true,...(d.auth_type==='rclone'?{auth_type:'rclone'}:{})};}catch{}
  return {id:row.id,kind:row.kind,title:'PikPak 账号 · '+String(spec.label||'').slice(0,24),status,error:row.error||'',created:row.created_at,updated:row.updated_at,provider_result:result,completed:0,total:0};
 }
 if(row.kind==='pikpak'||row.kind==='pikpak-cleanup'){
  let data;try{data=JSON.parse(row.detail||'{}');}catch{}
  if(data&&cleanupLabels[data.cleanup]){const target=row.kind==='pikpak'&&data.cleanup==='awaiting-confirmation'&&/^[A-Za-z0-9_-]{1,128}$/.test(data.file_id||'')&&Number.isSafeInteger(data.bytes)?{source_job:row.id,profile_id:spec.profile_id,file_id:data.file_id,name:String(data.name||'').slice(0,220),bytes:data.bytes}:null;
   return {id:row.id,kind:row.kind,title:cleanupLabels[data.cleanup],status,completed:row.completed_bytes,total:row.total_bytes,error:row.error||'',created:row.created_at,updated:row.updated_at,cleanup_target:target,cleanup_status:data.cleanup,...(row.kind==='pikpak-cleanup'?{source_job:spec.source_job}:{source_expires_at:status==='complete'?row.updated_at+24*3600000:null})};
  }
 }
 let detail=null;try{const d=JSON.parse(row.detail);if(d&&typeof d==='object'&&typeof d.title==='string'&&['submitting','extracting','downloading','processing','metadata','peers','queued','checking'].includes(d.phase))detail=d;}catch{}
 return {id:row.id,kind:row.kind,url:spec.url||'',phase:detail?.phase||'',peers:row.kind==='torrent'?detail?.peers:undefined,title:detail?.title||(!detail&&row.detail)||spec.title||({novel:'小说 EPUB',manga:spec.provider==='mangadex'?'MangaDex 中文章节 CBZ':'Commons 图片 CBZ',video:'视频',torrent:'BT / HTTPS 文件'})[row.kind]||row.kind,status,completed:row.completed_bytes,total:row.total_bytes,progress_unit:content&&status!=='complete'?'items':'bytes',speed:detail?.speed||0,error:row.error||'',created:row.created_at,updated:row.updated_at,source_expires_at:status==='complete'?row.updated_at+24*3600000:null};
}

export const cleanupLabels={'awaiting-confirmation':'VPS 副本已校验；等待确认永久删除云端副本','purged-quota-released':'云端副本已永久删除；存储用量已下降','purged-quota-pending':'云端副本已永久删除；额度更新待确认'};
