"""Independently checkpoint each dataset; retry failed sources without discarding good data."""
from pathlib import Path
from datetime import datetime, timezone
import argparse
import importlib
import json
import os
import time
from reliability import MAX_AGE_HOURS, failed_sources, successful_today

ROOT = Path(__file__).resolve().parents[2]
TARGETS = {
    "financials": ("thesis-lab", "financials.json", "companies"),
    "games": ("game-deals", "deals.json", "games"),
    "events": ("eastside-weekend", "events.json", "events"),
}


def data_path(target, root=ROOT):
    app, filename, _ = TARGETS[target]
    return root / "apps" / app / "data" / filename


def read_data(path):
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError):
        return {}


def write_data(path, data):
    payload = json.dumps(data, ensure_ascii=False, indent=2, allow_nan=False) + "\n"
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    temporary.write_text(payload)
    temporary.replace(path)


def refresh_target(target, config, path, attempts=3, force=False, collector=None,
                   clock=lambda: datetime.now(timezone.utc), sleep=time.sleep):
    key = TARGETS[target][2]
    collector = collector or importlib.import_module(target).collect
    data = read_data(path)
    for attempt in range(1, attempts + 1):
        now = clock()
        now_text = now.isoformat()
        old = data
        selected_config = dict(config)
        known = [s for s in old.get("sources", []) if not s.get("optional")]
        if known and all(s.get("id") for s in known) and not (force and attempt == 1):
            selected_config["_onlySources"] = [s["id"] for s in known
                if not s.get("ok") or not successful_today(s.get("lastSuccessAt"), now)]
        try:
            candidate = collector(selected_config, old, now_text)
            if not isinstance(candidate.get(key), list) or not candidate[key]:
                raise ValueError("No usable records returned; keeping last snapshot")
            if not any(not s.get("optional") for s in candidate.get("sources", [])):
                raise ValueError("Missing required source health")
            json.dumps(candidate, allow_nan=False)
            data = candidate
        except Exception as exc:
            error = type(exc).__name__ + ": " + str(exc)[:240]
            data = {**old, key: old.get(key, []), "attemptedAt": now_text}
            affected = selected_config.get("_onlySources")
            sources = []
            for s in old.get("sources", []):
                if not s.get("optional") and (affected is None or s.get("id") in affected):
                    s = {**s, "ok": False, "checkedAt": now_text, "error": error,
                         "lastSuccessAt": s.get("lastSuccessAt") or (old.get("updatedAt") if s.get("ok") else None)}
                sources.append(s)
            if not sources:
                sources = [{"id": target, "name": target, "ok": False,
                            "checkedAt": now_text, "lastSuccessAt": None, "error": error}]
            data["sources"] = sources
            print("COLLECTOR FAILED", target, error, flush=True)
        failed = failed_sources(data)
        complete = not failed and bool(data.get(key))
        previous_health = old.get("refresh", {})
        data["refresh"] = {
            "state": "ok" if complete else "partial" if any(s.get("ok") and not s.get("optional") for s in data["sources"]) else "error",
            "lastAttemptAt": now_text,
            "lastCompleteAt": now_text if complete else previous_health.get("lastCompleteAt"),
            "failedSources": [s.get("id", s.get("name")) for s in failed],
            "attempts": attempt,
            "maxAgeHours": MAX_AGE_HOURS,
            "runId": os.getenv("GITHUB_RUN_ID", now_text),
        }
        write_data(path, data)
        print("RESULT", target, len(data.get(key, [])), data["refresh"]["state"], "attempt", attempt, flush=True)
        if complete:
            break
        if attempt < attempts:
            sleep((20, 60)[min(attempt - 1, 1)])
    summary = os.getenv("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a") as f:
            f.write(f"\n### {target}: {data['refresh']['state']}\n\n")
            f.write(f"{len(data.get(key, []))} records, {attempt} attempt(s).\n\n")
            for s in data.get("sources", []):
                f.write(f"- {s.get('name')}: {'OK' if s.get('ok') else 'FAILED'}; last success: {s.get('lastSuccessAt') or 'never'}\n")
    return data, complete


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--target", choices=list(TARGETS))
    parser.add_argument("--attempts", type=int, default=3)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    config = json.loads((Path(__file__).parent / "config.json").read_text())
    failed = []
    for target in [args.target] if args.target else TARGETS:
        _, complete = refresh_target(target, config, data_path(target),
                                     max(1, min(args.attempts, 3)), args.force)
        if not complete:
            failed.append(target)
    if failed:
        raise SystemExit("Incomplete sources (snapshots saved for independent publication): " + ", ".join(failed))


if __name__ == "__main__":
    main()
