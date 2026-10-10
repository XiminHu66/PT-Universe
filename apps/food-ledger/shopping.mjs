import {emptyShopping,normalizeShopping,mergeShopping,shoppingItems,buildShopping} from './shopping-model.mjs?v=20261010-2';
import {fetchDocument,putDocument} from './sync.mjs?v=20261010-2';
const KEY='food-shopping.v1',$=s=>document.querySelector(s),esc=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function initShopping({recipes,onChange,toast}){
 let state=emptyShopping(),blocked=false,choosing=true,chosen=new Set(),lastTap=null,undo=null,find='';
 try{const raw=localStorage.getItem(KEY);if(raw)state=normalizeShopping(JSON.parse(raw))}catch{blocked=true;$('#shopping-error').textContent='购物清单无法读取，已暂停修改，请先导出备份。'}
 const stamp=()=>Math.max(Date.now(),(state.list?.updatedAt||0)+1,...state.items.map(i=>i.updatedAt+1));
 function persist(next){if(blocked)throw Error('购物清单存储无法读取，已暂停保存');const normalized=normalizeShopping(next);try{localStorage.setItem(KEY,JSON.stringify(normalized))}catch{throw Error('购物清单保存失败，请检查浏览器存储或先导出备份')}state=normalized}
 function change(next){try{persist(next);$('#shopping-copy-fallback').hidden=true;render();onChange();return true}catch(e){toast(e.message);return false}}
 function render(){
  const items=shoppingItems(state),left=items.filter(i=>!i.bought).length;$('#shopping-open-count').textContent=state.list?' '+left:'';
  if(!$('#shopping-dialog').open)return;
  const all=recipes(),ids=new Set(all.map(r=>r.id));for(const id of chosen)if(!ids.has(id))chosen.delete(id);
  $('#shopping-chooser').hidden=!choosing;$('#shopping-choose').textContent=choosing?'查看清单':'重新选菜';$('#shopping-choose').disabled=choosing&&!state.list;
  $('#shopping-generated').hidden=choosing;$('#shopping-selected-count').textContent=chosen.size;$('#shopping-generate').disabled=chosen.size===0||blocked;
  const q=find.toLocaleLowerCase(),shown=all.filter(r=>!q||[r.name,...r.tags].join(' ').toLocaleLowerCase().includes(q));
  const focused=document.activeElement?.dataset.chooseRecipe;
  $('#shopping-recipe-options').innerHTML=shown.length?shown.map(r=>`<label class="shopping-recipe-option ${!r.ingredients.length?'unavailable':''}"><input type="checkbox" data-choose-recipe="${r.id}" ${chosen.has(r.id)?'checked':''} ${r.ingredients.length?'':'disabled'}><span><b>${esc(r.name)}</b><small>${r.ingredients.length?r.ingredients.length+' 项食材':'尚未填写食材'}</small></span></label>`).join(''):'<p class="list-empty">还没有可选菜谱，请先收藏并补充食材。</p>';
  if(focused)$('#shopping-recipe-options').querySelector(`[data-choose-recipe="${focused}"]`)?.focus({preventScroll:true});
  $('#shopping-sources').textContent=state.list?.recipeNames.join('、')||'还没有生成购物清单';
  $('#shopping-progress').textContent=items.length?`${left} 项待买 · ${items.length-left} 项已买`:'清单暂无材料';
  $('#shopping-items').innerHTML=items.length?items.map(i=>`<li class="shopping-item ${i.bought?'bought':''}" data-shopping-row="${i.id}"><button type="button" class="shopping-item-toggle" data-shopping-item="${i.id}" role="checkbox" aria-checked="${i.bought}" aria-label="${i.bought?'取消已买标记':'标记已买'}：${esc(i.name)}"><span class="shopping-check" aria-hidden="true">${i.bought?'✓':''}</span><span class="shopping-item-text"><b>${esc(i.name)}</b><span class="shopping-amount">${esc(i.amount)}</span><small>${esc([...new Set(i.sources.map(s=>s.recipeName))].join('、'))}</small></span></button><button type="button" class="shopping-remove" data-shopping-remove="${i.id}" aria-label="删除食材 ${esc(i.name)}" title="删除食材">×</button></li>`).join(''):'<li class="list-empty">没有待买材料了。可撤销刚才的删除，或重新选菜生成。</li>';
  $('#shopping-copy').disabled=!left;$('#shopping-undo').hidden=!undo||undo.listId!==state.list?.id;
 }
 function open(id=''){
  chosen=new Set((state.list?.recipeIds||[]).filter(id=>recipes().some(r=>r.id===id&&r.ingredients.length)));if(id)chosen.add(id);choosing=Boolean(id)||!state.list;lastTap=null;$('#shopping-copy-fallback').hidden=true;find='';$('#shopping-recipe-search').value='';$('#shopping-dialog').showModal();render();
 }
 function updateItem(id,operation,priorBought=null){const next=structuredClone(state),item=next.items.find(r=>r.id===id&&!r.deleted);if(!item)return;if(operation==='delete'){undo={...item,...(priorBought===null?{}:{bought:priorBought})};item.deleted=true}else item.bought=!item.bought;item.updatedAt=stamp();if(change(next)&&operation==='delete')toast('食材已从购物清单删除，可撤销')}
 $('#shopping-open').onclick=()=>open();$('#shopping-choose').onclick=()=>{choosing=!choosing;lastTap=null;render()};
 $('#shopping-recipe-search').oninput=e=>{find=e.target.value;render()};
 $('#shopping-generate').onclick=()=>{
  try{const selected=recipes().filter(r=>chosen.has(r.id));const generated=buildShopping(selected);if(shoppingItems(state).length&&!confirm('生成新的购物清单，将替换当前清单及已买标记？'))return;const time=stamp(),id=crypto.randomUUID(),next={version:1,list:{id,updatedAt:time,recipeIds:selected.map(r=>r.id),recipeNames:selected.map(r=>r.name)},items:generated.map(row=>({...row,id:crypto.randomUUID(),listId:id,updatedAt:time,bought:false,deleted:false}))};if(change(next)){choosing=false;undo=null;lastTap=null;render();toast('购物清单已生成')}}catch(e){$('#shopping-error').textContent=e.message}
 };
 $('#shopping-undo').onclick=()=>{if(!undo||undo.listId!==state.list?.id)return;const next=structuredClone(state),item=next.items.find(r=>r.id===undo.id);if(item){item.deleted=false;item.bought=undo.bought;item.updatedAt=stamp();if(change(next)){undo=null;render();toast('已恢复删除的食材')}}};
 $('#shopping-copy').onclick=async()=>{const text=shoppingItems(state).filter(i=>!i.bought).map(i=>i.name+' · '+i.amount).join('\n');if(!text)return;try{await navigator.clipboard.writeText(text);toast('待买清单已复制')}catch{$('#shopping-copy-fallback').hidden=false;$('#shopping-list-copy-text').value=text;$('#shopping-list-copy-text').focus();$('#shopping-list-copy-text').select()}};
 $('#shopping-dialog').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.shoppingRemove){lastTap=null;updateItem(b.dataset.shoppingRemove,'delete')}if(b.dataset.shoppingItem){const id=b.dataset.shoppingItem,time=Date.now();if(e.detail!==0&&lastTap?.id===id&&time-lastTap.at<450){const bought=lastTap.bought;lastTap=null;updateItem(id,'delete',bought)}else{lastTap=e.detail===0?null:{id,at:time,bought:state.items.find(i=>i.id===id)?.bought||false};updateItem(id,'toggle')}}});
 $('#shopping-dialog').addEventListener('dblclick',e=>{const b=e.target.closest('[data-shopping-item]');if(b){e.preventDefault();lastTap=null;updateItem(b.dataset.shoppingItem,'delete')}});
 $('#shopping-dialog').addEventListener('change',e=>{if(!e.target.dataset.chooseRecipe)return;const id=e.target.dataset.chooseRecipe;if(e.target.checked)chosen.add(id);else chosen.delete(id);$('#shopping-error').textContent='';render()});
 $('#shopping-dialog').addEventListener('close',()=>{lastTap=null});
 addEventListener('storage',e=>{if(e.key===KEY){try{state=mergeShopping(state,normalizeShopping(JSON.parse(e.newValue||JSON.stringify(emptyShopping()))));render();onChange()}catch{toast('另一窗口的购物清单无法读取，请先备份')}}});
 return {open,render,hasData:()=>Boolean(state.list),snapshot:()=>{if(blocked)throw Error('购物清单备份无法读取，请检查浏览器存储');return structuredClone(state)},validate:normalizeShopping,import:value=>change(mergeShopping(state,value)),async synchronize(cfg){if(blocked)throw Error('购物清单存储无法读取，已暂停同步');for(let i=0;i<4;i++){const cloud=await fetchDocument(cfg,'food-shopping'),combined=mergeShopping(state,cloud.state||emptyShopping());persist(combined);render();if(cloud.state&&JSON.stringify(combined)===JSON.stringify(cloud.state))return;try{await putDocument(combined,cloud.revision,cfg,'food-shopping');return}catch(e){if(e.status!==409||i===3)throw e}}}};
}
