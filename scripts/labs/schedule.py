"""Catch delayed/dropped schedules; deduplicate successes using Pacific calendar dates."""
from datetime import datetime, timezone, time
import json
import os
from urllib.request import Request, urlopen
from reliability import PACIFIC, due, parse_time
from refresh import TARGETS, ROOT, data_path, read_data


def pending_targets(now, snapshots, force=False):
    local = now.astimezone(PACIFIC)
    if force:
        return list(TARGETS)
    targets = []
    # Game announcements may arrive overnight: check the lightweight official
    # calendar every four hours while retaining morning-only local/finance jobs.
    upcoming = snapshots.get('upcoming', {})
    last = parse_time(upcoming.get('refresh', {}).get('lastAttemptAt'))
    if not last or (now-last).total_seconds() >= 4*3600 or upcoming.get('refresh', {}).get('state') != 'ok':
        targets.append('upcoming')
    if local.time() >= time(8, 35):
        targets.extend(target for target in TARGETS if target not in ('upcoming', 'financials') and due(snapshots.get(target, {}), now))
    return [target for target in TARGETS if target in targets]


def publication_pending(snapshots, fetch):
    for target, snapshot in snapshots.items():
        try:
            published = fetch(target)
            if published.get("refresh", {}).get("runId") != snapshot.get("refresh", {}).get("runId"):
                return True
            if published.get("updatedAt") != snapshot.get("updatedAt"):
                return True
        except Exception:
            return True
    return False


def main():
    snapshots = {target: read_data(data_path(target)) for target in TARGETS}
    event = os.getenv("EVENT", "schedule")
    force = event != "schedule"
    now = datetime.now(timezone.utc)
    targets = pending_targets(now, snapshots, force)
    if event != 'workflow_dispatch':
        targets = [t for t in targets if t != 'financials']
        snapshots.pop('financials', None)
    else:
        selected = os.getenv('MANUAL_TARGET', 'all') or 'all'
        if selected not in ('all', *TARGETS):
            raise ValueError('Invalid manual dataset')
        if selected != 'all':
            targets = [selected]
            snapshots = {selected: snapshots[selected]}
    def fetch(target):
        path = data_path(target).relative_to(ROOT).as_posix()
        req = Request("https://ximinhu66.github.io/PT-Universe/" + path,
                      headers={"Cache-Control": "no-cache", "User-Agent": "PTUniverseHealth/1.0"})
        with urlopen(req, timeout=15) as response:
            return json.load(response)
    # Also repair an interrupted/failed deployment even if all source fetches succeeded.
    needs_publish = False if targets else publication_pending(snapshots, fetch)
    output = {"run": "yes" if targets or needs_publish else "no",
              "collect": "yes" if targets else "no",
              "matrix": json.dumps({"target": targets}),
              "force": "yes" if force else "no"}
    print(json.dumps(output))
    with open(os.environ["GITHUB_OUTPUT"], "a") as f:
        for key, value in output.items():
            f.write(key + "=" + value + "\n")


if __name__ == "__main__":
    main()
