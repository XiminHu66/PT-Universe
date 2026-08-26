#!/usr/bin/env python3
"""Refresh public QF Tool data with no private credentials."""

from __future__ import annotations

import csv
import io
import json
import math
import re
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "data" / "dashboard.json"
USER_AGENT = "QF-Tool/1.0 contact: https://github.com/XiminHu66/QF-tool"


def fetch_text(url: str, timeout: int = 18) -> str:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "*/*"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read().decode("utf-8", errors="replace")


def load_current() -> dict:
    try:
        return json.loads(DATA_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {"quotes": [], "deals": [], "opportunities": [], "macro": {}}


def latest_numeric(rows: list[dict], field: str = "VALUE") -> float | None:
    for row in reversed(rows):
        value = (row.get(field) or "").strip()
        if value and value != ".":
            try:
                return float(value)
            except ValueError:
                pass
    return None


def fred_series(series_id: str) -> list[dict]:
    text = fetch_text(f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={series_id}")
    return list(csv.DictReader(io.StringIO(text)))


def refresh_macro(current: dict) -> dict:
    macro = dict(current.get("macro") or {})
    try:
        macro["fedFunds"] = round(latest_numeric(fred_series("DFF")) or macro.get("fedFunds", 0), 2)
    except Exception as exc:
        print(f"FRED DFF unavailable: {exc}")
    try:
        macro["treasury10y"] = round(latest_numeric(fred_series("DGS10")) or macro.get("treasury10y", 0), 2)
    except Exception as exc:
        print(f"FRED DGS10 unavailable: {exc}")
    try:
        values = [float(row["CPIAUCSL"]) for row in fred_series("CPIAUCSL") if row.get("CPIAUCSL") not in (None, "", ".")]
        if len(values) >= 13:
            macro["inflation"] = round((values[-1] / values[-13] - 1) * 100, 1)
    except Exception as exc:
        print(f"FRED CPI unavailable: {exc}")
    return macro


def stooq_quote(symbol: str) -> tuple[float, float] | None:
    end = datetime.now(timezone.utc).date()
    start = end - timedelta(days=24)
    stooq = symbol.lower().replace(".", "-") + ".us"
    params = urllib.parse.urlencode({"s": stooq, "d1": start.strftime("%Y%m%d"), "d2": end.strftime("%Y%m%d"), "i": "d"})
    rows = list(csv.DictReader(io.StringIO(fetch_text(f"https://stooq.com/q/d/l/?{params}"))))
    closes = [float(row["Close"]) for row in rows if row.get("Close") not in (None, "", "N/D")]
    if not closes:
        return None
    change = (closes[-1] / closes[-2] - 1) * 100 if len(closes) > 1 else 0.0
    return round(closes[-1], 2), round(change, 2)


def refresh_quotes(current: dict) -> list[dict]:
    targets = {item.get("symbol"): item.get("target") for item in current.get("quotes", [])}
    symbols = ["NVDA", "AMD", "AVGO", "SMH", "QQQ", "SPY", "IWM"]
    quotes = []
    for symbol in symbols:
        try:
            quote = stooq_quote(symbol)
            if quote:
                price, change = quote
                quotes.append({"symbol": symbol, "price": price, "change": change, "target": targets.get(symbol) or round(price * 1.25, 2)})
        except Exception as exc:
            print(f"Stooq {symbol} unavailable: {exc}")
    return quotes or current.get("quotes", [])


INTEREST_WORDS = {
    "laptop", "monitor", "headphone", "earbud", "ssd", "storage", "anker", "usb", "charger",
    "keyboard", "mouse", "router", "nas", "camera", "gaming", "steam", "kitchen", "air fryer",
    "vacuum", "home", "desk", "tool", "amazon", "best buy", "costco", "m5stack", "mini pc",
}


def refresh_deals(current: dict) -> list[dict]:
    feeds = [
        ("Slickdeals", "https://slickdeals.net/newsearch.php?mode=frontpage&searcharea=deals&searchin=first&rss=1"),
        ("DealNews", "https://www.dealnews.com/?rss=1"),
    ]
    collected = []
    seen = set()
    for source, url in feeds:
        try:
            root = ET.fromstring(fetch_text(url))
            for item in root.findall(".//item"):
                title = (item.findtext("title") or "").strip()
                link = (item.findtext("link") or "").strip()
                if not title or title.lower() in seen:
                    continue
                if not any(word in title.lower() for word in INTEREST_WORDS):
                    continue
                seen.add(title.lower())
                price_match = re.search(r"\$\s?([\d,]+(?:\.\d{1,2})?)", title)
                percent_match = re.search(r"(\d{1,2})%\s*(?:off|discount)", title, re.I)
                price = f"${price_match.group(1)}" if price_match else "查看价格"
                discount = int(percent_match.group(1)) if percent_match else 0
                collected.append({
                    "title": title[:180], "price": price, "originalPrice": "购买前核价", "discount": discount,
                    "source": source, "url": link, "note": "社区热度收录；购买前请核对历史价格、库存和退货条件。",
                })
                if len(collected) >= 6:
                    return collected
        except Exception as exc:
            print(f"Deal feed {source} unavailable: {exc}")
    return collected if len(collected) >= 2 else current.get("deals", [])


def refresh_opportunities(current: dict) -> list[dict]:
    since = int((datetime.now(timezone.utc) - timedelta(days=10)).timestamp())
    queries = ["looking for", "alternative", "wish there was", "too expensive"]
    hits = []
    seen = set()
    for query in queries:
        try:
            params = urllib.parse.urlencode({"query": query, "tags": "story", "numericFilters": f"created_at_i>{since}", "hitsPerPage": 20})
            payload = json.loads(fetch_text(f"https://hn.algolia.com/api/v1/search_by_date?{params}"))
            for hit in payload.get("hits", []):
                title = (hit.get("title") or "").strip()
                if not title or title.lower() in seen:
                    continue
                seen.add(title.lower())
                points = int(hit.get("points") or 0)
                comments = int(hit.get("num_comments") or 0)
                score = min(95, round(62 + 4 * math.log1p(points) + 3 * math.log1p(comments)))
                object_id = hit.get("objectID")
                url = hit.get("url") or (f"https://news.ycombinator.com/item?id={object_id}" if object_id else "https://news.ycombinator.com/")
                hits.append({
                    "title": title[:160], "source": "Hacker News 需求信号", "score": score,
                    "signal": f"{points} points · {comments} comments；关键词：{query}",
                    "angle": "先验证重复痛点，再用轻量网页、数据报告或自动化工具切入。", "url": url,
                })
        except Exception as exc:
            print(f"HN query unavailable: {exc}")
    hits.sort(key=lambda item: item["score"], reverse=True)
    return hits[:6] if len(hits) >= 3 else current.get("opportunities", [])


def market_mode(quotes: list[dict], macro: dict) -> str:
    changes = [float(item.get("change", 0)) for item in quotes]
    average = sum(changes) / len(changes) if changes else 0
    if average <= -1.5:
        return "下跌压力上升 · 等待确认"
    if average >= 1.5 and macro.get("fedFunds", 0) < 4:
        return "风险偏好回升 · 仍需检查估值"
    if average >= .5:
        return "震荡偏强 · 不追高"
    return "顶部震荡 · 等待更好赔率"


def main() -> None:
    current = load_current()
    quotes = refresh_quotes(current)
    macro = refresh_macro(current)
    result = {
        "updatedAt": datetime.now(ZoneInfo("America/Los_Angeles")).isoformat(timespec="seconds"),
        "marketMode": market_mode(quotes, macro),
        "quotes": quotes,
        "deals": refresh_deals(current),
        "opportunities": refresh_opportunities(current),
        "macro": macro,
    }
    DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
    DATA_PATH.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Updated {DATA_PATH}")


if __name__ == "__main__":
    main()
