import { getDb } from "./db";
import type { startTaskMeter } from "./task-meter";

const dayMs = 86_400_000;
const retentionDays = 45;
type Measurement = ReturnType<ReturnType<typeof startTaskMeter>["finish"]>;
type Task = Measurement & {
  roundId: number | null;
  startedAt: number;
  trigger: "manual" | "schedule";
  status: "success" | "partial" | "failed";
  okSources: number;
  totalSources: number;
};

export function saveTask(task: Task) {
  const db = getDb();
  db.prepare("INSERT OR IGNORE INTO task_ledger_meta (id, since) VALUES (1, ?)").run(task.startedAt);
  db.prepare(`INSERT INTO task_ledger
    (round_id, started_at, trigger, status, duration_ms, cpu_ms, peak_rss_bytes, requests, ok_sources, total_sources)
    VALUES(?,?,?,?,?,?,?,?,?,?)`).run(task.roundId, task.startedAt, task.trigger, task.status, task.durationMs,
      task.cpuMs, task.peakRssBytes, task.requests, task.okSources, task.totalSources);
  db.prepare("DELETE FROM task_ledger WHERE started_at < ?").run(task.startedAt - retentionDays * dayMs);
}

export function taskActivity(now = Date.now()) {
  const db = getDb();
  const since = db.prepare("SELECT since FROM task_ledger_meta WHERE id = 1").get()?.since ?? null;
  const counts = (days: number) => {
    const rows = db.prepare(`SELECT trigger, count(*) AS executions, sum(cpu_ms) AS cpuMs,
      sum(requests) AS requests, max(peak_rss_bytes) AS peakRssBytes, sum(duration_ms) AS durationMs,
      sum(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed
      FROM task_ledger WHERE started_at >= ? GROUP BY trigger`).all(now - days * dayMs);
    return { manual: rows.find(row => row.trigger === "manual") ?? null, schedule: rows.find(row => row.trigger === "schedule") ?? null };
  };
  const recent = db.prepare(`SELECT id, round_id AS roundId, started_at AS startedAt, trigger, status,
    duration_ms AS durationMs, cpu_ms AS cpuMs, peak_rss_bytes AS peakRssBytes,
    requests, ok_sources AS okSources, total_sources AS totalSources
    FROM task_ledger WHERE started_at >= ? ORDER BY started_at DESC, id DESC LIMIT 30`).all(now - retentionDays * dayMs);
  return { since, observedAt: now, week: counts(7), month: counts(30), recent };
}
