import assert from 'node:assert/strict';
import {marketSessions,reviewWindow} from '../../apps/investment-desk/sessions.mjs';
import {parsePortfolioCSV,csvRows,portfolioDecision,disclosureLag} from '../../apps/_decision/portfolio.mjs';
const parsed=parsePortfolioCSV('\uFEFFAccount Name,Symbol,Description,Quantity,Cost Basis Total\r\nA,NVDA,"NVIDIA, INC",10,"$1,200.00"\r\nB,NVDA,Nvidia,2,$300\r\nA,SPAXX**,Cash,500,$500\r\nA,-NVDA261020C300,Option,1,$100\r\nA,AAPL,Apple,3,--\r\nA,MSFT,Short,-2,800');
assert.equal(parsed.positions.length,2);assert.equal(parsed.positions[0].quantity,12);assert.equal(parsed.positions[0].cost,125);assert.equal(parsed.positions[1].cost,null);assert.equal(parsed.skipped.length,3);assert.equal(parsed.warnings.length,1);
assert.equal(parsePortfolioCSV('说明\nsymbol,quantity,cost\nW,2,50').positions[0].cost,50);assert.deepEqual(csvRows('a,"b\nline",c\n1,"quote ""ok""",3'),[['a','b\nline','c'],['1','quote "ok"','3']]);assert.throws(()=>parsePortfolioCSV('bad data'));assert.throws(()=>csvRows('"unclosed'));
const now=Date.parse('2026-09-30T20:00:00Z'),history=Array.from({length:252},(_,i)=>({d:new Date(now-(251-i)*86400000).toISOString().slice(0,10),o:100+i/10,h:102+i/10,l:99+i/10,c:100+i/10})),q={price:125,currency:'USD',lastTradeAt:new Date(now).toISOString(),history},h={symbol:'QA',quantity:10};
let d=portfolioDecision(h,q,null,[],now);assert.ok(d.buy[0]<d.buy[1]);assert.ok(d.sell[0]<d.sell[1]);assert.notEqual(d.state,'buy');assert.equal(portfolioDecision(h,{...q,lastTradeAt:'2025-01-01'},null,[],now).state,'unknown');assert.equal(portfolioDecision(h,{...q,currency:'JPY'},null,[],now).state,'unknown');assert.equal(portfolioDecision(h,{...q,history:history.slice(0,30)},null,[],now).state,'unknown');assert.equal(portfolioDecision(h,{...q,lastTradeAt:'2027-01-01'},null,[],now).state,'unknown');
assert.equal(disclosureLag({transactionDate:'2026-07-24',disclosureDate:'2026-08-24'}),31);console.log('Portfolio tests passed: Fidelity quoted CSV, aggregated costs, unsupported holdings, missing/stale/future evidence, price zones, disclosure lag');

const thanksgivingWeek = Date.parse('2026-11-23T17:00:00Z');
assert.deepEqual(reviewWindow('2026-11-20T21:00:00Z', thanksgivingWeek), {start:'2026-11-23', end:'2026-11-30'});
assert.equal(reviewWindow('2026-11-19T21:00:00Z', thanksgivingWeek), null);
assert.equal(reviewWindow('2026-11-23T18:00:00Z', thanksgivingWeek), null);
assert.deepEqual(marketSessions(Date.parse('2026-11-27T18:05:00Z')), {open:false, start:'2026-11-30', completed:'2026-11-27'});
assert.deepEqual(marketSessions(Date.parse('2026-11-26T18:05:00Z')), {open:false, start:'2026-11-27', completed:'2026-11-25'});
assert.deepEqual(marketSessions(Date.parse('2027-07-06T19:30:00Z')), {open:true, start:'2027-07-06', completed:'2027-07-02'});
assert.equal(reviewWindow('2028-12-29T21:00:00Z', Date.parse('2028-12-29T22:00:00Z')), null);
console.log('Trading date tests passed: holidays, early close, Eastern time, stale quotes, unpublished calendar');
