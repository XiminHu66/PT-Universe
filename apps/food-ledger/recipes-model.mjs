import {safeUrl} from './model.mjs';
export const emptyRecipes=()=>({version:1,recipes:[]});
export const presetTags=['想做','会做','回头菜'];
const text=(v,max)=>typeof v==='string'?v.trim().slice(0,max):'';
export function recipeLink(value){const s=text(value,4000),found=s.match(/https?:\/\/[^\s<>"「」]+/i);if(!found&&!/^[a-z0-9.-]+\.[a-z]{2,}(?:[/:?#]|$)/i.test(s))return '';return safeUrl(found?found[0].replace(/[，。；、！）》】]+$/,''):s)}
export function sourceLabel(value){try{const h=new URL(value).hostname;if(h==='xiachufang.com'||h.endsWith('.xiachufang.com'))return '下厨房';if(h==='xiaohongshu.com'||h.endsWith('.xiaohongshu.com')||h==='xhslink.com'||h.endsWith('.xhslink.com'))return '小红书'}catch{}return value?'其他来源':'手动记录'}
export const lines=value=>String(value||'').split(/\n/).map(s=>s.trim()).filter(Boolean);
export function normalizeRecipes(value){
 if(!value||value.version!==1||!Array.isArray(value.recipes)||value.recipes.length>5000)throw Error('菜谱备份格式无效');
 const recipes=value.recipes.map(r=>{
  if(!r||!/^[-\w]{1,80}$/.test(r.id)||!Number.isSafeInteger(r.updatedAt)||r.updatedAt<0||(!text(r.name,120)&&!r.deleted))throw Error('菜谱记录不完整');
  if(!Array.isArray(r.ingredients)||!Array.isArray(r.steps)||!Array.isArray(r.tags)||r.ingredients.length>100||r.steps.length>100||r.tags.length>20||[...r.ingredients,...r.steps,...r.tags].some(x=>typeof x!=='string'))throw Error('食材、步骤或标签格式无效');
  const tags=[...new Set(r.tags.map(t=>text(t,30)).filter(Boolean))];
  return {id:r.id,updatedAt:r.updatedAt,deleted:r.deleted===true,name:text(r.name,120),url:safeUrl(r.url),tags,ingredients:r.ingredients.map(s=>text(s,2000)).filter(Boolean),steps:r.steps.map(s=>text(s,2000)).filter(Boolean),note:text(r.note,4000),extractedBy:['xiachufang','screenshot'].includes(r.extractedBy)?r.extractedBy:'',warnings:Array.isArray(r.warnings)?r.warnings.filter(s=>typeof s==='string').map(s=>text(s,500)).slice(0,10):[],author:text(r.author,120)};
 });
 if(new Set(recipes.map(r=>r.id)).size!==recipes.length)throw Error('菜谱备份有重复编号');return {version:1,recipes};
}
export function mergeRecipes(left,right){const rows=new Map();for(const r of [...normalizeRecipes(left).recipes,...normalizeRecipes(right).recipes]){const prior=rows.get(r.id);if(!prior||r.updatedAt>prior.updatedAt||(r.updatedAt===prior.updatedAt&&JSON.stringify(r)>JSON.stringify(prior)))rows.set(r.id,r)}return {version:1,recipes:[...rows.values()].sort((a,b)=>a.id.localeCompare(b.id))}}
export const liveRecipes=state=>state.recipes.filter(r=>!r.deleted).sort((a,b)=>b.updatedAt-a.updatedAt||a.name.localeCompare(b.name));
