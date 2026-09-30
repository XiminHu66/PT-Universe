import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {prepareRecipes,planMeals,parseIngredients,scaleQuantities} from '../../apps/_decision/meal-planner.mjs';
const snapshot=JSON.parse(await readFile(new URL('../../apps/meal-orbit/data/recipes.json',import.meta.url),'utf8'));
const recipes=prepareRecipes(snapshot),names=r=>r.options.map(m=>m.name);
assert.equal(recipes.length,snapshot.count);assert.ok(recipes.length>=350);
assert.deepEqual(parseIngredients('西紅柿，馬鈴薯 鸡蛋'),['番茄','土豆','鸡蛋']);
const beef=planMeals(recipes,{pantry:'牛肉'}),potato=planMeals(recipes,{pantry:'土豆'}),egg=planMeals(recipes,{pantry:'西红柿 鸡蛋'});
assert.notDeepEqual(names(beef),names(potato));assert.notDeepEqual(names(egg),names(potato));assert.ok(egg.options.every(m=>m.matched.length===2));assert.ok(names(egg).includes('西红柿炒鸡蛋'));
assert.deepEqual(names(egg),names(planMeals(recipes,{pantry:'番茄，鸡蛋'})));
assert.equal(planMeals(recipes,{pantry:'火星石'}).total,0);
assert.equal(planMeals(recipes,{exclude:'不知道什么食材'}).total,0);
const next=planMeals(recipes,{pantry:'土豆'},{offset:3});assert.notDeepEqual(names(next),names(potato));
const all=planMeals(recipes,{minutes:'any',equipment:'any',category:'all'});assert.equal(all.total,recipes.length);
const seafood=planMeals(recipes,{pantry:'虾',exclude:'海鲜',minutes:'any',equipment:'any',category:'all'});assert.equal(seafood.total,0);
const quick=planMeals(recipes,{minutes:'20'});assert.ok(quick.options.every(m=>m.minutes<=20&&!m.advance));
for(const [equipment,tool]of [['microwave','微波炉'],['airfryer','空气炸锅'],['pot','锅']]){
 const result=planMeals(recipes,{equipment,minutes:'any'});assert.ok(result.options.every(m=>m.equipment.every(t=>t===tool)));
}
const tomato=recipes.find(r=>r.name==='西红柿炒鸡蛋');assert.equal(tomato.baseServings,1);assert.match(scaleQuantities(tomato,2).text,/西红柿 = 2个/);assert.match(scaleQuantities(tomato,4).text,/西红柿 = 4个/);
const stew=recipes.find(r=>r.name==='西红柿土豆炖牛肉');assert.equal(stew.minutes,90);assert.ok(stew.equipment.includes('高压锅'));
assert.ok(!planMeals(recipes,{pantry:'牛肉',minutes:'30'}).options.some(r=>r.id===stew.id));
console.log('Full recipe database validated: real-input differences, aliases, exclusions, tools/time, pagination, full coverage and supported portion scaling');
