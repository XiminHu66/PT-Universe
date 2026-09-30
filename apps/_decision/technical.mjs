const finite=v=>v===null||v===undefined||v===""?null:Number.isFinite(Number(v))?Number(v):null;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const fmt=v=>Number(v).toFixed(2);
function sma(values, period) { if (values.length < period) return null; return values.slice(-period).reduce((sum, value) => sum + value, 0) / period; }
function emaSeries(values, period) {
  if (!values.length) return []; const multiplier = 2 / (period + 1); const output = [values[0]];
  for (let index = 1; index < values.length; index++) output.push(values[index] * multiplier + output[index - 1] * (1 - multiplier));
  return output;
}
function standardDeviation(values) { if (!values.length) return null; const mean = values.reduce((sum,v) => sum + v,0) / values.length; return Math.sqrt(values.reduce((sum,v) => sum + (v-mean)**2,0) / values.length); }
function rsi(values, period = 14) {
  if (values.length <= period) return null; const diffs = values.slice(-period - 1).slice(1).map((value,index) => value - values.slice(-period - 1)[index]);
  const gains = diffs.reduce((sum,value) => sum + Math.max(0,value),0) / period; const losses = diffs.reduce((sum,value) => sum + Math.max(0,-value),0) / period;
  return losses === 0 ? (gains === 0 ? 50 : 100) : 100 - 100 / (1 + gains / losses);
}
function atr(history, period = 14) {
  if (history.length <= period) return null; const sample = history.slice(-period - 1); const ranges = sample.slice(1).map((row,index) => Math.max(row.h-row.l, Math.abs(row.h-sample[index].c), Math.abs(row.l-sample[index].c)));
  return ranges.reduce((sum,value) => sum + value,0) / ranges.length;
}
function lastValid(values) { return [...values].reverse().find(value => Number.isFinite(value)) ?? null; }
function median(values) { const sorted = values.filter(Number.isFinite).sort((a,b) => a-b); if (!sorted.length) return null; const mid = Math.floor(sorted.length/2); return sorted.length % 2 ? sorted[mid] : (sorted[mid-1]+sorted[mid])/2; }

export function calculateAnalysis(history, livePrice) {
  const valid = history.filter(row => finite(row.c) !== null && finite(row.h) !== null && finite(row.l) !== null); if (valid.length < 20) return null;
  const closes = valid.map(row => Number(row.c)); const highs = valid.map(row => Number(row.h)); const lows = valid.map(row => Number(row.l)); const price = finite(livePrice) ?? closes.at(-1);
  const sma20 = sma(closes,20), sma50 = sma(closes,50), sma200 = sma(closes,200); const rsi14 = rsi(closes); const atr14 = atr(valid) || price*.025;
  const ema12 = emaSeries(closes,12), ema26 = emaSeries(closes,26); const macdSeries = closes.map((_,index) => index < 25 ? null : ema12[index]-ema26[index]);
  const macdValues = macdSeries.filter(Number.isFinite); const macd = lastValid(macdValues), macdSignal = lastValid(emaSeries(macdValues,9));
  const std20 = standardDeviation(closes.slice(-20)); const bbUpper = sma20 + 2*std20, bbLower = sma20 - 2*std20;
  const high20 = Math.max(...highs.slice(-20)), low20 = Math.min(...lows.slice(-20)); const high60 = Math.max(...highs.slice(-60)), low60 = Math.min(...lows.slice(-60));
  const high52 = Math.max(...highs.slice(-252)), low52 = Math.min(...lows.slice(-252));
  const returns = closes.slice(-252).slice(1).map((value,index) => Math.log(value / closes.slice(-252)[index])); const annualVol = standardDeviation(returns) * Math.sqrt(252) * 100;
  const supports = [sma20,sma50,sma200,bbLower,low20,low60].filter(value => Number.isFinite(value) && value <= price*1.04 && value >= price*.65);
  const resistances = [bbUpper,high20,high60,high52,price+2*atr14].filter(value => Number.isFinite(value) && value >= price*.96 && value <= price*1.45);
  let support = median(supports) ?? price-1.5*atr14; let resistance = median(resistances) ?? price+2*atr14;
  if (sma50 && price > sma50 && sma20 > sma50) support = Math.max(support, Math.min(sma20,price));
  // Zones are centered on historical support/resistance. Do not anchor their edge
  // to the live price, otherwise the price can never actually enter the zone.
  const buyLow = Math.max(price*.55, support-.75*atr14); const buyHigh = support+.45*atr14;
  const sellLow = resistance-.35*atr14; const sellHigh = resistance+.75*atr14;
  const compare=(a,b)=>Math.abs(a/b-1)<.002?0:a>b?1:-1;
  let trendScore = 0; if (sma20) trendScore += compare(price,sma20); if (sma50) trendScore += compare(price,sma50); if (sma200) trendScore += compare(price,sma200); if (sma20 && sma50) trendScore += compare(sma20,sma50);
  let signal = "等待"; let tone = "neutral";
  if (price >= sellLow || rsi14 >= 72) { signal = "偏向止盈"; tone = "sell"; }
  else if (price >= buyLow && price <= buyHigh) { signal = rsi14 < 48 ? "进入买入区" : "接近支撑"; tone = "buy"; }
  else if (trendScore >= 3 && rsi14 < 68 && macd >= macdSignal) { signal = "趋势持有"; tone = "buy"; }
  else if (trendScore <= -2) { signal = "谨慎等待"; tone = "sell"; }
  else signal = "区间等待";
  const completeness = clamp(valid.length/252,0,1); const alignment = Math.abs(trendScore)/4; const confidence = Math.round(clamp(48+completeness*25+alignment*17-(annualVol>75?8:0),35,90));
  const summaryParts = [];
  if (trendScore >= 3) summaryParts.push("中短期均线结构偏多"); else if (trendScore <= -2) summaryParts.push("价格位于多条关键均线下方"); else summaryParts.push("趋势信号尚未形成一致方向");
  if (rsi14 > 70) summaryParts.push("RSI 已进入偏热区"); else if (rsi14 < 35) summaryParts.push("RSI 接近超卖区"); else summaryParts.push("RSI 处于中性区间");
  summaryParts.push(`模型以约 ${fmt(atr14)} 的 ATR 为区间缓冲`);
  return { price,sma20,sma50,sma200,rsi14,atr:atr14,macd,macdSignal,bbUpper,bbLower,high52,low52,annualVol,buyLow,buyHigh,sellLow,sellHigh,trendScore,signal,tone,confidence,summary:summaryParts.join("；")+"。" };
}

