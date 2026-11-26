const toolIds = ['reading-desk', 'investment-desk', 'rss-dashboard', 'tsugi-checker', '3c-scout', 'deal-radar'] as const;
type ToolID = typeof toolIds[number];
const isToolID = (value: unknown): value is ToolID => typeof value === 'string' && toolIds.some(id => id === value);

type UsageKind = 'universe' | 'nexus' | 'sync' | 'shared-ai';
type UsageIdentity = 'browser' | 'account';
const origin = 'https://ximinhu66.github.io';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const accountId = /^[-0-9a-f]{36}$/i;
const digest = /^[0-9a-f]{64}$/;
const pacificDate = new Intl.DateTimeFormat('sv-SE', {timeZone:'America/Los_Angeles'});
const schema = new WeakMap<D1Database, Promise<unknown>>();
const seen = new WeakMap<D1Database, Map<string, Promise<void>>>();

function ensureSchema(db: D1Database) {
  let ready = schema.get(db);
  if (!ready) {
    ready = db.batch([
      db.prepare('CREATE TABLE IF NOT EXISTS pt_usage_activity(day TEXT NOT NULL, kind TEXT NOT NULL, identity TEXT NOT NULL, PRIMARY KEY(day,kind,identity)) WITHOUT ROWID'),
      db.prepare('CREATE TABLE IF NOT EXISTS pt_tool_activity(day TEXT NOT NULL, tool TEXT NOT NULL, identity TEXT NOT NULL, seen_at INTEGER NOT NULL, PRIMARY KEY(day,tool,identity)) WITHOUT ROWID'),
      db.prepare('CREATE TABLE IF NOT EXISTS pt_usage_owner(kind TEXT NOT NULL, identity TEXT NOT NULL, marked_day TEXT NOT NULL, PRIMARY KEY(kind,identity)) WITHOUT ROWID'),
    ]).catch(error => { schema.delete(db); throw error; });
    schema.set(db, ready);
  }
  return ready;
}

function offset(day: string, days: number) {
  return new Date(Date.parse(day)+days*86400000).toISOString().slice(0,10);
}

async function hashIdentity(kind: UsageIdentity, id: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('pt-usage:'+kind+':'+id));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2,'0')).join('');
}

async function record(db: D1Database, kind: UsageKind, id: string, now: Date) {
  const day = pacificDate.format(now);
  const identity = await hashIdentity(kind==='universe'||kind==='nexus'?'browser':'account', id);
  const key = `${day}:${kind}:${identity}`;
  let entries = seen.get(db);
  if (!entries) { entries = new Map(); seen.set(db, entries); }
  const previous = entries.get(key);
  if (previous) return previous;
  if (entries.size>=2048) entries.clear();
  const pending = (async () => {
    await ensureSchema(db);
    await db.prepare('INSERT OR IGNORE INTO pt_usage_activity(day,kind,identity) VALUES(?,?,?)').bind(day,kind,identity).run();
  })().catch(error => { entries.delete(key); throw error; });
  entries.set(key,pending);
  return pending;
}

export async function recordUsageAccount(db: D1Database, id: string, kind: 'sync'|'shared-ai', now = new Date()) {
  if (accountId.test(id)) await record(db,kind,id,now);
}

async function smallJSON(request: Request) {
  const reader = request.body?.getReader();
  if (!reader || Number(request.headers.get('content-length'))>512) return null;
  const payload = new Uint8Array(512);
  let size = 0;
  try {
    for (;;) {
      const {value,done} = await reader.read();
      if (done) return JSON.parse(new TextDecoder().decode(payload.subarray(0,size)));
      if (size+value.length>payload.length) return null;
      payload.set(value,size);
      size+=value.length;
    }
  } catch { return null; }
  finally { await reader.cancel().catch(()=>{}); }
}

export async function usageVisit(request: Request, env: Pick<Env,'DB'|'USAGE_VISIT_LIMIT'>) {
  if (request.method!=='POST') return 405;
  const ip = request.headers.get('cf-connecting-ip');
  if (request.headers.get('origin')!==origin || !ip) return 403;
  const {success} = await env.USAGE_VISIT_LIMIT.limit({key:ip});
  if (!success) return 429;
  const data = await smallJSON(request);
  if (!data || typeof data.id!=='string' || !uuid.test(data.id) || (data.site!=='universe' && data.site!=='nexus')) return 400;
  await record(env.DB,data.site,data.id,new Date());
  return 204;
}

export async function toolVisit(request: Request, env: Pick<Env,'DB'|'USAGE_VISIT_LIMIT'>, now = new Date()) {
  if (request.method !== 'POST') return 405;
  const ip = request.headers.get('cf-connecting-ip');
  if (request.headers.get('origin') !== origin || !ip) return 403;
  const {success} = await env.USAGE_VISIT_LIMIT.limit({key:ip});
  if (!success) return 429;
  const data = await smallJSON(request);
  if (!data || typeof data.id !== 'string' || !uuid.test(data.id) || !isToolID(data.tool)) return 400;
  await ensureSchema(env.DB);
  await env.DB.prepare('INSERT OR IGNORE INTO pt_tool_activity(day,tool,identity,seen_at) VALUES(?,?,?,?)')
    .bind(pacificDate.format(now), data.tool, await hashIdentity('browser', data.id), now.getTime()).run();
  return 204;
}

export async function toolUsageSummary(db: D1Database, now = new Date()) {
  await ensureSchema(db);
  const day = pacificDate.format(now);
  const since = offset(day, -29);
  const [visits, coverage, owners] = await Promise.all([
    db.prepare(`SELECT a.tool,
      count(DISTINCT CASE WHEN a.day >= ? THEN a.day END) AS week,
      count(DISTINCT a.day) AS month, max(a.seen_at) AS lastVisit
      FROM pt_tool_activity a INNER JOIN pt_usage_owner o
        ON a.identity=o.identity AND o.kind='browser' AND o.marked_day>=?
      WHERE a.day BETWEEN ? AND ? GROUP BY a.tool`)
      .bind(offset(day,-6), offset(day,-89), since, day).all<{tool:ToolID;week:number;month:number;lastVisit:number}>(),
    db.prepare('SELECT tool, min(day) AS first FROM pt_tool_activity WHERE day <= ? GROUP BY tool')
      .bind(day).all<{tool:ToolID;first:string}>(),
    db.prepare("SELECT count(*) AS total FROM pt_usage_owner WHERE kind='browser' AND marked_day>=?")
      .bind(offset(day,-89)).first<{total:number}>(),
  ]);
  return {
    day, ownedBrowsers: owners?.total ?? 0,
    tools: toolIds.map(id => {
      const first = coverage.results.find(row => row.tool === id)?.first ?? null;
      const own = visits.results.find(row => row.tool === id);
      return { id, first, weeksDays: own?.week ?? 0, monthDays: own?.month ?? 0, lastVisit: own?.lastVisit ?? null };
    }),
  };
}

export async function markUsageOwner(request: Request, db: D1Database, now = new Date()) {
  const data = await smallJSON(request);
  if (!data || typeof data.browser!=='string' || !digest.test(data.browser) || !Array.isArray(data.accounts) || data.accounts.length>2 || data.accounts.some((id: unknown)=>typeof id!=='string'||!digest.test(id))) return false;
  await ensureSchema(db);
  const today = pacificDate.format(now);
  const insert = 'INSERT INTO pt_usage_owner(kind,identity,marked_day) VALUES(?,?,?) ON CONFLICT(kind,identity) DO UPDATE SET marked_day=excluded.marked_day WHERE marked_day<excluded.marked_day';
  await db.batch([
    db.prepare(insert).bind('browser',data.browser,today),
    ...[...new Set<string>(data.accounts)].map(id=>db.prepare(insert).bind('account',id,today)),
  ]);
  return true;
}

export async function usageSummary(db: D1Database, now = new Date()) {
  await ensureSchema(db);
  const day = pacificDate.format(now);
  const counts = async (start: string) => {
    const row = await db.prepare(`SELECT
      count(DISTINCT CASE WHEN a.kind IN ('universe','nexus') THEN a.identity END) AS browsers,
      count(DISTINCT CASE WHEN a.kind IN ('universe','nexus') AND o.identity IS NOT NULL THEN a.identity END) AS ownBrowsers,
      count(DISTINCT CASE WHEN a.kind='nexus' THEN a.identity END) AS nexusBrowsers,
      count(DISTINCT CASE WHEN a.kind IN ('sync','shared-ai') THEN a.identity END) AS accounts,
      count(DISTINCT CASE WHEN a.kind IN ('sync','shared-ai') AND o.identity IS NOT NULL THEN a.identity END) AS ownAccounts,
      count(DISTINCT CASE WHEN a.kind='shared-ai' THEN a.identity END) AS sharedAiAccounts,
      count(DISTINCT CASE WHEN a.kind='shared-ai' AND o.identity IS NOT NULL THEN a.identity END) AS ownSharedAiAccounts
      FROM pt_usage_activity a LEFT JOIN pt_usage_owner o ON o.identity=a.identity
      AND o.kind=CASE WHEN a.kind IN ('universe','nexus') THEN 'browser' ELSE 'account' END AND o.marked_day>=?
      WHERE a.day BETWEEN ? AND ?`).bind(offset(day,-89),start,day).first<Record<string,number>>();
    if (!row) throw Error('usage_unavailable');
    return row;
  };
  const [today,week,first] = await Promise.all([counts(day),counts(offset(day,-6)),db.prepare('SELECT day FROM pt_usage_activity ORDER BY day LIMIT 1').first<{day:string}>()]);
  return {day,since:first?.day??null,today,week};
}

export async function pruneUsage(db: D1Database, now: Date) {
  await ensureSchema(db);
  const day = pacificDate.format(now);
  await db.batch([
    db.prepare('DELETE FROM pt_usage_activity WHERE day<?').bind(offset(day,-13)),
    db.prepare('DELETE FROM pt_tool_activity WHERE day<?').bind(offset(day,-44)),
    db.prepare('DELETE FROM pt_usage_owner WHERE marked_day<?').bind(offset(day,-89)),
  ]);
}
