import * as Cards from './model.mjs';
import {template,validateSystem} from './systems-model.mjs';
export const KEYS={cards:'pt.game-systems-studio.v1',incremental:'pt.gss.incremental.v1',rpg:'pt.gss.rpg.v1'};
export const validateDesign=d=>d?.format===Cards.FORMAT?Cards.validate(d):validateSystem(d);
export const designType=d=>d?.format===Cards.FORMAT?'cards':d?.gameType;
export const defaultDesign=type=>type==='cards'?Cards.validate(Cards.DEFAULT):template(type);
export function readWorkspace(storage,type){
 const data=defaultDesign(type),empty={version:1,revision:0,data,history:[],last:null,baseline:null};
 try{const raw=storage.getItem(KEYS[type]);if(!raw)return{state:empty,blocked:false};const s=JSON.parse(raw);
 if(s.version!==1||!Number.isInteger(s.revision)||s.revision<0||!Array.isArray(s.history))throw Error('记录格式异常');
 s.data=validateDesign(s.data);if(designType(s.data)!==type)throw Error('设计类型不匹配');
 s.history=s.history.slice(0,20).map(h=>{const d=validateDesign(h.data);if(designType(d)!==type)throw Error('历史类型不匹配');return{...h,data:d}});
 for(const e of [s.last,s.baseline])if(e){e.config=validateDesign(e.config);if(designType(e.config)!==type||!e.result||e.result.engineVersion!==e.config.engineVersion||!Number.isFinite(Date.parse(e.at)))throw Error('实验记录异常');const r=e.result,finite=k=>typeof r[k]==='number'&&Number.isFinite(r[k])&&r[k]>=0;
 if(type==='incremental'){if(!['earned','rate','currency','duration','spent','resets','prestigePoints','purchases','longestWait'].every(finite)||!Array.isArray(r.points)||!Array.isArray(r.log)||!Array.isArray(r.producers))throw Error('经济实验缺少详情')}
 else{if(!['runs','seed','wins','losses','draws','winRate'].every(finite)||!Number.isInteger(r.runs)||r.runs<1||r.runs>100000||r.wins+r.losses+r.draws!==r.runs||!r.ci||!Number.isFinite(r.ci.low)||!Number.isFinite(r.ci.high))throw Error('战斗实验缺少详情');if(type==='cards'&&(!r.byCard||!r.roundHistogram||!r.deathCauses||!r.samples))throw Error('卡牌实验缺少详情');if(type==='rpg'&&(!Array.isArray(r.curve)||!r.bySkill||!r.causes))throw Error('成长实验缺少详情')}}
 return{state:s,blocked:false};
 }catch(error){return{state:empty,blocked:true,error:error.message}}
}
export function persistWorkspace(storage,type,previous,next){
 const data=validateDesign(next.data);if(designType(data)!==type)throw Error('不能写入其他类型的工作区');
 const raw=storage.getItem(KEYS[type]);if(raw){const current=JSON.parse(raw);if(current.revision!==previous.revision)throw Error('另一窗口已保存，请导出当前设计后刷新')}else if(previous.revision!==0)throw Error('工作区在另一窗口被移除，请导出后刷新');
 const value={...next,data,revision:previous.revision+1};storage.setItem(KEYS[type],JSON.stringify(value));return value;
}
export function changedDesign(state,raw,label='修改设计',clear=false){
 const data=validateDesign(raw);if(designType(data)!==designType(state.data))throw Error('工作区类型不匹配');
 return{...state,data,history:[{id:Cards.id('v'),at:new Date().toISOString(),label,data:structuredClone(state.data)},...state.history].slice(0,20),...(clear?{last:null,baseline:null}:{})};
}
export function configurationDiff(a,b){const rows=[];function walk(x,y,path=''){if(JSON.stringify(x)===JSON.stringify(y))return;if(Array.isArray(x)&&Array.isArray(y)){const key=v=>v&&typeof v==='object'?(v.id??v.cardId??v.enemyId):null;if([...x,...y].every(v=>key(v)!=null)){const a=new Map(x.map(v=>[key(v),v])),b=new Map(y.map(v=>[key(v),v]));for(const k of new Set([...a.keys(),...b.keys()]))walk(a.get(k),b.get(k),path+'.'+k);return}}if(x&&y&&typeof x==='object'&&typeof y==='object'&&!Array.isArray(x)&&!Array.isArray(y)){for(const k of new Set([...Object.keys(x),...Object.keys(y)]))walk(x[k],y[k],path?path+'.'+k:k)}else rows.push({path,before:x,after:y})}walk(a,b);return rows}
