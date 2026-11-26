import assert from "node:assert/strict";
import { test } from "node:test";
import { openDatabase, useDatabase } from "../src/lib/db";
import { runRefresh, resetRefreshLockForTests } from "../src/lib/refresh";
import { taskActivity } from "../src/lib/task-ledger";
import { listSources } from "../src/lib/sources";

test("each executed refresh is recorded by trigger and double clicks do not create another row", async () => {
  useDatabase(openDatabase(":memory:"));
  resetRefreshLockForTests();
  process.env.DEALS_SNAPSHOT_DIR = "off";
  const fetchImpl = async () => new Response("unavailable", { status: 503 });
  try {
    const pending = runRefresh({ trigger: "manual", cooldownMs: 60_000, fetchImpl });
    await assert.rejects(runRefresh({ trigger: "manual", fetchImpl }), {code:"BUSY"});
    await pending;
    await assert.rejects(runRefresh({ trigger: "manual", fetchImpl }), {code:"COOLDOWN"});
    await runRefresh({ trigger: "schedule", fetchImpl });
    const data = taskActivity();
    assert.equal(data.recent.length, 2);
    assert.equal(data.week.manual?.executions, 1);
    assert.equal(data.month.schedule?.executions, 1);
    for (const row of data.recent) {
      assert.equal(row.status, "failed");
      assert.equal(row.totalSources, listSources().length);
      assert.equal(row.okSources, 0);
      assert.ok(Number(row.requests) > 0);
      assert.ok(Number(row.peakRssBytes) > 0);
      assert.ok(Number(row.roundId) > 0);
    }
  } finally {
    useDatabase(null);
  }
});
