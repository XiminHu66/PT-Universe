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

const {investmentRefreshSlot} = await import('../../apps/investment-desk/sessions.mjs');
const {batchQuote, mergeMarketItem} = await import('../../apps/investment-desk/refresh.mjs');
assert.equal(investmentRefreshSlot(Date.parse('2026-11-12T15:59:59Z')), null);
assert.equal(investmentRefreshSlot(Date.parse('2026-11-12T16:00:00Z')), '2026-11-12');
assert.equal(investmentRefreshSlot(Date.parse('2026-07-13T15:00:00Z')), '2026-07-13');
assert.equal(investmentRefreshSlot(Date.parse('2026-11-26T17:00:00Z')), null);
assert.equal(investmentRefreshSlot(Date.parse('2026-11-28T17:00:00Z')), null);
const live = batchQuote({symbol:'QQQ',price:105,lastTradeAt:'2026-11-12T20:00:00Z',history:[{d:'2026-11-11',c:100},{d:'2026-11-12',c:104}]}, 'QQQ');
assert.equal(live.previousClose, 100);
assert.ok(Math.abs(live.changePct - 5) < 0.001);
const merged = mergeMarketItem(live,{price:102,changePct:2,lastTradeAt:'2026-11-12T18:00:00Z',news:[{title:'Latest headline'}]});
assert.equal(merged.price, 105);
assert.equal(merged.changePct, live.changePct);
assert.equal(merged.news.length, 1);
assert.equal(merged.history.length, 2);
console.log('Batch quotes passed: market date/DST, previous close, and older details preserving newer price');

const {normalizeDisclosures, keepAvailableSources} = await import('../../apps/investment-desk/disclosures.mjs');
const auditedAt = '2026-11-12T16:00:00Z';
const house = 'https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/2026/20035143.pdf';
const sec = 'https://www.sec.gov/Archives/edgar/data/1067983/000119312526172364/xslForm13F_X02/primary_doc.xml';
const transaction = {ticker:'INTC', type:'Purchase', transactionDate:'2026-07-24', disclosureDate:'2026-08-24', sourceLink:house};
const politician = {id:'politician', name:'Politician', kind:'congress', ok:true, trades:[
  transaction, transaction, {...transaction, transactionDate:'2026-02-30'},
  {...transaction, transactionDate:'2026-08-25'},
  {...transaction, ticker:'AMD', sourceLink:house.replace('.gov/', '.gov.example.com/')}
]};
const fund = {id:'fund', name:'Fund', kind:'13f', ok:true,
  snapshot:{periodEnd:'2026-06-30', filedAt:'2026-08-14', periodLabel:'2026 Q2', holdings:[{ticker:'AAPL'}]},
  filingHistory:[
    {filedAt:'2026-08-14', periodLabel:'2026 Q1', sourceUrl:sec},
    {filedAt:'2026-08-14', periodLabel:'2026 Q2', sourceUrl:sec.replace('/xslForm13F_X02','')}
  ]};
const audited = normalizeDisclosures({generatedAt:auditedAt, sources:[politician, fund]}, Date.parse(auditedAt));
assert.equal(audited.sources[0].invalid,2);
assert.equal(audited.sources[0].duplicates,1);
assert.equal(audited.sources[0].trades[0].lag,31);
assert.equal(audited.sources[0].trades[0].filing.url,house);
assert.equal(audited.sources[0].trades[1].filing,null);
assert.equal(audited.sources[1].snapshot.filing.url,sec.replace('/xslForm13F_X02',''));
const updated = normalizeDisclosures({generatedAt:auditedAt, sources:[{...politician, trades:[{...transaction, transactionDate:'bad'}]}]}, Date.parse(auditedAt));
assert.equal(updated.sources[0].ok,false);
assert.deepEqual(keepAvailableSources(audited,updated).sources.map(source=>source.ok),[false,false]);
assert.equal(keepAvailableSources(audited,updated).sources[0].trades.length,2);
console.log('Disclosure checks passed: official links, transaction chronology, deduplication and per-source fallback');


const {priceZones,priceLocation} = await import('../../apps/investment-desk/price-zones.mjs');
const zones = priceZones({buy:[98,102],sell:[110,116],invalidation:90});
assert.equal(priceLocation(89.99,zones),'risk');
assert.equal(priceLocation(90,zones),'belowBuy');
assert.equal(priceLocation(98,zones),'buy');
assert.equal(priceLocation(102,zones),'buy');
assert.equal(priceLocation(106,zones),'outside');
assert.equal(priceLocation(110,zones),'sell');
assert.equal(priceLocation(116,zones),'sell');
assert.equal(priceLocation(116.01,zones),'aboveSell');
assert.deepEqual(priceZones({buy:[5,4],sell:[8,9],invalidation:-3}),{buy:null,sell:[8,9],risk:null});
console.log('Price-zone boundaries passed: buy, sell, risk, invalid and outside intervals');

const {confirmedSession, completedBars, evaluateRules, META_PRIOR, wilderAtr} = await import('../../apps/investment-desk/swing-rules.mjs');
const {currentPriceWindow, recentTradingSessions} = await import('../../apps/investment-desk/sessions.mjs');
const signalDate = '2026-11-20';
const beforeClose = Date.parse('2026-11-23T20:00:00Z');
const beforeConfirmation = Date.parse('2026-11-23T21:10:00Z');
const afterConfirmation = Date.parse('2026-11-23T21:16:00Z');
assert.equal(confirmedSession(beforeConfirmation), signalDate);
assert.equal(confirmedSession(afterConfirmation), '2026-11-23');
assert.equal(currentPriceWindow('2026-11-20T21:00:00Z', beforeClose), null);
assert.equal(currentPriceWindow('2026-11-23T19:15:00Z', beforeClose), null);
assert.ok(currentPriceWindow('2026-11-23T19:45:00Z', beforeClose));
assert.deepEqual(priceZones({buy:[98,102],sell:[101,116],invalidation:104}), {buy:[98,102],sell:null,risk:null});
const dates = recentTradingSessions(signalDate, 320);
assert.equal(dates.length, 320);
const neutral = dates.map(d => ({d,o:100,h:101,l:99,c:100,a:100,v:100}));
const last = {d:signalDate,o:103,h:105,l:102,c:104,a:104,v:350};
const ruleHistory = [...neutral.slice(0,-1),last,{...last,d:'2026-11-23',o:110,h:113,l:108,c:110,a:110}];
const series = {symbol:'AAA',currency:'USD',instrumentType:'EQUITY',history:ruleHistory};
const benchmark = {symbol:'SPY',currency:'USD',instrumentType:'ETF',history:neutral};
const args = {symbol:'AAA',series,benchmark,now:beforeClose};
const rules = evaluateRules(args);
assert.equal(rules.asOf, signalDate);
assert.equal(rules.n, 320);
assert.equal(rules.momentum, 0);
assert.equal(rules.gap.entry, true);
assert.ok(Math.abs(rules.gap.rv - 3.64) < 1e-10);
assert.ok(Math.abs(rules.atr - (13 * 2 + 5) / 14) < 1e-10);
assert.equal(rules.donchian.high20, 101);
const atr14 = (13 * 2 + 5) / 14;
const logit = 0.03924820527549046
  - 0.11631795807187534 * (100.08 - 100.02) / (3 * atr14)
  + 0.1581207061415078 * ((104 / 100 - 1) * 5)
  + 0.11759256335181996 * ((4 - 2 / atr14) / 2)
  - 0.10822466637280638 * Math.log(3.5)
  - 0.06963896469740448 * ((104 - 102) / (105 - 102) - 0.5);
assert.ok(Math.abs(rules.donchian.score - 1 / (1 + Math.exp(-logit))) < 1e-12);
assert.equal(rules.donchian.entry, rules.donchian.score >= META_PRIOR);
assert.equal(rules.sma.entry, true);
assert.equal(rules.sma.exit, false);
assert.equal(evaluateRules({...args, series:{...series, instrumentType:'ETF'}}).gap, null);
assert.equal(evaluateRules({...args, benchmark:{...benchmark,history:neutral.slice(0,-1)}}).donchian.score, null);
assert.equal(evaluateRules({...args, series:{...series,history:neutral.slice(0,-1)}}).status, 'missing');
assert.equal(completedBars(neutral.filter((_,i) => i !== 310), signalDate).length, 9);
assert.equal(evaluateRules({...args, now:afterConfirmation}).n, 320);
assert.equal(wilderAtr(neutral.slice(0,14)), 2);
console.log('Swing rules passed: confirmed NYSE day, stale quote gating, continuous adjusted bars, Wilder ATR, ETF exclusion, dollar volume and frozen Meta-L2');
