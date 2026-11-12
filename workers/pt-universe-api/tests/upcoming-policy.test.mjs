import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {localItems,overview,select,onDay,day,time,within}=createRequire(import.meta.url)('../../../apps/daily-nexus/upcoming-policy.js');
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
const shown=select(overview(items,today));
assert.deepEqual(shown.map(x=>x.id),['local:c','local:e','seattle-center:f','game','tech']);
assert.ok(!overview([...items,{id:'late',date:'2027-10-28',category:'tech'}],today).some(x=>x.id==='late'));
const eventDay='2026-11-11';
const upcoming=[
 {id:'ignite',date:'2026-11-17T12:00:00',endDate:'2026-11-20',category:'tech'},
 {id:'overnight',date:'2026-11-12T00:30:00Z',dateKey:eventDay,category:'local'},
 {id:'noon',date:'2026-11-11T12:00:00',manual:true,category:'local'},
 {id:'all-day',date:eventDay,category:'local'},
 {id:'tomorrow',date:'2026-11-12T15:00:00',category:'local'},
 {id:'late-today',date:'2026-11-11T21:00:00-08:00',category:'local'},
 {id:'multi',date:'2026-11-10',endDate:'2026-11-13',category:'local'},
];
assert.deepEqual(select(overview(upcoming,eventDay)).map(x=>x.id),['multi','all-day','overnight','noon','late-today','tomorrow']);
assert.deepEqual(onDay(upcoming,'2026-11-18').map(x=>x.id),['ignite']);
assert.equal(onDay(upcoming,'2026-11-21').length,0);
assert.equal(day(upcoming[1]),eventDay);
assert.equal(time(upcoming[2]),'12:00');
assert.equal(time(upcoming[3]),'');
assert.equal(within(upcoming,0,eventDay).length,5);
console.log('PASS upcoming: source filtering, chronological preview, range overlap, source dates, all-day events and multi-day calendar markers.');
