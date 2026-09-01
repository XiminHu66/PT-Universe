#!/usr/bin/env python3
"""Fetch the curated RSS list into one static JSON file for GitHub Pages."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from time import mktime
from urllib.parse import urljoin, urlparse

import feedparser
import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
USER_AGENT = "PT-Universe-RSS/1.0 (+https://github.com/XiminHu66/PT-Universe)"
MAX_PER_SOURCE = 100


def clean_text(value: str | None, limit: int = 620) -> str:
    if not value:
        return ""
    raw = str(value)
    if "<" in raw and ">" in raw:
        soup = BeautifulSoup(raw, "html.parser")
        for node in soup(["script", "style", "iframe", "form"]):
            node.decompose()
        raw = soup.get_text(" ", strip=True)
    text = re.sub(r"\s+", " ", raw).strip()
    return text[:limit].rstrip() + ("…" if len(text) > limit else "")


def iso_date(entry) -> str:
    for key in ("published_parsed", "updated_parsed", "created_parsed"):
        stamp = entry.get(key)
        if stamp:
            return datetime.fromtimestamp(mktime(stamp), tz=timezone.utc).isoformat().replace("+00:00", "Z")
    for key in ("published", "updated", "created"):
        raw = entry.get(key)
        if not raw:
            continue
        try:
            parsed = parsedate_to_datetime(raw)
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            return parsed.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
        except (TypeError, ValueError, OverflowError):
            pass
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def image_url(entry, base: str) -> str:
    candidates: list[str] = []
    for key in ("media_thumbnail", "media_content"):
        for item in entry.get(key, []) or []:
            if isinstance(item, dict) and item.get("url"):
                candidates.append(item["url"])
    for item in entry.get("enclosures", []) or []:
        if isinstance(item, dict) and str(item.get("type", "")).startswith("image"):
            candidates.append(item.get("href") or item.get("url") or "")
    for value in (entry.get("content", []), [{"value": entry.get("summary", "")}]) :
        for part in value or []:
            html = part.get("value", "") if isinstance(part, dict) else str(part)
            match = re.search(r'<img[^>]+src=["\']([^"\']+)', html, re.I)
            if match:
                candidates.append(match.group(1))
    for candidate in candidates:
        url = urljoin(base, str(candidate).strip())
        if urlparse(url).scheme in {"http", "https"}:
            return url
    return ""


def stable_id(source_id: str, link: str, title: str) -> str:
    return hashlib.sha256(f"{source_id}|{link or title}".encode("utf-8")).hexdigest()[:24]


def fetch_one(source: dict) -> dict:
    result = {"source": source, "items": [], "ok": False, "error": ""}
    try:
        response = requests.get(
            source["url"],
            headers={"User-Agent": USER_AGENT, "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml, */*"},
            timeout=(8, 22),
        )
        response.raise_for_status()
        parsed = feedparser.parse(response.content)
        if parsed.bozo and not parsed.entries:
            raise ValueError(str(parsed.bozo_exception))
        feed_home = parsed.feed.get("link") or source["url"]
        for entry in parsed.entries[:MAX_PER_SOURCE]:
            title = clean_text(entry.get("title"), 220)
            link = str(entry.get("link") or "").strip()
            if not title or not link:
                continue
            summary_raw = entry.get("summary") or entry.get("description") or ""
            if entry.get("content"):
                summary_raw = entry.content[0].get("value") or summary_raw
            result["items"].append(
                {
                    "id": stable_id(source["id"], link, title),
                    "source_id": source["id"],
                    "source": source["name"],
                    "category": source["category"],
                    "title": title,
                    "summary": clean_text(summary_raw),
                    "link": link,
                    "image": image_url(entry, feed_home),
                    "author": clean_text(entry.get("author"), 80),
                    "published_at": iso_date(entry),
                }
            )
        if not result["items"]:
            raise ValueError("feed returned no usable entries")
        result["ok"] = True
    except Exception as exc:  # Each source should fail independently.
        result["error"] = clean_text(str(exc), 180)
    return result


def load_previous(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {"items": []}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", type=Path, default=ROOT / "config" / "feeds.json")
    parser.add_argument("--output", type=Path, default=ROOT / "data" / "feed.json")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    sources = [x for x in json.loads(args.config.read_text(encoding="utf-8")) if x.get("enabled", True)]
    previous = load_previous(args.output)
    previous_by_source: dict[str, list[dict]] = {}
    for item in previous.get("items", []):
        previous_by_source.setdefault(item.get("source_id", ""), []).append(item)

    results = []
    with ThreadPoolExecutor(max_workers=min(8, len(sources) or 1)) as pool:
        futures = [pool.submit(fetch_one, source) for source in sources]
        for future in as_completed(futures):
            results.append(future.result())

    now = datetime.now(timezone.utc)
    items: list[dict] = []
    states: dict[str, dict] = {}
    for result in results:
        source = result["source"]
        current_items = result["items"] if result["ok"] else []
        history_items = previous_by_source.get(source["id"], [])
        merged = {item["id"]: item for item in [*history_items, *current_items] if item.get("id")}
        source_items = sorted(merged.values(), key=lambda item: item.get("published_at", ""), reverse=True)[:MAX_PER_SOURCE]
        items.extend(source_items)
        states[source["id"]] = {
            **source,
            "status": "ok" if result["ok"] else "cached" if source_items else "error",
            "item_count": len(source_items),
            "error": result["error"],
        }

    unique: dict[str, dict] = {}
    for item in items:
        unique[item["id"]] = item

    def stamp(item: dict) -> datetime:
        try:
            return datetime.fromisoformat(item["published_at"].replace("Z", "+00:00"))
        except (KeyError, TypeError, ValueError):
            return now

    fresh = list(unique.values())
    fresh.sort(key=stamp, reverse=True)
    output = {
        "schema": 1,
        "generated_at": now.isoformat().replace("+00:00", "Z"),
        "stats": {
            "source_count": len(sources),
            "healthy_count": sum(1 for state in states.values() if state["status"] == "ok"),
            "cached_count": sum(1 for state in states.values() if state["status"] == "cached"),
            "item_count": len(fresh),
        },
        "sources": [states[source["id"]] for source in sources],
        "items": fresh,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Fetched {output['stats']['item_count']} items from {output['stats']['healthy_count']}/{len(sources)} live sources")


if __name__ == "__main__":
    main()
