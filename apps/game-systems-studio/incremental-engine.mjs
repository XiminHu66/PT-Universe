import {validateSystem} from './systems-model.mjs';
export function simulateIncremental(raw,progress=()=>{}){
 const d=validateSystem(raw);if(d.gameType!=='incremental')throw Error('需要增量设计');const s=d.settings,owned=d.generators.map(g=>g.owned),levels=d.upgrades.map(()=>0),points=[];let t=0,currency=s.startCurrency,earned=0,runEarned=0,spent=0,prestigePoints=0,resets=0,purchases=0,steps=0,goalTime=null,lastBuy=0,longestWait=0,nextSample=0;const log=[];
 const emit=(type,name,cost=0)=>{if(log.length<400)log.push({time:t,type,name,cost,currency,earned})};
 const multiplier=()=>d.upgrades.reduce((v,u,i)=>v*u.multiplier**levels[i],1)*(1+prestigePoints*s.prestigeBonus);
 const rate=()=> (s.clickRate*s.clickValue+d.generators.reduce((n,g,i)=>n+g.rate*owned[i],0))*multiplier();
 function actions(){const mult=multiplier(),income=rate(),units=owned.reduce((n,x)=>n+x,0),a=d.generators.map((g,i)=>({kind:'generator',i,name:g.name,cost:g.cost*g.growth**owned[i],gain:g.rate*mult}));for(let i=0;i<d.upgrades.length;i++){const u=d.upgrades[i];if(levels[i]<u.maxLevel&&units>=u.requiresOwned)a.push({kind:'upgrade',i,name:u.name,cost:u.cost*u.growth**levels[i],gain:income*(u.multiplier-1)})}return a.filter(x=>Number.isFinite(x.cost)&&x.cost<1e300&&x.gain>0)}
 function sample(){points.push({time:t,currency,earned,rate:rate(),prestige:prestigePoints})}
 function safe(){if(![currency,earned,rate()].every(x=>Number.isFinite(x)&&x<1e300))throw Error('产出超过 1e300 数值范围；请降低倍率或缩短时长')}
 sample();nextSample=s.duration/120;
 while(t<s.duration-1e-7){if(++steps>200000)throw Error('事件超过 200,000 次；请降低转生频率或缩短模拟');safe();if(steps%1000===0)progress(t/s.duration);
   if(s.prestige==='threshold'&&runEarned+1e-7>=s.prestigeThreshold){const award=Math.max(1,Math.floor(Math.sqrt(runEarned/s.prestigeThreshold)));prestigePoints+=award;resets++;emit('prestige','转生 +'+award);currency=s.startCurrency;runEarned=0;owned.splice(0,owned.length,...d.generators.map(g=>g.owned));levels.fill(0);continue}
   const available=s.policy==='save'?[]:actions(),affordable=available.filter(a=>a.cost<=currency+Math.max(1e-8,currency*1e-12));
   if(affordable.length){affordable.sort(s.policy==='cheapest'?(a,b)=>a.cost-b.cost:(a,b)=>a.cost/a.gain-b.cost/b.gain||a.cost-b.cost);const a=affordable[0];currency=Math.max(0,currency-a.cost);spent+=a.cost;purchases++;longestWait=Math.max(longestWait,t-lastBuy);lastBuy=t;if(a.kind==='generator')owned[a.i]++;else levels[a.i]++;emit(a.kind,a.name,a.cost);continue}
   const income=rate();let dt=Math.min(s.duration-t,Math.max(1e-7,nextSample-t));if(income>0){const minCost=available.length?Math.min(...available.map(a=>a.cost)):Infinity;dt=Math.min(dt,Math.max(0,(minCost-currency)/income));if(goalTime===null)dt=Math.min(dt,Math.max(0,(s.goal-earned)/income));if(s.prestige==='threshold')dt=Math.min(dt,Math.max(0,(s.prestigeThreshold-runEarned)/income));}
   if(dt<1e-7)dt=Math.min(1e-7,s.duration-t);const gain=income*dt;t+=dt;currency+=gain;earned+=gain;runEarned+=gain;if(goalTime===null&&earned+Math.max(1e-6,s.goal*1e-12)>=s.goal)goalTime=t;if(t+1e-7>=nextSample){sample();nextSample+=s.duration/120;}
 }
 safe();if(points.at(-1).time<s.duration-1e-7)sample();else points.at(-1).time=s.duration;longestWait=Math.max(longestWait,t-lastBuy);return{engineVersion:d.engineVersion,duration:s.duration,currency,earned,rate:rate(),spent,goalTime,prestigePoints,resets,purchases,steps,longestWait,points,log,logTruncated:purchases+resets>400,producers:d.generators.map((g,i)=>({id:g.id,name:g.name,owned:owned[i],rate:g.rate*owned[i]*multiplier(),nextCost:g.cost*g.growth**owned[i],payback:g.rate>0?g.cost*g.growth**owned[i]/(g.rate*multiplier()):null})),upgrades:d.upgrades.map((u,i)=>({id:u.id,name:u.name,level:levels[i]}))};
}
