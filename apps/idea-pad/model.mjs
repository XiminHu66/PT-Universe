export const stamp=()=>new Date().toISOString(),today=()=>new Date().toLocaleDateString('en-CA');
export const uid=()=>crypto.randomUUID();
export const blank=()=>({type:'doc',content:[{type:'paragraph'}]});
export const empty=()=>({version:1,pages:[]});
export const children=(s,parentId='')=>s.pages.filter(p=>p.parentId===parentId&&!p.trashedAt).sort((a,b)=>a.order-b.order);
export function trail(s,id){const result=[],seen=new Set();let p=s.pages.find(p=>p.id===id);while(p){if(seen.has(p.id))throw Error('页面层级存在循环');seen.add(p.id);result.unshift(p);p=s.pages.find(x=>x.id===p.parentId)}return result}
export const trashed=(s,p)=>trail(s,p.id).some(x=>x.trashedAt);
export const descendants=(s,id)=>s.pages.filter(p=>p.id!==id&&trail(s,p.id).some(x=>x.id===id)).map(p=>p.id);
export function createPage(s,parentId=''){if(parentId&&!s.pages.some(p=>p.id===parentId&&!trashed(s,p)))throw Error('父页面不存在');const at=stamp(),p={id:uid(),parentId,title:'',icon:'',content:blank(),order:children(s,parentId).length,createdAt:at,updatedAt:at,trashedAt:null};s.pages.push(p);return p}
export function movePage(s,id,parentId='',before=''){const p=s.pages.find(p=>p.id===id);if(!p||trashed(s,p))throw Error('页面不存在');if(parentId===id||descendants(s,id).includes(parentId))throw Error('不能移动到自身或其子页面');if(parentId&&!s.pages.some(x=>x.id===parentId&&!trashed(s,x)))throw Error('目标页面不存在');p.parentId=parentId;p.updatedAt=stamp();const peers=children(s,parentId).filter(x=>x.id!==id);const at=peers.findIndex(x=>x.id===before);peers.splice(at<0?peers.length:at,0,p);peers.forEach((x,i)=>x.order=i)}
export function textOf(node){return node?.type==='text'?node.text||'':(node?.content||[]).map(textOf).join(node?.type==='doc'?'\n':' ')}
export function safeURL(value,image=false){if(typeof value!=='string')return '';const v=value.trim();if(image&&/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(v))return v;try{const u=new URL(v);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?u.href:''}catch{return ''}}
const nodes=new Set(['doc','paragraph','heading','text','hardBreak','bulletList','orderedList','listItem','blockquote','codeBlock','horizontalRule','image']);
const marks=new Set(['bold','italic','strike','underline','code','link']);
export function cleanContent(raw){let count=0;function walk(n,depth=0){if(!n||!nodes.has(n.type)||depth>100||++count>100000)throw Error('正文结构无效或过大');const result={type:n.type};if(n.type==='text'){if(typeof n.text!=='string')throw Error('正文文字无效');result.text=n.text}
 if(n.type==='image'){const src=safeURL(n.attrs?.src,true);if(!src)throw Error('图片地址无效');result.attrs={src,alt:String(n.attrs?.alt||''),title:String(n.attrs?.title||'')}}
 if(n.type==='heading')result.attrs={level:[1,2,3].includes(n.attrs?.level)?n.attrs.level:2};
 if(n.type==='orderedList')result.attrs={start:Number.isSafeInteger(n.attrs?.start)&&n.attrs.start>0?n.attrs.start:1};
 if(n.type==='codeBlock')result.attrs={language:null};
 if(n.content!==undefined){if(!Array.isArray(n.content))throw Error('正文结构无效');result.content=n.content.map(x=>walk(x,depth+1))}
 if(n.marks){if(!Array.isArray(n.marks))throw Error('正文格式无效');result.marks=n.marks.map(m=>{if(!marks.has(m.type))throw Error('不支持的正文格式');if(m.type!=='link')return {type:m.type};const href=safeURL(m.attrs?.href);if(!href)throw Error('链接地址无效');return {type:'link',attrs:{href,target:'_blank',rel:'noopener noreferrer nofollow'}}})}return result}
 if(raw?.type!=='doc')throw Error('正文必须是文档');return walk(raw)}
export function normalize(raw){if(raw?.version!==1||!Array.isArray(raw.pages)||raw.pages.length>2000)throw Error('随手记备份格式无效');const seen=new Set(),s={version:1,pages:raw.pages.map((p,i)=>{if(typeof p.id!=='string'||!p.id||seen.has(p.id))throw Error('页面 ID 缺失或重复');seen.add(p.id);return {id:p.id,parentId:typeof p.parentId==='string'?p.parentId:'',title:String(p.title||''),icon:String(p.icon||'').slice(0,8),content:cleanContent(p.content||blank()),order:Number.isFinite(p.order)?p.order:i,createdAt:p.createdAt||stamp(),updatedAt:p.updatedAt||stamp(),trashedAt:p.trashedAt||null}})};for(const p of s.pages){if(p.parentId&&!seen.has(p.parentId))throw Error('父页面不存在');if(trail(s,p.id).length>100)throw Error('页面层级过深')}return s}
