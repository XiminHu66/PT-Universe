import {marketSessions, recentTradingSessions} from './sessions.mjs';

const min = values => Math.min(...values);
const max = values => Math.max(...values);
const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
const clip = (value, lo, hi) => Math.min(hi, Math.max(lo, value));
const positive = value => Number.isFinite(value) && value > 0;
const sessionDelay = 15 * 60_000;
export const META_PRIOR = 0.4787234042553192;
const WEIGHTS = [-0.11631795807187534, 0.1581207061415078, 0.11759256335181996,
  -0.10822466637280638, -0.06963896469740448];
const BIAS = 0.03924820527549046;

export function confirmedSession(now = Date.now()) {
  return marketSessions(now - sessionDelay)?.completed ?? null;
}

export function completedBars(history, date) {
  if (!date || !Array.isArray(history)) return [];
  // Walk backward from the confirmed session. Gaps break the indicator's lookback.
  const byDate = new Map(history.filter(row => row?.d <= date).map(row => [row.d, row]));
  const calendar = recentTradingSessions(date, 320);
  const rows = [];
  for (let i = calendar.length - 1; i >= 0; i--) {
    const row = byDate.get(calendar[i]);
    if (!row || ![row.o, row.h, row.l, row.c, row.a].every(positive) ||
      row.h < Math.max(row.o, row.c) || row.l > Math.min(row.o, row.c)) break;
    rows.unshift(row);
  }
  if (!rows.length) return [];
  const currentAdjustment = rows.at(-1).a / rows.at(-1).c;
  return rows.map(row => {
    const factor = (row.a / row.c) / currentAdjustment;
    return {...row, o:row.o * factor, h:row.h * factor, l:row.l * factor, c:row.c * factor};
  });
}

export function wilderAtr(bars) {
  if (bars.length < 14) return null;
  const tr = bars.map((bar, i) => i ? Math.max(bar.h - bar.l, Math.abs(bar.h - bars[i - 1].c),
    Math.abs(bar.l - bars[i - 1].c)) : bar.h - bar.l);
  return tr.slice(14).reduce((prior, value) => (13 * prior + value) / 14, mean(tr.slice(0, 14)));
}

export function evaluateRules({symbol, series, benchmark, now = Date.now()}) {
  const asOf = confirmedSession(now);
  const supported = series?.symbol === symbol && series.currency === 'USD' && ['EQUITY', 'ETF'].includes(series.instrumentType);
  const bars = supported ? completedBars(series.history, asOf) : [];
  const c = bars.map(row => row.c), bar = bars.at(-1), n = bars.length;
  const rawLatest = Array.isArray(series?.history) ? series.history.filter(row => row?.d <= asOf).at(-1)?.d : null;
  const atr = wilderAtr(bars);
  const unavailable = series && !supported ? 'unsupported' : !n ? 'missing' : 'ready';
  const result = {asOf, rawLatest, n, atr, status:unavailable, momentum:null, gap:null, donchian:null, sma:null};
  if (n >= 127) result.momentum = c.at(-22) / c.at(-127) - 1;
  if (n >= 21 && series.instrumentType === 'EQUITY') {
    const prior = bars.slice(-21, -1);
    if ([...prior, bar].every(row => Number.isFinite(row.v) && row.v >= 0)) {
      const dollarVolume = prior.map(row => row.c * row.v).sort((a,b) => a-b);
      const median = (dollarVolume[9] + dollarVolume[10]) / 2;
      const gap = bar.o / c.at(-2) - 1;
      if (positive(median)) {
        const rv = bar.c * bar.v / median;
        result.gap = {gap, rv, heldOpen:bar.c >= bar.o, entry:gap >= 0.02 && bar.c >= bar.o && rv >= 2};
      }
    }
  }
  if (n >= 50) {
    const sma10 = mean(c.slice(-10)), sma50 = mean(c.slice(-50));
    const low15 = min(bars.slice(-16, -1).map(row => row.l));
    result.sma = {sma10, sma50, low15, entry:sma10 > sma50, exit:sma10 <= sma50 && bar.c < low15};
  }
  if (n >= 260 && positive(atr)) {
    const prior = bars.slice(-21, -1);
    const high20 = max(prior.map(row => row.h)), low20 = min(prior.map(row => row.l));
    const breakout = bar.c > high20;
    const exit = bar.c < low20 || result.sma.sma10 < result.sma.sma50;
    const spy = benchmark?.symbol === 'SPY' ? completedBars(benchmark.history, asOf) : [];
    let score = null;
    if (spy.length >= 61 && [...prior, bar].every(row => Number.isFinite(row.v) && row.v >= 0)) {
      const avgVolume = mean(prior.map(row => row.v));
      const features = [
        clip((result.sma.sma50 - mean(c.slice(-200))) / (3 * atr), -3, 3),
        clip((bar.c / c.at(-61) - spy.at(-1).c / spy.at(-61).c) * 5, -3, 3),
        clip((4 - (high20 - low20) / atr) / 2, -3, 3),
        avgVolume > 0 ? Math.log(clip(bar.v / avgVolume, 0.25, 4)) : 0,
        bar.h > bar.l ? (bar.c - bar.l) / (bar.h - bar.l) - 0.5 : 0
      ];
      score = 1 / (1 + Math.exp(-(BIAS + features.reduce((sum, x, i) => sum + x * WEIGHTS[i], 0))));
    }
    result.donchian = {high20, low20, breakout, exit, score,
      entry:score === null ? null : breakout && score >= META_PRIOR};
  }
  return result;
}
