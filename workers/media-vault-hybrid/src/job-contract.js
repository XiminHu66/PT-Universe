const kinds=new Set(['novel','manga','torrent','video']);
export function validUrl(raw,kind){
  if(typeof raw!=='string'||raw.length>2048)return false;
  if(kind==='torrent'&&/^magnet:\?xt=urn:btih:[a-f0-9]{40}(?:&[^#\r\n]*)?$/i.test(raw))return true;
  try {
    const u=new URL(raw);
    if(u.username||u.password||u.port||u.protocol!=='https:'||!u.hostname.includes('.'))return false;
    if(/^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2[0-9]|3[01])\.)/i.test(u.hostname))return false;
    if(kind==='novel'&&!['www.wenku8.net','wenku8.net','www.bilinovel.com','www.bilinovel.net','www.linovelib.com','w.linovelib.com'].includes(u.hostname))return false;
    return true;
  }catch{return false}
}
export function permittedJob(o){
  if(!kinds.has(o.kind))return false;
  if(o.kind==='manga')return typeof o.title==='string'&&o.title.length<200&&Array.isArray(o.files)&&o.files.length>0&&o.files.length<=20&&o.files.every(x=>typeof x==='string'&&/^File:[^<>#\r\n]{2,190}\.(png|jpe?g|gif|webp)$/i.test(x));
  if(!validUrl(o.url,o.kind))return false;
  if(o.kind==='novel'&&!(Array.isArray(o.indices)&&o.indices.length>0&&o.indices.length<=100&&o.indices.every(i=>Number.isSafeInteger(i)&&i>=0&&i<=100000)))return false;
  return true;
}
export function rowFormat(row){return {id:row.id,kind:row.kind,url:JSON.parse(row.request_json).url||'',title:row.detail||row.kind,status:row.status,completed:row.completed_bytes,total:row.total_bytes,speed:0,error:row.error||'',created:row.created_at}}
