// Pure deterministic combat rules, shared by play mode and the simulator.
export const DEFAULT={version:1,name:'轻量冒险',hero:{hp:42,attack:4,defense:1},enemy:{hp:46,attack:7,defense:1},cards:[
 {id:'strike',name:'斩击',type:'attack',cost:1,value:6,copies:5},
 {id:'guard',name:'架势',type:'guard',cost:1,value:7,copies:3},
 {id:'heal',name:'回春',type:'heal',cost:2,value:9,copies:2},
 {id:'bleed',name:'裂伤',type:'bleed',cost:1,value:3,copies:2}
]};
export function validate(raw){
 if(!raw||typeof raw!=='object'||!Array.isArray(raw.cards))throw Error('配置需要角色、敌人和卡牌列表');
 const num=(v,lo,hi,label)=>{if(!Number.isInteger(v)||v<lo||v>hi)throw Error(label+' 必须在 '+lo+'–'+hi+' 之间');return v;};
 const actor=(v,label)=>({hp:num(v?.hp,1,500,label+'生命'),attack:num(v?.attack,0,60,label+'攻击'),defense:num(v?.defense,0,30,label+'防御')});
 if(raw.cards.length<1||raw.cards.length>30)throw Error('需要 1–30 种卡牌');
 const ids=new Set(),cards=raw.cards.map((c,i)=>{const id=String(c.id||'card-'+i).slice(0,80);if(ids.has(id))throw Error('卡牌 ID 重复');ids.add(id);if(!['attack','guard','heal','bleed'].includes(c.type))throw Error('卡牌类型不支持');return {id,name:String(c.name||'未命名').slice(0,60),type:c.type,cost:num(c.cost,0,3,'消耗'),value:num(c.value,1,60,'效果'),copies:num(c.copies,1,10,'张数')};});
 if(cards.reduce((n,c)=>n+c.copies,0)>100)throw Error('牌组不能超过 100 张');
 return {version:1,name:String(raw.name||'自定义牌组').slice(0,80),hero:actor(raw.hero,'角色'),enemy:actor(raw.enemy,'敌人'),cards};
}
function random(s){s.rng=(s.rng+0x6D2B79F5)>>>0;let t=s.rng;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;}
function shuffle(s,a){for(let i=a.length-1;i>0;i--){const j=Math.floor(random(s)*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
const log=(s,t)=>{s.log.push(t);if(s.log.length>150)s.log.shift();};
function result(s){if(s.hero.hp<=0)s.result='lost';else if(s.enemy.hp<=0)s.result='won';return s.result;}
function draw(s){while(s.hand.length<5){if(!s.draw.length){if(!s.discard.length)break;s.draw=shuffle(s,s.discard.splice(0));}s.hand.push(s.draw.pop());}}
function startTurn(s){s.turn++;s.energy=3;s.hero.block=0;const bleed=Math.min(s.enemy.hp,s.enemy.bleed);if(bleed){s.enemy.hp-=bleed;s.damage+=bleed;s.enemy.bleed=Math.max(0,s.enemy.bleed-1);log(s,'敌人受到 '+bleed+' 裂伤伤害');}if(result(s))return;draw(s);s.intent=s.turn%3===0?'heavy':s.turn%4===0?'guard':'attack';log(s,'第 '+s.turn+' 回合 · 能量 3');}
export function createGame(config=DEFAULT,seed=1){const c=validate(config),s={config:c,rng:Number(seed)>>>0,hero:{...c.hero,maxHp:c.hero.hp,block:0},enemy:{...c.enemy,maxHp:c.enemy.hp,block:0,bleed:0},draw:[],discard:[],hand:[],turn:0,energy:0,result:null,intent:'attack',log:[],damage:0,lastRoll:null};for(const card of c.cards)for(let i=0;i<card.copies;i++)s.draw.push({...card,instance:card.id+'-'+i});shuffle(s,s.draw);startTurn(s);return s;}
export function play(s,instance){
 if(s.result)throw Error('战斗已结束');const idx=s.hand.findIndex(c=>c.instance===instance);if(idx<0)throw Error('这张卡不在手牌中');const c=s.hand[idx];if(c.cost>s.energy)throw Error('能量不足');
 s.hand.splice(idx,1);s.discard.push(c);s.energy-=c.cost;
 if(c.type==='attack'){const roll=1+Math.floor(random(s)*6);s.lastRoll=roll;if(roll===1)log(s,c.name+' · 骰子 1，未命中');else{const raw=c.value+s.hero.attack+(roll===6?4:0),damage=Math.max(0,raw-s.enemy.defense-s.enemy.block);s.enemy.block=Math.max(0,s.enemy.block-Math.max(0,raw-s.enemy.defense));s.enemy.hp=Math.max(0,s.enemy.hp-damage);s.damage+=damage;log(s,c.name+' · 骰子 '+roll+(roll===6?' 暴击':'')+' · '+damage+' 伤害');}}
 else if(c.type==='guard'){s.hero.block+=c.value;log(s,c.name+' · 获得 '+c.value+' 护盾');}
 else if(c.type==='heal'){const amount=Math.min(c.value,s.hero.maxHp-s.hero.hp);s.hero.hp+=amount;log(s,c.name+' · 恢复 '+amount+' 生命');}
 else{s.enemy.bleed=Math.min(60,s.enemy.bleed+c.value);log(s,c.name+' · 裂伤 +'+c.value+'，下回合结算');}
 result(s);return s;
}
export function endTurn(s){if(s.result)return s;s.discard.push(...s.hand.splice(0));s.enemy.block=0;if(s.intent==='guard'){s.enemy.block=8;log(s,'敌人架势 · 护盾 8');}else{const raw=s.enemy.attack+(s.intent==='heavy'?5:0),damage=Math.max(0,raw-s.hero.defense-s.hero.block);s.hero.hp=Math.max(0,s.hero.hp-damage);log(s,'敌人'+(s.intent==='heavy'?'重击':'攻击')+' · '+damage+' 伤害');}if(!result(s))startTurn(s);if(s.turn>100&&!s.result){s.result='draw';log(s,'超过 100 回合，判定未决');}return s;}
export function simulate(config,runs=100,seed=1){const c=validate(config);if(!Number.isInteger(runs)||runs<1||runs>1000)throw Error('模拟次数需要在 1–1000 之间');let wins=0,draws=0,turns=0,damage=0;for(let i=0;i<runs;i++){const s=createGame(c,(Number(seed)+i)>>>0);while(!s.result){let moves=0;while(!s.result&&moves++<5){const choices=s.hand.filter(c=>c.cost<=s.energy).sort((a,b)=>{const score=c=>c.type==='heal'?(s.hero.hp<=s.hero.maxHp*.5?100:0):c.type==='attack'?80:c.type==='bleed'?60:40;return score(b)-score(a);});const card=choices.find(c=>c.type!=='heal'||s.hero.hp<s.hero.maxHp);if(!card)break;play(s,card.instance);}if(!s.result)endTurn(s);}wins+=s.result==='won'?1:0;draws+=s.result==='draw'?1:0;turns+=s.turn;damage+=s.damage;}return {runs,seed,wins,draws,winRate:wins/runs,turns:turns/runs,damage:damage/runs,strategy:'低于半血先治疗，然后攻击、裂伤、护盾；相同配置和种子可复现'};}
