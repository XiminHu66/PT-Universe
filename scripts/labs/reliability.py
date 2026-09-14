"""Shared source health and daily freshness rules (no network dependencies)."""
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

PACIFIC = ZoneInfo("America/Los_Angeles")
MAX_AGE_HOURS = 36


def parse_time(value):
    try:
        result = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return result if result.tzinfo else result.replace(tzinfo=timezone.utc)
    except (AttributeError, TypeError, ValueError):
        return None


def source(old, sid, name, url, now, ok, count=0, error=None, optional=False):
    previous = next((s for s in old.get("sources", [])
                     if s.get("id") == sid or s.get("name") == name), {})
    last = previous.get("lastSuccessAt")
    if not last and previous.get("ok"):
        last = old.get("updatedAt")
    return {"id": sid, "name": name, "url": url, "ok": ok, "count": count,
            "checkedAt": now, "lastSuccessAt": now if ok else last,
            "error": error if not ok else None, "optional": optional}


def cached_source(old, sid):
    return next((dict(s) for s in old.get("sources", []) if s.get("id") == sid), None)


def selected(config, sid):
    return "_onlySources" not in config or sid in config["_onlySources"]


def successful_today(value, now):
    parsed = parse_time(value)
    return bool(parsed and parsed.astimezone(PACIFIC).date() == now.astimezone(PACIFIC).date()
                and parsed <= now)


def due(data, now):
    return (data.get("refresh", {}).get("state") != "ok" or
            not successful_today(data.get("refresh", {}).get("lastCompleteAt"), now))


def failed_sources(data):
    return [s for s in data.get("sources", []) if not s.get("optional") and not s.get("ok")]
