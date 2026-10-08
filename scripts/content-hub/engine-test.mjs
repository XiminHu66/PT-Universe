import assert from 'node:assert/strict';import {DEFAULT,validate,createGame,play,endTurn,simulate} from '../../apps/card-lab/engine.mjs';
const a=createGame(DEFAULT,42),b=createGame(DEFAULT,42);assert.deepEqual(a,b);assert.equal(a.hand.length,5);assert.equal(a.energy,3);
const c=a.hand.find(x=>x.type==='attack')||a.hand[0];play(a,c.instance);assert.equal(a.energy,3-c.cost);assert.equal(a.discard.length,1);assert.throws(()=>play(a,c.instance),/不在手牌/);
const costly=a.hand.find(x=>x.cost>a.energy);if(costly){const before=structuredClone(a);assert.throws(()=>play(a,costly.instance),/能量/);assert.deepEqual(a,before);}
const guard={...structuredClone(DEFAULT),cards:[{id:'g',name:'guard',type:'guard',cost:1,value:30,copies:5}]};const s=createGame(guard,1);play(s,s.hand[0].instance);endTurn(s);assert.equal(s.hero.hp,s.hero.maxHp);assert.equal(s.hero.block,0);
const bleed={...structuredClone(DEFAULT),cards:[{id:'b',name:'bleed',type:'bleed',cost:1,value:3,copies:5}]};const t=createGame(bleed,1);play(t,t.hand[0].instance);assert.equal(t.enemy.hp,t.enemy.maxHp);endTurn(t);assert.equal(t.enemy.hp,t.enemy.maxHp-3);assert.equal(t.enemy.bleed,2);
const r=simulate(DEFAULT,100,42);assert.deepEqual(r,simulate(DEFAULT,100,42));assert.ok(r.winRate>=0&&r.winRate<=1&&r.turns<=101);assert.notDeepEqual(r,simulate(DEFAULT,100,43));
assert.throws(()=>validate({...DEFAULT,hero:{...DEFAULT.hero,hp:Infinity}}));assert.throws(()=>validate({...DEFAULT,cards:[{...DEFAULT.cards[0],cost:4}]}));assert.throws(()=>validate({...DEFAULT,cards:[DEFAULT.cards[0],DEFAULT.cards[0]]}));assert.throws(()=>simulate(DEFAULT,1001));
const stall={...guard,enemy:{hp:500,attack:0,defense:0}};assert.equal(simulate(stall,1,1).draws,1);assert.deepEqual(DEFAULT.hero,{hp:42,attack:4,defense:1});
console.log('Card Lab passed: deterministic games/simulation, energy and deck accounting, shield/bleed timing, rejection without mutation, simulation bounds');
