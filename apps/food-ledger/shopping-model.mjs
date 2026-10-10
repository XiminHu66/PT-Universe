export const emptyShopping=()=>({version:1,list:null,items:[]});
const clean=(s,n=2000)=>typeof s==='string'?s.trim().slice(0,n):'';
const numbers={'一':1,'二':2,'两':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10,'半':0.5};
const numberPattern='(?:\\d+(?:\\.\\d+)?(?:\\/\\d+(?:\\.\\d+)?)?|[一二两三四五六七八九十半]+)';
const unitPattern='(?:千克|公斤|毫升|kg|ml|克|升|g|l|个|颗|只|根|片|瓣|把|袋|盒|包|罐|瓶|杯|汤匙|茶匙|大匙|小匙|勺|块|条|枚|斤|两|cups?|tbsp|tsp|pcs?)';
const amountRe=new RegExp('^('+numberPattern+')\\s*('+unitPattern+')?$','i');
const suffixRe=new RegExp('^(.+?)\\s*('+numberPattern+'\\s*'+unitPattern+')$','i');
const rangeRe=new RegExp('^(.+?)\\s*('+numberPattern+'\\s*[-~～–至到]\\s*'+numberPattern+'\\s*'+unitPattern+')$','i');
const prefixRe=new RegExp('^('+numberPattern+'\\s*'+unitPattern+')\\s*(.+)$','i');
function number(s){if(s==='半')return .5;if(/^\d/.test(s)){const [a,b]=s.split('/').map(Number);return b===undefined?a:b?a/b:NaN}if(s.includes('十')){const [a,b]=s.split('十');return (a?numbers[a]:1)*10+(b?numbers[b]:0)}return numbers[s]??NaN}
const units={'克':['g',1],'g':['g',1],'千克':['g',1000],'公斤':['g',1000],'kg':['g',1000],'毫升':['ml',1],'ml':['ml',1],'升':['ml',1000],'l':['ml',1000]};
export function parseIngredient(raw){
 const value=clean(raw).normalize('NFKC').replace(/\s+/g,' ');let name=value,amount='';
 const separated=value.match(/^(.+?)\s*[·:：—]\s*(.+)$/);
 if(separated){name=separated[1].trim();amount=separated[2].trim()}
 else{const range=value.match(rangeRe),dash=value.match(/^(.+?)\s+[–-]\s+(.+)$/),suffix=value.match(suffixRe),prefix=value.match(prefixRe),unknown=value.match(/^(.+?)\s+(适量|少许|若干)$/);if(range){name=range[1].trim();amount=range[2]}else if(dash){name=dash[1].trim();amount=dash[2]}else if(suffix){name=suffix[1].trim();amount=suffix[2]}else if(prefix){name=prefix[2].trim();amount=prefix[1]}else if(unknown){name=unknown[1];amount=unknown[2]}}
 const found=amount.match(amountRe);let quantity=null;
 if(found){const n=number(found[1]),u=(found[2]||'').toLowerCase(),[unit,factor]=units[u]||[u,1];if(Number.isFinite(n)&&n>0&&n*factor<=1000000)quantity={value:n*factor,unit}}
 return {name:name||value,key:(name||value).replace(/\s+/g,'').toLowerCase(),amount:amount||'未注明用量',quantity,raw:value};
}
const rounded=n=>String(Math.round(n*1000)/1000);
export function summarizeAmounts(parts){
 const totals=new Map(),unknown=[];for(const p of parts){if(p.quantity)totals.set(p.quantity.unit,(totals.get(p.quantity.unit)||0)+p.quantity.value);else if(!unknown.includes(p.amount))unknown.push(p.amount)}
 return [...totals].map(([unit,n])=>unit==='g'&&n>=1000?rounded(n/1000)+' kg':unit==='ml'&&n>=1000?rounded(n/1000)+' L':rounded(n)+(unit?' '+unit:'')).concat(unknown).join(' + ');
}
export function buildShopping(recipes){
 if(!Array.isArray(recipes)||!recipes.length)throw Error('请至少选择一道有食材的菜谱');if(recipes.length>20)throw Error('一次最多选择 20 道菜谱');
 const groups=new Map();for(const recipe of recipes){for(const raw of recipe.ingredients){const p=parseIngredient(raw);if(!p.name)continue;let row=groups.get(p.key);if(!row){row={name:p.name,parts:[],sources:[]};groups.set(p.key,row)}row.parts.push(p);row.sources.push({recipeId:recipe.id,recipeName:recipe.name,raw:p.raw})}}
 if(!groups.size)throw Error('这些菜谱还没有食材，请先补充用料');if(groups.size>500)throw Error('食材超过 500 项，请减少选择的菜谱');
 return [...groups.values()].map((r,index)=>({name:r.name,amount:summarizeAmounts(r.parts),sources:r.sources,order:index}));
}
export function normalizeShopping(value){
 if(!value||value.version!==1||!Array.isArray(value.items)||value.items.length>500)throw Error('购物清单备份格式无效');
 const validId=s=>typeof s==='string'&&/^[-\w]{1,80}$/.test(s),validTime=s=>Number.isSafeInteger(s)&&s>=0;
 let list=null;if(value.list){const l=value.list;if(!validId(l.id)||!validTime(l.updatedAt)||!Array.isArray(l.recipeIds)||!Array.isArray(l.recipeNames)||l.recipeIds.length>20||l.recipeNames.length!==l.recipeIds.length||l.recipeIds.some(s=>!validId(s))||l.recipeNames.some(s=>typeof s!=='string'))throw Error('购物清单来源不完整');list={id:l.id,updatedAt:l.updatedAt,recipeIds:l.recipeIds,recipeNames:l.recipeNames.map(s=>clean(s,120))}}
 const items=value.items.map(r=>{if(!list||!validId(r.id)||r.listId!==list.id||!validTime(r.updatedAt)||!Number.isInteger(r.order)||r.order<0||!clean(r.name,200)||!Array.isArray(r.sources)||r.sources.length>2000||r.sources.some(s=>!validId(s?.recipeId)||typeof s.recipeName!=='string'||typeof s.raw!=='string'))throw Error('购物清单条目不完整');return {id:r.id,listId:r.listId,updatedAt:r.updatedAt,order:r.order,name:clean(r.name,200),amount:clean(r.amount),bought:r.bought===true,deleted:r.deleted===true,sources:r.sources.map(s=>({recipeId:s.recipeId,recipeName:clean(s.recipeName,120),raw:clean(s.raw)}))}});
 if(new Set(items.map(r=>r.id)).size!==items.length)throw Error('购物清单有重复编号');return {version:1,list,items};
}
export function mergeShopping(left,right){
 const a=normalizeShopping(left),b=normalizeShopping(right),lists=[a.list,b.list].filter(Boolean).sort((x,y)=>y.updatedAt-x.updatedAt||JSON.stringify(y).localeCompare(JSON.stringify(x)));const list=lists[0]||null,items=new Map();
 for(const r of [...a.items,...b.items]){if(r.listId!==list?.id)continue;const prior=items.get(r.id);if(!prior||r.updatedAt>prior.updatedAt||(r.updatedAt===prior.updatedAt&&JSON.stringify(r)>JSON.stringify(prior)))items.set(r.id,r)}return {version:1,list,items:[...items.values()].sort((x,y)=>x.id.localeCompare(y.id))};
}
export const shoppingItems=state=>state.items.filter(r=>!r.deleted).sort((a,b)=>a.order-b.order||a.id.localeCompare(b.id));
