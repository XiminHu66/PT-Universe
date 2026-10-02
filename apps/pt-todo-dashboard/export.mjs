import {children,trail,today} from './model.mjs';
export const safeName=value=>{let x=String(value||'未命名').normalize('NFC').replace(/[<>:"/\\|?*\x00-\x1f\x7f]/g,'_').replace(/[. ]+$/g,'').slice(0,65).replace(/[. ]+$/g,'');if(!x||/^\.+$/.test(x))x='未命名';if(/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(x))x='_'+x;return x};
const yaml=x=>JSON.stringify(x),name=n=>n.name||'未命名项目';
const fm=obj=>'---\n'+Object.entries(obj).map(([k,v])=>`${k}: ${yaml(v)}`).join('\n')+'\n---\n\n';
const day=x=>{if(!x)return '';const d=new Date(x);return Number.isNaN(d.getTime())?String(x).slice(0,10):`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
export function exportFiles(s){
 const folder=safeName(s.settings.folderName||'Work Log'),prefix=String(s.settings.tagPrefix||'worklog').replace(/[^\p{L}\p{N}_/-]/gu,'')||'worklog';
 const files=[],paths=new Map(),noteNames=new Map(),used=new Set(['Work Log']);
 const owns=n=>!!(children(s,n.id).length||n.notes.trim()||s.tasks.some(t=>t.nodeId===n.id));
 for(const n of s.nodes){if(!owns(n))continue;let title=safeName(name(n));if(used.has(title.toLocaleLowerCase())||title==='Work Log'){title=safeName(title+' ('+(trail(s,n.id).at(-2)?.name||'Root')+')');let i=2,base=title;while(used.has(title.toLocaleLowerCase()))title=base+' '+i++}used.add(title.toLocaleLowerCase());noteNames.set(n.id,title)}
 function walk(p,base){const names=new Set();for(const n of children(s,p)){const candidate=safeName(name(n))+'-'+n.id.replace(/[^\w-]/g,'').slice(-8);let unique=candidate,i=2;while(names.has(unique.toLocaleLowerCase()))unique=candidate+'-'+i++;names.add(unique.toLocaleLowerCase());const path=base+'/'+unique;if(owns(n))paths.set(n.id,path+'/'+noteNames.get(n.id)+'.md');walk(n.id,path)}}walk('','Projects');
 const link=n=>paths.has(n.id)?`[[${paths.get(n.id).slice(0,-3)}|${name(n).replace(/[\[\]|\n]/g,' ')}]]`:name(n);
 const taskLine=t=>`- [${t.done?'x':' '}] ${t.title.replace(/\n/g,' ')} · added [[Daily/${t.date||day(t.createdAt)}]]${t.done?' · closed [[Daily/'+(t.completedDate||day(t.completedAt))+']]':''}${t.tags.length?' '+t.tags.map(x=>'#'+x).join(' '):''}${t.notes?'\n'+t.notes.split('\n').map(x=>'  '+x).join('\n'):''}`;
 const outline=(p,depth=0)=>children(s,p).flatMap(n=>['  '.repeat(depth)+'- '+link(n),...outline(n.id,depth+1)]);
 const dates=[...new Set(s.tasks.flatMap(t=>[t.date||day(t.createdAt),t.done?(t.completedDate||day(t.completedAt)):'']).filter(Boolean))].sort();
 for(const n of s.nodes.filter(owns)){
  const ts=s.tasks.filter(t=>t.nodeId===n.id).sort((a,b)=>a.order-b.order),inside=children(s,n.id),ancestors=trail(s,n.id);
  const fields={type:'item',level:ancestors.length,status:n.status,parent:ancestors.at(-2)?.name||'',path:ancestors.map(name).join(' / '),items_inside:inside.length,has_record:!!n.notes,open_todos:ts.filter(t=>!t.done).length,done_todos:ts.filter(t=>t.done).length,created:n.createdAt,tags:[`${prefix}/item`,`${prefix}/level-${ancestors.length}`]};
  files.push({path:folder+'/'+paths.get(n.id),content:fm(fields)+'# '+name(n)+'\n\n'+(n.notes?'## Record\n\n'+n.notes+'\n\n':'')+(inside.length?'## Inside\n\n'+inside.map(x=>'- '+link(x)).join('\n')+'\n\n':'')+'## To-dos\n\n'+(ts.filter(t=>!t.done).map(taskLine).join('\n')||'_No open to-dos._')+'\n\n## Archive\n\n'+ts.filter(t=>t.done).map(taskLine).join('\n')+'\n'});
 }
 for(const date of dates){const opened=s.tasks.filter(t=>(t.date||day(t.createdAt))===date),closed=s.tasks.filter(t=>t.done&&(t.completedDate||day(t.completedAt))===date),line=t=>taskLine(t)+'\n  Project: '+link(s.nodes.find(n=>n.id===t.nodeId));files.push({path:folder+'/Daily/'+date+'.md',content:fm({type:'daily',date,weekday:new Date(date+'T12:00:00').toLocaleDateString('en',{weekday:'long'}),todos_opened:opened.length,todos_closed:closed.length,tags:[prefix+'/daily']})+'# '+date+'\n\n## Opened\n\n'+opened.map(line).join('\n')+'\n\n## Closed\n\n'+closed.map(line).join('\n')+'\n'})}
 files.unshift({path:folder+'/Work Log.md',content:fm({type:'index',exported:new Date().toISOString(),items:s.nodes.length,todos:s.tasks.length,records:s.nodes.filter(n=>n.notes).length,tags:[prefix+'/index']})+'# Work Log\n\n## Projects\n\n'+outline('').join('\n')+'\n\n## Daily\n\n'+dates.map(d=>'- [[Daily/'+d+']]').join('\n')+'\n\n## Still open\n\n'+s.tasks.filter(t=>!t.done).map(t=>taskLine(t)+'\n  Project: '+link(s.nodes.find(n=>n.id===t.nodeId))).join('\n')+'\n'});
 return files;
}
export const bundle=s=>exportFiles(s).map(f=>'<!-- '+f.path+' -->\n\n'+f.content).join('\n\n---\n\n');
// A standards-compliant uncompressed ZIP, with UTF-8 paths, no external runtime.
const encoder=new TextEncoder();
function crc32(bytes){let c=0xffffffff;for(const b of bytes){c^=b;for(let j=0;j<8;j++)c=(c>>>1)^((c&1)?0xedb88320:0)}return (c^0xffffffff)>>>0}
export function zip(files){let offset=0;const local=[],central=[];for(const f of files){const path=encoder.encode(f.path),data=encoder.encode(f.content),crc=crc32(data),l=new Uint8Array(30+path.length),v=new DataView(l.buffer);v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint16(12,0x21,true);v.setUint32(14,crc,true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,path.length,true);l.set(path,30);local.push(l,data);const c=new Uint8Array(46+path.length),w=new DataView(c.buffer);w.setUint32(0,0x02014b50,true);w.setUint16(4,20,true);w.setUint16(6,20,true);w.setUint16(8,0x800,true);w.setUint16(14,0x21,true);w.setUint32(16,crc,true);w.setUint32(20,data.length,true);w.setUint32(24,data.length,true);w.setUint16(28,path.length,true);w.setUint32(42,offset,true);c.set(path,46);central.push(c);offset+=l.length+data.length}const end=new Uint8Array(22),v=new DataView(end.buffer);v.setUint32(0,0x06054b50,true);v.setUint16(8,files.length,true);v.setUint16(10,files.length,true);v.setUint32(12,central.reduce((x,c)=>x+c.length,0),true);v.setUint32(16,offset,true);return new Blob([...local,...central,end],{type:'application/zip'})}
export function download(name,content,type='text/plain;charset=utf-8'){const blob=content instanceof Blob?content:new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000)}
export async function writeDirectory(root,files,prune=false){
 const folder=files[0]?.path.split('/')[0];if(!folder)throw Error('没有可导出的文件');
 const dir=await root.getDirectoryHandle(folder,{create:true});let old=[];
 try{const m=JSON.parse(await (await (await dir.getFileHandle('.pt-todo-manifest.json')).getFile()).text());if(m.app==='pt-todo-dashboard'&&Array.isArray(m.paths))old=m.paths}catch{}
 const paths=files.map(f=>f.path.slice(folder.length+1));
 // Verify all destinations before writing; never replace an unmanaged note.
 for(const path of paths.filter(p=>!old.includes(p))){const parts=path.split('/');let d=dir;try{for(const p of parts.slice(0,-1))d=await d.getDirectoryHandle(p);await d.getFileHandle(parts.at(-1));throw Error('已有非本工具管理的文件：'+path+'。请换一个导出文件夹')}catch(e){if(e.name!=='NotFoundError')throw e}}
 for(const f of files){const parts=f.path.split('/').slice(1),file=parts.pop();let d=dir;for(const p of parts)d=await d.getDirectoryHandle(p,{create:true});const h=await d.getFileHandle(file,{create:true}),w=await h.createWritable();await w.write(f.content);await w.close()}
 let removed=0;if(prune)for(const path of old.filter(p=>typeof p==='string'&&p.endsWith('.md')&&!paths.includes(p))){const parts=path.split('/');if(parts.some(p=>!p||p==='.'||p==='..')||/\\/.test(path))continue;let d=dir;try{for(const p of parts.slice(0,-1))d=await d.getDirectoryHandle(p);await d.removeEntry(parts.at(-1));removed++}catch(e){if(e.name!=='NotFoundError')throw e}}
 const h=await dir.getFileHandle('.pt-todo-manifest.json',{create:true}),w=await h.createWritable();await w.write(JSON.stringify({app:'pt-todo-dashboard',paths:prune?paths:[...new Set([...old,...paths])]},null,2));await w.close();return {written:files.length,removed};
}
