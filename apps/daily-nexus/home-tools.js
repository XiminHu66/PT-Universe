/* Home helpers share the main page's existing local data and focus task list. */
function nexusSafeIcon(value){return typeof value==='string'&&value.length<400000&&/^data:image\/(?:png|jpeg|webp|gif);base64,[a-zA-Z0-9+/=]+$/.test(value)?value:''}
function nexusIconFields(row){
  const iconImage=nexusSafeIcon(row?.iconImage),crop=row?.iconCrop;
  if(!iconImage)return {};
  const fields={iconImage};
  if(nexusSafeIcon(crop?.source))fields.iconCrop={source:crop.source,zoom:Math.min(4,Math.max(1,Number(crop.zoom)||1)),x:Math.min(100,Math.max(-100,Number(crop.x)||0)),y:Math.min(100,Math.max(-100,Number(crop.y)||0))};
  return fields;
}
function nexusIconMarkup(row){const image=nexusSafeIcon(row?.iconImage);return image?`<img src="${image}" alt="" draggable="false">`:escapeHtml(row?.emoji||'🔗')}
let nexusIconTarget=null,nexusIconImage=null,nexusIconSource='',nexusIconLoad=0,nexusNewLinkIcon={},nexusIconDrag=null;
const nexusIconElement=id=>document.getElementById(id);
function nexusDrawIcon(canvas){
  const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);if(!nexusIconImage)return;
  const zoom=+nexusIconElement('linkIconZoom').value,x=+nexusIconElement('linkIconX').value,y=+nexusIconElement('linkIconY').value;
  const scale=Math.max(canvas.width/nexusIconImage.width,canvas.height/nexusIconImage.height)*zoom,w=nexusIconImage.width*scale,h=nexusIconImage.height*scale;
  ctx.drawImage(nexusIconImage,(canvas.width-w)/2+x/100*(w-canvas.width)/2,(canvas.height-h)/2+y/100*(h-canvas.height)/2,w,h);
}
function nexusRefreshIcon(){
  for(const [id,suffix] of [['Zoom','×'],['X',''],['Y','']])nexusIconElement('linkIcon'+id+'Value').textContent=(id==='Zoom'?(+nexusIconElement('linkIcon'+id).value).toFixed(1):nexusIconElement('linkIcon'+id).value)+suffix;
  nexusDrawIcon(nexusIconElement('linkIconCanvas'));nexusIconElement('saveLinkIcon').disabled=!nexusIconImage;
}
function nexusReadImage(source){return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('图片无法读取，请尝试 PNG、JPG 或 WebP。'));img.src=source})}
async function nexusOpenIcon(index){
  syncDeskLinkDraftFromEditor();nexusIconTarget=index;const row=index==='new'?nexusNewLinkIcon:deskLinkDraft[index];
  nexusIconImage=null;nexusIconSource='';nexusIconElement('linkIconFile').value='';nexusIconElement('linkIconError').textContent='';
  const crop=nexusIconFields(row).iconCrop;nexusIconElement('linkIconZoom').value=crop?.zoom||1;nexusIconElement('linkIconX').value=crop?.x||0;nexusIconElement('linkIconY').value=crop?.y||0;
  nexusRefreshIcon();nexusIconElement('linkIconDialog').showModal();const ticket=++nexusIconLoad;
  try{const source=crop?.source||nexusSafeIcon(row?.iconImage);if(source){const img=await nexusReadImage(source);if(ticket!==nexusIconLoad)return;nexusIconImage=img;nexusIconSource=source;nexusRefreshIcon()}}catch(e){nexusIconElement('linkIconError').textContent=e.message}
}
function nexusSetDraftIcon(fields){
  if(nexusIconTarget==='new'){nexusNewLinkIcon=fields;nexusRefreshNewIcon()}
  else if(deskLinkDraft[nexusIconTarget]){delete deskLinkDraft[nexusIconTarget].iconImage;delete deskLinkDraft[nexusIconTarget].iconCrop;Object.assign(deskLinkDraft[nexusIconTarget],fields);renderDeskLinkEditor()}
  nexusIconElement('linkIconDialog').close();
}
function nexusRefreshNewIcon(){const row={...nexusNewLinkIcon,emoji:nexusIconElement('newDeskLinkEmoji').value};nexusIconElement('newDeskLinkIcon').innerHTML=nexusIconMarkup(row)}
nexusIconElement('linkIconFile').addEventListener('change',async event=>{
  const file=event.target.files?.[0];if(!file)return;const ticket=++nexusIconLoad;nexusIconElement('linkIconError').textContent='';nexusIconElement('saveLinkIcon').disabled=true;
  let objectUrl;
  try{
    if(!['image/png','image/jpeg','image/webp','image/gif'].includes(file.type))throw Error('请选择 PNG、JPG、WebP 或 GIF 图片。');
    if(file.size>12*1024*1024)throw Error('图片超过 12 MB，请先缩小图片。');
    objectUrl=URL.createObjectURL(file);const img=await nexusReadImage(objectUrl);if(img.width*img.height>40000000)throw Error('图片尺寸过大，请先缩小图片。');
    const c=document.createElement('canvas'),scale=Math.min(1,384/Math.max(img.width,img.height));c.width=Math.max(1,Math.round(img.width*scale));c.height=Math.max(1,Math.round(img.height*scale));c.getContext('2d').drawImage(img,0,0,c.width,c.height);
    const source=c.toDataURL('image/webp',.88);if(!nexusSafeIcon(source))throw Error('图片仍然过大，请尝试较小的图片。');const decoded=await nexusReadImage(source);if(ticket!==nexusIconLoad)return;
    nexusIconImage=decoded;nexusIconSource=source;nexusIconElement('linkIconZoom').value=1;nexusIconElement('linkIconX').value=0;nexusIconElement('linkIconY').value=0;nexusRefreshIcon();
  }catch(e){if(ticket===nexusIconLoad){nexusIconElement('linkIconError').textContent=e.message;nexusRefreshIcon()}}
  finally{if(objectUrl)URL.revokeObjectURL(objectUrl)}
});
for(const id of ['Zoom','X','Y'])nexusIconElement('linkIcon'+id).addEventListener('input',nexusRefreshIcon);
nexusIconElement('linkIconReset').onclick=()=>{nexusIconElement('linkIconZoom').value=1;nexusIconElement('linkIconX').value=0;nexusIconElement('linkIconY').value=0;nexusRefreshIcon()};
nexusIconElement('saveLinkIcon').onclick=()=>{
  if(!nexusIconImage)return;const c=document.createElement('canvas');c.width=c.height=128;nexusDrawIcon(c);
  nexusSetDraftIcon({iconImage:c.toDataURL('image/webp',.9),iconCrop:{source:nexusIconSource,zoom:+nexusIconElement('linkIconZoom').value,x:+nexusIconElement('linkIconX').value,y:+nexusIconElement('linkIconY').value}});
};
nexusIconElement('clearLinkIcon').onclick=()=>nexusSetDraftIcon({});
nexusIconElement('cancelLinkIcon').onclick=()=>nexusIconElement('linkIconDialog').close();
nexusIconElement('linkIconDialog').addEventListener('close',()=>{++nexusIconLoad;nexusIconImage=null;nexusIconDrag=null});
nexusIconElement('linkIconDialog').addEventListener('cancel',event=>event.stopPropagation());
nexusIconElement('linkIconCanvas').addEventListener('pointerdown',event=>{
  if(!nexusIconImage)return;event.preventDefault();const canvas=event.currentTarget;canvas.setPointerCapture(event.pointerId);nexusIconDrag={px:event.clientX,py:event.clientY,x:+nexusIconElement('linkIconX').value,y:+nexusIconElement('linkIconY').value};
});
nexusIconElement('linkIconCanvas').addEventListener('pointermove',event=>{
  if(!nexusIconDrag||!nexusIconImage)return;const canvas=event.currentTarget,zoom=+nexusIconElement('linkIconZoom').value,scale=Math.max(canvas.width/nexusIconImage.width,canvas.height/nexusIconImage.height)*zoom,rect=canvas.getBoundingClientRect();
  for(const [id,delta,extra,start] of [['X',(event.clientX-nexusIconDrag.px)*canvas.width/rect.width,nexusIconImage.width*scale-canvas.width,nexusIconDrag.x],['Y',(event.clientY-nexusIconDrag.py)*canvas.height/rect.height,nexusIconImage.height*scale-canvas.height,nexusIconDrag.y]])nexusIconElement('linkIcon'+id).value=extra>0?Math.max(-100,Math.min(100,start+delta/extra*200)):0;
  nexusRefreshIcon();
});
for(const type of ['pointerup','pointercancel','lostpointercapture'])nexusIconElement('linkIconCanvas').addEventListener(type,()=>{nexusIconDrag=null});

let nexusTaskEditing=null;
function nexusPersistTasks(next){if(!store.set('tasks',next)){nexusNotify('任务未保存：本机存储空间不足。');return false}state.tasks=next;return true}
function nexusRenderTasks(){
  const host=document.getElementById('tasks');
  host.innerHTML=state.tasks.map((t,i)=>nexusTaskEditing===i?`<div class="task-row task-edit-row" data-task-index="${i}"><input class="task-edit-input" aria-label="修改任务内容" value="${escapeAttr(t.text)}"><button class="task-action" data-task-action="save">保存</button><button class="task-action" data-task-action="cancel">取消</button></div>`:`<div class="task-row ${t.done?'done':''}" data-task-index="${i}"><input type="checkbox" ${t.done?'checked':''} aria-label="完成 ${escapeAttr(t.text)}"><button class="task-text" data-task-action="edit" title="编辑任务">${escapeHtml(t.text)}</button><button class="task-action" data-task-action="edit">编辑</button><button class="task-action danger" data-task-action="delete" aria-label="删除 ${escapeAttr(t.text)}">删除</button></div>`).join('');
  const remaining=state.tasks.filter(t=>!t.done).length;document.getElementById('taskSummary').textContent=state.tasks.length?`${remaining} 项待办 · ${state.tasks.length-remaining} 项完成`:'暂无任务';
  document.getElementById('memoEmpty').classList.toggle('show',state.tasks.length===0);
  host.querySelectorAll('[data-task-index]').forEach(row=>{
    const index=+row.dataset.taskIndex;
    row.querySelector('input[type=checkbox]')?.addEventListener('change',event=>{if(!nexusPersistTasks(state.tasks.map((t,i)=>i===index?{...t,done:event.target.checked}:t)))event.target.checked=!!state.tasks[index].done;nexusRenderTasks()});
    row.querySelectorAll('[data-task-action]').forEach(button=>button.onclick=()=>{
      const action=button.dataset.taskAction;
      if(action==='edit'){nexusTaskEditing=index;nexusRenderTasks();const input=host.querySelector('.task-edit-input');input.focus();input.select();return}
      if(action==='save'){const text=row.querySelector('.task-edit-input').value.trim();if(!text){nexusNotify('请输入任务内容，或使用删除按钮。');return}if(!nexusPersistTasks(state.tasks.map((t,i)=>i===index?{...t,text}:t)))return}
      if(action==='delete'&&!nexusPersistTasks(state.tasks.filter((_,i)=>i!==index)))return;
      nexusTaskEditing=null;nexusRenderTasks();
    });
    row.querySelector('.task-edit-input')?.addEventListener('keydown',event=>{if(event.isComposing)return;if(event.key==='Enter'){event.preventDefault();row.querySelector('[data-task-action=save]').click()}if(event.key==='Escape'){event.preventDefault();event.stopPropagation();row.querySelector('[data-task-action=cancel]').click()}});
  });
  renderFocusTasks();
}
