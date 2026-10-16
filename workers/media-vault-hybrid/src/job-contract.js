const kinds=new Set(['novel','manga','torrent','video']);
export function validUrl(raw,kind){
  if(typeof raw!=='string'||raw.length>2048)return false;
  if(kind==='torrent'&&/^magnet:\?xt=urn:btih:[a-f0-9]{40}(?:&[^#\r\n]*)?$/i.test(raw))return true;
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
  if(o.text_only!==undefined&&typeof o.text_only!=='boolean'||o.skip_images!==undefined&&typeof o.skip_images!=='boolean')return false;
  if(o.kind==='novel'&&o.text_only!==undefined&&o.skip_images!==undefined&&o.text_only!==o.skip_images)return false;
  if(o.layout!==undefined&&(!o.layout||typeof o.layout!=='object'||Array.isArray(o.layout)||Object.entries(o.layout).some(([k,v])=>!Object.hasOwn(layoutBounds,k)||typeof v!=='number'||!Number.isFinite(v)||v<layoutBounds[k][0]||v>layoutBounds[k][1])))return false;
  if(o.kind==='manga'){
   if(typeof o.title!=='string'||!o.title.trim()||o.title.length>=200)return false;
   if(o.provider==='mangadex')return mangaDexUrl(o.url)&&o.files===undefined&&[['max_bytes',100*1024**2],['max_pages',80]].every(([key,cap])=>o[key]===undefined||Number.isSafeInteger(o[key])&&o[key]>0&&o[key]<=cap);
   if(o.provider!==undefined&&o.provider!=='commons')return false;
   return Array.isArray(o.files)&&o.files.length>0&&o.files.length<=20&&new Set(o.files).size===o.files.length&&o.files.every(x=>typeof x==='string'&&/^File:[^<>#\r\n]{2,190}\.(png|jpe?g|gif|webp)$/i.test(x));
  }
  if(!validUrl(o.url,o.kind))return false;
  if(o.kind==='novel'&&!(Array.isArray(o.indices)&&o.indices.length>0&&o.indices.length<=100&&new Set(o.indices).size===o.indices.length&&o.indices.every(i=>Number.isSafeInteger(i)&&i>=0&&i<=100000)))return false;
  return true;
}
export const layoutBounds={fontScale:[70,180],lineHeight:[1.1,2.5],paragraphGap:[0,3],indent:[0,4],pageMargin:[0,3]};
export function canonicalJob(raw){
 if(!permittedJob(raw)||raw.format!==undefined&&(typeof raw.format!=='string'||raw.format.length>120))return null;
 const spec={kind:raw.kind};
 const keys=raw.kind==='manga'?(raw.provider==='mangadex'?['provider','url','title','max_bytes','max_pages']:['title','files']):raw.kind==='novel'?['url','text_only','skip_images']:['url','format'];
 for(const key of keys)if(raw[key]!==undefined)spec[key]=raw[key];
 if(raw.kind==='novel'){
  spec.indices=[...raw.indices].sort((a,b)=>a-b);
  if(raw.layout!==undefined)spec.layout=Object.fromEntries(Object.keys(layoutBounds).filter(k=>raw.layout[k]!==undefined).map(k=>[k,raw.layout[k]]));
 }
 return spec;
}
export function rowFormat(row){
 const spec=JSON.parse(row.request_json),content=['novel','manga'].includes(row.kind),status=row.status;
 return {id:row.id,kind:row.kind,url:spec.url||'',title:row.detail||spec.title||({novel:'小说 EPUB',manga:spec.provider==='mangadex'?'MangaDex 中文章节 CBZ':'Commons 图片 CBZ',video:'视频',torrent:'BT / HTTPS 文件'})[row.kind]||row.kind,status,completed:row.completed_bytes,total:row.total_bytes,progress_unit:content&&status!=='complete'?'items':'bytes',speed:0,error:row.error||'',created:row.created_at,updated:row.updated_at,source_expires_at:status==='complete'?row.updated_at+24*3600000:null};
}
