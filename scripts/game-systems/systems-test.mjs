import assert from 'node:assert/strict';
import {template,validateSystem,derivedHero} from '../../apps/game-systems-studio/systems-model.mjs';
import {simulateIncremental} from '../../apps/game-systems-studio/incremental-engine.mjs';
import {simulateRpg,rpgFight,journey} from '../../apps/game-systems-studio/rpg-engine.mjs';
import {DEFAULT as classic} from '../../apps/card-lab/engine.mjs';
import {handoffCardLab,HANDOFF} from '../../apps/game-systems-studio/bridge.mjs';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-5,`${a} != ${b}`);
let d=template('incremental');
Object.assign(d.settings,{duration:100,startCurrency:20,policy:'save',goal:50,clickRate:2,clickValue:3});d.generators=[];d.upgrades=[];
let r=simulateIncremental(d);close(r.earned,600);close(r.currency,620);close(r.rate,6);close(r.goalTime,50/6);assert.equal(r.purchases,0);assert.equal(r.points.length,121);
d.settings.clickRate=0;r=simulateIncremental(d);assert.equal(r.goalTime,null);assert.equal(r.earned,0);assert.equal(r.currency,20);
d=template('incremental');const original=structuredClone(d);r=simulateIncremental(d);assert.deepEqual(d,original);assert.deepEqual(r,simulateIncremental(d));close(r.currency+r.spent,d.settings.startCurrency+r.earned);assert.ok(r.purchases>0);assert.ok(r.goalTime>0);
let purchaseCount=0;for(const event of r.log.filter(x=>x.name==='矿工')){close(event.cost,15*1.15**purchaseCount++);assert.ok(event.currency>=0)}
d=template('incremental');Object.assign(d.settings,{duration:1000,policy:'save',startCurrency:0,clickRate:1,clickValue:1,prestige:'threshold',prestigeThreshold:100,prestigeBonus:0});d.generators=[];d.upgrades=[];r=simulateIncremental(d);assert.equal(r.resets,9);close(r.earned,1000);assert.ok(r.log.every(x=>x.type==='prestige'));close(r.prestigePoints,9);
d.settings.prestige='never';assert.equal(simulateIncremental(d).resets,0);
for(const bad of [NaN,Infinity,-1]){d=template('incremental');d.settings.duration=bad;assert.throws(()=>validateSystem(d))}
d=template('incremental');d.generators[0].id='__proto__';assert.throws(()=>validateSystem(d));
d=template('rpg');d.skills[0].id='basic';assert.throws(()=>validateSystem(d));
d=template('rpg');d.group[0].enemyId='missing';assert.throws(()=>validateSystem(d));
d=template('rpg');d.items[1].slot='weapon';assert.throws(()=>validateSystem(d));
d=template('rpg');d.items[0].crit=1;assert.throws(()=>validateSystem(d));
d=template('rpg');d.settings.runs=1001;assert.throws(()=>validateSystem(d));
d=template('rpg');const input=structuredClone(d),a=rpgFight(d,42,5,1,true),b=rpgFight(d,42,5,1,false);assert.deepEqual(d,input);assert.deepEqual({...a,events:[]},b);assert.deepEqual(a,rpgFight(d,42,5,1,true));
for(const event of a.events){assert.ok(event.state.hero.hp>=0);assert.ok(event.state.hero.hp<=event.state.hero.maxHp);assert.ok(event.state.hero.mana>=0);assert.ok(event.state.hero.mana<=event.state.hero.maxMana);if(event.type==='damage')assert.equal(event.detail.afterArmor,Math.max(0,Math.floor(event.detail.raw-event.detail.defense)))}
for(const skill of d.skills){const uses=a.events.filter(e=>e.type==='skill'&&e.title==='施放 '+skill.name);for(let i=1;i<uses.length;i++)assert.ok(uses[i].time-uses[i-1].time>=skill.cooldown-1e-8)}
assert.ok(!a.events.some(e=>e.title==='施放 护体'));
d=template('rpg');d.skills=[];d.items=[];d.hero.attack=0;d.hero.defense=10000;d.hero.crit=0;d.settings.mode='encounter';d.settings.runs=3;d.settings.stage=1;d.settings.maxTime=5;r=simulateRpg(d);assert.equal(r.draws,3);assert.equal(r.wins+r.losses+r.draws,3);assert.equal(r.damage,0);assert.equal(r.averageTime,5);
d=template('rpg');d.skills=[];d.items=[];Object.assign(d.hero,{attack:1000,crit:0,interval:1});d.enemies[0].hp=7;d.group[0].count=1;const f=rpgFight(d,42,1,1,true);assert.equal(f.result,'win');assert.equal(f.damage,7);assert.equal(f.time,1);assert.equal(f.bySkill.basic.damage,7);
d=template('rpg');r=simulateRpg(d);assert.deepEqual(r,simulateRpg(d));assert.ok(r.averageLevel>d.hero.level);assert.equal(r.wins+r.losses+r.draws,d.settings.runs);assert.equal(r.curve[0].reached,d.settings.runs);for(let i=1;i<r.curve.length;i++)assert.equal(r.curve[i].reached,r.curve[i-1].wins);assert.ok(r.ci.low<=r.winRate&&r.winRate<=r.ci.high);assert.ok(journey(d,42).stages.length>1);assert.ok(derivedHero(d,10).attack>derivedHero(d,1).attack);
d=template('rpg');d.hero.hp=1;d.hero.attack=0;d.hero.defense=0;d.items=[];d.skills=[];d.settings.runs=1;r=simulateRpg(d);assert.equal(r.curve[1].reached,0);assert.equal(r.curve[1].conditionalWinRate,null);assert.equal(r.curve[1].averageLevel,null);
const memory=new Map([['ptu.cardlab.config','preserve'],['pt.game-systems-studio.v1','preserve']]);globalThis.localStorage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)};
const url=handoffCardLab(classic),transfer=JSON.parse(memory.get(HANDOFF));assert.ok(url.includes('cards.html?handoff='));assert.equal(transfer.data.format,'pt.game-systems-studio');assert.ok(transfer.data.cards.length);assert.equal(memory.get('ptu.cardlab.config'),'preserve');assert.equal(memory.get('pt.game-systems-studio.v1'),'preserve');const prev=memory.get(HANDOFF);assert.throws(()=>handoffCardLab({}));assert.equal(memory.get(HANDOFF),prev);
console.log('PASS: incremental analytic income, event costs, conservation, goal timing, prestige, RPG reproducibility, arithmetic, cooldowns, mana bounds, timeouts, XP progression, reach denominator, validation, and non-destructive Card Lab handoff');
