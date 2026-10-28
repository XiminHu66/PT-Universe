import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {localItems,overview,select}=createRequire(import.meta.url)('../../../apps/daily-nexus/upcoming-policy.js');
const today='2026-10-28';
const rows=localItems({events:[
{id:'a',city:'Seattle',title:'Seattle Center Sculpture Walk 2026',start:today,url:'https://www.seattlecenter.com/a'},
{id:'b',city:'Kirkland',title:'City Hall Holiday Closures',start:today,url:'https://www.kirklandwa.gov/b'},
{id:'c',city:'Redmond',title:'Autumn Festival',start:'2026-10-31',url:'https://experienceredmond.com/c'},
{id:'d',city:'Redmond',title:'Autumn Festival',start:'2026-11-01',url:'https://experienceredmond.com/c'},
{id:'e',city:'Bellevue',title:'Holiday Art Fair',start:'2026-11-01',url:'https://bellevuewa.gov/e'},
{id:'f',city:'Seattle',title:'Culture Festival',start:'2026-11-02',url:'https://www.seattlecenter.com/f'},
]},today);
assert.equal(rows.length,3);assert.deepEqual(rows.map(x=>x.city),['Redmond','Bellevue','Seattle']);
const items=[...rows,{id:'game',date:'2026-12-10T16:30:00-08:00',category:'event',priority:110},{id:'tech',date:'2027-01-06T12:00:00',category:'tech',priority:110}];
const shown=select(overview(items,today),'all',today);
assert.equal(shown.length,3);assert.ok(shown.some(x=>x.category==='event'));assert.ok(shown.some(x=>x.category==='tech'));assert.ok(shown.filter(x=>x.category==='local').length<=2);assert.equal(new Set(shown.filter(x=>x.category==='local').map(x=>x.city)).size,1);
assert.ok(!overview([...items,{id:'late',date:'2027-10-28',category:'tech'}],today).some(x=>x.id==='late'));
const pinId=rows.find(x=>x.city==='Seattle').id;const pinned=select(overview(items.map(x=>({...x,pinned:x.id===pinId})),today),'all',today);assert.ok(pinned.some(x=>x.id===pinId));
console.log('PASS upcoming: multiple cities, routine/duplicate filtering, local/game/tech coverage, source diversity, extended convention horizon and saved pins.');
