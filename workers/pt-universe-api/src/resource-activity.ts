import { readVpsDealBoard } from './knowledge';
import { toolUsageSummary } from './usage';

const nonNegative = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
const trigger = (value: unknown) => value === 'manual' || value === 'schedule';
const validStatus = (value: unknown) => value === 'failed' || value === 'partial' || value === 'success';
const object = (value: unknown): Record<string,unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string,unknown> : {};
const counts = (raw: unknown) => {
  const row = object(raw);
  const {executions,cpuMs,requests,peakRssBytes,durationMs,failed} = row;
  return [executions,cpuMs,requests,peakRssBytes,durationMs,failed].every(nonNegative)
    ? {executions,cpuMs,requests,peakRssBytes,durationMs,failed} : null;
};
const period = (value: unknown) => {
  const row = object(value);
  return {manual: counts(row.manual), schedule: counts(row.schedule)};
};

export function sanitizeTaskActivity(board: unknown) {
  const data = object(object(board).resourceActivity);
  const {observedAt,since,recent} = data;
  if (!nonNegative(observedAt) || (since !== null && !nonNegative(since)) || !Array.isArray(recent)) return null;
  const runs = recent.slice(0,30).flatMap(value => {
    const {id,roundId,startedAt,trigger:source,status,durationMs,cpuMs,peakRssBytes,requests,okSources,totalSources} = object(value);
    if (!trigger(source) || !validStatus(status) ||
        ![id,startedAt,durationMs,cpuMs,peakRssBytes,requests,okSources,totalSources].every(nonNegative)) return [];
    return [{id,roundId: nonNegative(roundId) ? roundId : null,startedAt,trigger:source,status,durationMs,cpuMs,peakRssBytes,requests,okSources,totalSources}];
  });
  return {observedAt,since,week:period(data.week),month:period(data.month),recent:runs};
}

export async function readResourceActivity(env: Parameters<typeof readVpsDealBoard>[0] & {DB:D1Database}) {
  const [views, vps] = await Promise.allSettled([toolUsageSummary(env.DB), readVpsDealBoard(env)]);
  const ledger = vps.status === 'fulfilled' ? sanitizeTaskActivity(vps.value) : null;
  return {
    views: views.status === 'fulfilled' ? views.value : null,
    dealRadar: ledger,
    dealRadarState: vps.status !== 'fulfilled' ? 'unavailable' : ledger ? 'connected' : 'not_connected',
  };
}
