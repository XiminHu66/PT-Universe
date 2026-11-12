const money = value => Number.isFinite(value) && value > 0 ? Math.round(value * 100) / 100 : null;

function band(values) {
  const low = money(values?.[0]), high = money(values?.[1]);
  return low && high && low <= high ? [low, high] : null;
}

export function priceZones(decision) {
  return {buy:band(decision.buy), sell:band(decision.sell), risk:money(decision.invalidation)};
}

export function priceLocation(price, {buy, sell, risk}) {
  const current = money(price);
  if (!current || !(buy || sell || risk)) return null;
  if (risk && current < risk) return 'risk';
  if (sell && current > sell[1]) return 'aboveSell';
  if (sell && current >= sell[0]) return 'sell';
  if (buy && current >= buy[0] && current <= buy[1]) return 'buy';
  if (buy && current < buy[0]) return 'belowBuy';
  return 'outside';
}
