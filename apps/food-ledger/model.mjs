export const empty=()=>({version:1,restaurants:[],dishes:[]});
const text=(v,max)=>typeof v==='string'?v.trim().slice(0,max):'';
export function safeUrl(value){
 const s=text(value,2000);if(!s)return '';
 try{const u=new URL(s.includes('://')?s:'https://'+s);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password?u.href:''}catch{return ''}
}
export function normalize(value){
 if(!value||value.version!==1||!Array.isArray(value.restaurants)||!Array.isArray(value.dishes))throw Error('这不是有效的红黑榜备份');
 if(value.restaurants.length>10000||value.dishes.length>50000)throw Error('记录数量超过容量');
 const check=(row)=>{if(!row||!/^[-\w]{1,80}$/.test(row.id)||!Number.isSafeInteger(row.updatedAt)||row.updatedAt<0)throw Error('记录格式不完整');return {id:row.id,updatedAt:row.updatedAt,deleted:row.deleted===true}};
 const restaurants=value.restaurants.map(r=>{const base=check(r),name=text(r.name,120);if(!name&&!base.deleted)throw Error('菜馆名称不能为空');return {...base,name,address:text(r.address,500),url:safeUrl(r.url),note:text(r.note,4000)}});
 const dishes=value.dishes.map(d=>{const base=check(d),name=text(d.name,120);if((!name||!/^[-\w]{1,80}$/.test(d.restaurantId)||!['red','black'].includes(d.rank))&&!base.deleted)throw Error('菜品记录不完整');return {...base,restaurantId:text(d.restaurantId,80),name,rank:d.rank==='black'?'black':'red',note:text(d.note,4000),date:/^\d{4}-\d{2}-\d{2}$/.test(d.date||'')?d.date:''}});
 if(new Set(restaurants.map(r=>r.id)).size!==restaurants.length||new Set(dishes.map(d=>d.id)).size!==dishes.length)throw Error('备份中存在重复记录编号');
 const ids=new Set(restaurants.map(r=>r.id));if(dishes.some(d=>!d.deleted&&!ids.has(d.restaurantId)))throw Error('备份中的菜品缺少对应菜馆');
 return {version:1,restaurants,dishes};
}
export function merge(left,right){
 const a=normalize(left),b=normalize(right),result=empty();
 for(const key of ['restaurants','dishes']){const rows=new Map();for(const row of [...a[key],...b[key]]){const old=rows.get(row.id);if(!old||row.updatedAt>old.updatedAt||(row.updatedAt===old.updatedAt&&JSON.stringify(row)>JSON.stringify(old)))rows.set(row.id,row)}result[key]=[...rows.values()].sort((x,y)=>x.id.localeCompare(y.id))}
 return result;
}
export const liveRestaurants=state=>state.restaurants.filter(r=>!r.deleted).sort((a,b)=>b.updatedAt-a.updatedAt||a.name.localeCompare(b.name));
export const dishesFor=(state,id)=>state.dishes.filter(d=>!d.deleted&&d.restaurantId===id).sort((a,b)=>b.updatedAt-a.updatedAt);
export function navigationUrl(restaurant){return restaurant.address?'https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(restaurant.name+' '+restaurant.address):''}
