import { performance } from "node:perf_hooks";
import type { FetchLike } from "./http";

// These measurements describe the process during the batch, including overlapping work.
export function startTaskMeter(fetchImpl: FetchLike) {
  const started = performance.now();
  const cpu = process.cpuUsage();
  let peakRssBytes = process.memoryUsage.rss();
  let requests = 0;
  const sample = () => { peakRssBytes = Math.max(peakRssBytes, process.memoryUsage.rss()); };
  const timer = setInterval(sample, 1000).unref();
  return {
    fetch: ((...args) => {
      requests++;
      return fetchImpl(...args);
    }) satisfies FetchLike,
    finish() {
      clearInterval(timer);
      sample();
      const usage = process.cpuUsage(cpu);
      return {
        durationMs: Math.round(performance.now() - started),
        cpuMs: Math.round((usage.user + usage.system) / 1000),
        peakRssBytes,
        requests,
      };
    },
  };
}
