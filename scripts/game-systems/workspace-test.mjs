import assert from 'node:assert/strict';
import {KEYS,defaultDesign,readWorkspace,persistWorkspace,changedDesign,configurationDiff} from '../../apps/game-systems-studio/workspace.mjs';
import {batch} from '../../apps/game-systems-studio/engine.mjs';
const memory=new Map(),storage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)};
for(const type of Object.keys(KEYS)){
 const first=readWorkspace(storage,type);assert.equal(first.blocked,false);assert.equal(first.state.revision,0);
 const original=structuredClone(first.state),d=structuredClone(first.state.data);d.name+=' · revision';
 const changed=changedDesign(first.state,d,'edit');assert.equal(changed.history.length,1);assert.deepEqual(changed.history[0].data,original.data);assert.deepEqual(first.state,original);
 const saved=persistWorkspace(storage,type,first.state,changed);assert.equal(saved.revision,1);assert.equal(readWorkspace(storage,type).state.data.name,d.name);
 const before=storage.getItem(KEYS[type]);assert.throws(()=>persistWorkspace(storage,type,original,changed));assert.equal(storage.getItem(KEYS[type]),before);
 const invalid=structuredClone(d);invalid.name='';assert.throws(()=>persistWorkspace(storage,type,saved,{...saved,data:invalid}));assert.equal(storage.getItem(KEYS[type]),before);
 const badHistory={...saved,history:[{data:{},at:new Date().toISOString()}]};storage.setItem(KEYS[type],JSON.stringify(badHistory));assert.equal(readWorkspace(storage,type).blocked,true);assert.equal(storage.getItem(KEYS[type]),JSON.stringify(badHistory));storage.setItem(KEYS[type],before);
 const d2=structuredClone(d);d2.name='restored';let history=changed;for(let i=0;i<25;i++)history=changedDesign(history,d2,'change');assert.equal(history.history.length,20);
}
const data=defaultDesign('cards'),r={...batch(data,100,42),elapsedMs:1},experiment={id:'old',at:'2026-10-22T20:00:00Z',config:data,result:r,hash:'original'},old={version:1,revision:17,data,history:[],last:experiment,baseline:experiment};
storage.setItem(KEYS.cards,JSON.stringify(old));const migrated=readWorkspace(storage,'cards');assert.equal(migrated.blocked,false);assert.equal(migrated.state.revision,17);assert.deepEqual(migrated.state.last,experiment);assert.deepEqual(migrated.state.baseline,experiment);
const edit=structuredClone(data);edit.cards[2].stacks=4;const next=changedDesign(migrated.state,edit,'bleed');assert.deepEqual(next.last,experiment);assert.deepEqual(next.baseline,experiment);assert.deepEqual(configurationDiff(data,edit).map(x=>x.path),['cards.bleed.stacks']);
storage.setItem(KEYS.cards,JSON.stringify({...old,last:{...experiment,result:{engineVersion:data.engineVersion}}}));assert.equal(readWorkspace(storage,'cards').blocked,true);
storage.setItem(KEYS.cards,'{malformed');assert.equal(readWorkspace(storage,'cards').blocked,true);assert.equal(storage.getItem(KEYS.cards),'{malformed');
assert.equal(readWorkspace({getItem(){throw Error('denied')}},'cards').blocked,true);
assert.throws(()=>persistWorkspace(storage,'cards',old,{...old,data:defaultDesign('rpg')}));
assert.throws(()=>persistWorkspace({getItem:()=>null,setItem(){throw Error('quota')}},'cards',{...old,revision:0},old));
console.log('PASS: existing card workspace/baseline preservation, type isolation, revision leases, validation before write, damaged-record protection, bounded history, storage errors, and exact configuration diff');
