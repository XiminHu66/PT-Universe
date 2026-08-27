from __future__ import annotations

import hashlib
import json
import re
import time
from urllib.parse import quote_plus, urljoin

import requests
from bs4 import BeautifulSoup

BILLBOARD_URL = "https://www.billboard-japan.com/charts/detail?a=hot100"
APPLE_NEW_URL = "https://music.apple.com/jp/new"
YOUTUBE_JAPAN_WEEKLY_URL = "https://kworb.net/youtube/insights/jp.html"


def _get(url, ua, timeout=30):
    r = requests.get(
        url,
        headers={
            "User-Agent": ua,
            "Accept-Language": "ja-JP,ja;q=0.95,en;q=0.65",
        },
        timeout=timeout,
    )
    r.raise_for_status()
    return r


def clean(value):
    return re.sub(r"\s+", " ", str(value or "")).strip()


def youtube_music_url(title: str, artist: str) -> str:
    return f"https://music.youtube.com/search?q={quote_plus(clean(f'{title} {artist}'))}"


def apple_music_search_url(title: str, artist: str) -> str:
    return f"https://music.apple.com/jp/search?term={quote_plus(clean(f'{title} {artist}'))}"


def fetch_billboard_hot100(ua, limit=30):
    r = _get(BILLBOARD_URL, ua)
    soup = BeautifulSoup(r.text, "lxml")
    text = " ".join(soup.stripped_strings)
    m = re.search(r"(20\d{2}/\d{1,2}/\d{1,2})\s*公開", text)
    chart_date = m.group(1) if m else ""
    rows = []
    for i, cell in enumerate(soup.select("td.name_td"), start=1):
        title_el = cell.select_one("p.musuc_title")
        artist_el = cell.select_one("p.artist_name")
        title = clean(title_el.get_text(" ")) if title_el else ""
        artist = clean(artist_el.get_text(" ")) if artist_el else ""
        if not title or not artist:
            continue
        tr = cell.find_parent("tr")
        context = " ".join(tr.stripped_strings) if tr else ""
        last_m = re.search(r"前回[：:]\s*([0-9]+|-)", context)
        weeks_m = re.search(r"チャートイン[：:]\s*([0-9]+)", context)
        img = tr.select_one("img") if tr else None
        artwork = None
        if img:
            artwork = img.get("data-src") or img.get("data-original") or img.get("src")
            if artwork:
                artwork = urljoin(BILLBOARD_URL, artwork)
        link = None
        a = title_el.find_parent("a") if title_el else None
        if not a and cell:
            a = cell.select_one("a[href]")
        if a and a.get("href"):
            link = urljoin(BILLBOARD_URL, a.get("href"))
        last_rank = last_m.group(1) if last_m else ""
        weeks = int(weeks_m.group(1)) if weeks_m else None
        rows.append({
            "rank": i,
            "last_rank": last_rank,
            "weeks": weeks,
            "is_new": bool(last_rank == "-" or weeks == 1),
            "title": title,
            "artist": artist,
            "artwork": artwork,
            "url": link or BILLBOARD_URL,
            "youtube_music_url": youtube_music_url(title, artist),
        })
        if len(rows) >= int(limit):
            break
    if not rows:
        raise RuntimeError("Billboard JAPAN Hot 100 parser returned no rows")
    return rows, chart_date


def _closest_music_card(anchor):
    for parent in anchor.parents:
        if getattr(parent, "name", None) not in ("li", "article", "div"):
            continue
        text = clean(parent.get_text(" "))
        artists = parent.select('a[href*="/artist/"]') if hasattr(parent, "select") else []
        if 2 <= len(text) <= 500 and artists:
            return parent
    return anchor.parent


def _image_from(card, base):
    if not card or not hasattr(card, "select_one"):
        return ""
    img = card.select_one("img")
    if not img:
        return ""
    src = img.get("src") or img.get("data-src") or img.get("data-original") or ""
    if not src or src.startswith("data:"):
        return ""
    return urljoin(base, src)


def fetch_apple_weekly_new_songs(ua, limit=30):
    """Read Apple Music Japan's curated 'Best New Songs' block.

    Apple retired/changed several old RSS endpoints. The public Japan New page is
    server-rendered and exposes a stable weekly 'ベストニューソング' section, which
    is a better fit for a rolling recent-song panel than the old empty RSS feed.
    """
    r = _get(APPLE_NEW_URL, ua)
    soup = BeautifulSoup(r.text, "lxml")
    heading = None
    for h in soup.find_all(["h2", "h3"]):
        if re.search(r"ベストニューソング|Best New Songs", clean(h.get_text(" ")), re.I):
            heading = h
            break
    if not heading:
        marker = soup.find(string=re.compile(r"ベストニューソング|Best New Songs", re.I))
        heading = marker.parent if marker else None
    if not heading:
        raise RuntimeError("Apple Music Best New Songs heading not found")

    anchors = []
    for node in heading.find_all_next():
        if node is heading:
            continue
        if getattr(node, "name", None) in ("h2", "h3"):
            break
        if getattr(node, "name", None) == "a" and node.get("href"):
            anchors.append(node)

    rows = []
    seen = set()
    for a in anchors:
        href = urljoin(APPLE_NEW_URL, a.get("href") or "")
        # Song links can be /song/... or album links with a track id (?i=...).
        if not ("/song/" in href or ("/album/" in href and ("?i=" in href or "&i=" in href))):
            continue
        title = clean(a.get("aria-label") or a.get("title") or a.get_text(" "))
        if not title or len(title) > 180:
            continue
        card = _closest_music_card(a)
        artist_links = card.select('a[href*="/artist/"]') if card and hasattr(card, "select") else []
        artists = []
        for artist_link in artist_links:
            name = clean(artist_link.get_text(" "))
            if name and name not in artists:
                artists.append(name)
        artist = "、".join(artists[:3])
        if not artist:
            continue
        key = (title.casefold(), artist.casefold())
        if key in seen:
            continue
        seen.add(key)
        rows.append({
            "id": hashlib.sha1(f"apple-weekly|{title}|{artist}".encode("utf-8")).hexdigest()[:16],
            "title": title,
            "artist": artist,
            "artist_id": "",
            "album": "",
            "release_date": "",
            "period": "近一周",
            "artwork": _image_from(card, APPLE_NEW_URL),
            "url": href,
            "youtube_music_url": youtube_music_url(title, artist),
            "source": "apple_music_weekly_new",
            "source_label": "Apple Music Japan · 本周新曲",
        })
        if len(rows) >= int(limit):
            break
    if not rows:
        raise RuntimeError("Apple Music Best New Songs parser returned no rows")
    return rows


def chart_debut_fallback(weekly, limit=30):
    """Never leave the recent-song panel empty: use this week's Hot 100 debuts."""
    out = []
    for row in weekly:
        if not (row.get("is_new") or row.get("last_rank") == "-" or row.get("weeks") == 1):
            continue
        title = row.get("title") or ""
        artist = row.get("artist") or ""
        if not title or not artist:
            continue
        out.append({
            "id": hashlib.sha1(f"billboard-debut|{title}|{artist}".encode("utf-8")).hexdigest()[:16],
            "title": title,
            "artist": artist,
            "artist_id": "",
            "album": "",
            "release_date": "",
            "period": "本周新进榜",
            "artwork": row.get("artwork") or "",
            "url": row.get("url") or BILLBOARD_URL,
            "youtube_music_url": row.get("youtube_music_url") or youtube_music_url(title, artist),
            "source": "billboard_debut",
            "source_label": "Billboard JAPAN · 本周新进榜",
        })
        if len(out) >= int(limit):
            break
    return out


def fetch_youtube_japan_recent_chart(ua, limit=30, max_weeks=8):
    """Return a structured recent-song chart from YouTube Japan weekly data.

    Apply an eight-week freshness rule to the public YouTube Japan chart so the
    UI shows songs, ranks and movement rather than links to chart videos.
    """
    r = _get(YOUTUBE_JAPAN_WEEKLY_URL, ua)
    r.encoding = "utf-8"
    soup = BeautifulSoup(r.text, "lxml")
    heading = clean(soup.select_one(".pagetitle").get_text(" ")) if soup.select_one(".pagetitle") else ""
    date_match = re.search(r"Week ending\s+(20\d{2}/\d{1,2}/\d{1,2})", heading, re.I)
    chart_date = date_match.group(1) if date_match else ""
    rows = []
    for tr in soup.select("#weeklytable tbody tr"):
        cells = tr.select("td")
        if len(cells) < 7:
            continue
        try:
            rank = int(clean(cells[0].get_text(" ")))
            weeks = int(clean(cells[3].get_text(" ")))
            peak = int(clean(cells[4].get_text(" ")))
        except (TypeError, ValueError):
            continue
        if weeks > max(1, int(max_weeks)):
            continue
        track = clean(cells[2].get_text(" "))
        artist, separator, title = track.partition(" - ")
        if not separator or not clean(artist) or not clean(title):
            artist, title = "", track
        movement = clean(cells[1].get_text(" "))
        streams = clean(cells[6].get_text(" "))
        streams_change = clean(cells[7].get_text(" ")) if len(cells) > 7 else ""
        rows.append({
            "id": hashlib.sha1(f"youtube-japan|{artist}|{title}".encode("utf-8")).hexdigest()[:16],
            "rank": rank,
            "rank_change": movement,
            "is_new": movement.upper() == "NEW" or weeks == 1,
            "title": clean(title),
            "artist": clean(artist) or "YouTube Japan",
            "weeks": weeks,
            "peak": peak,
            "streams": streams,
            "streams_change": streams_change,
            "url": f"https://www.youtube.com/results?search_query={quote_plus(track)}",
            "youtube_music_url": youtube_music_url(title, artist),
            "source": "youtube_japan_recent",
            "source_label": "YouTube Japan Weekly · 8 周内",
        })
        if len(rows) >= int(limit):
            break
    if not rows:
        raise RuntimeError("YouTube Japan weekly chart returned no songs within the freshness window")
    return rows, chart_date


def _music_match_key(value):
    return re.sub(r"[\W_]+", "", clean(value).casefold(), flags=re.UNICODE)


def _large_itunes_artwork(url):
    return re.sub(r"/\d+x\d+bb\.", "/300x300bb.", clean(url))


def fetch_itunes_artwork(title, artist, ua):
    query = clean(f"{title} {artist}")
    url = (
        "https://itunes.apple.com/search"
        f"?term={quote_plus(query)}&country=jp&media=music&entity=song&limit=5&lang=ja_jp"
    )
    data = _get(url, ua, timeout=20).json()
    target_title = _music_match_key(title)
    target_artist = _music_match_key(artist)
    best = None
    best_score = 0
    for result in data.get("results") or []:
        result_title = _music_match_key(result.get("trackName"))
        result_artist = _music_match_key(result.get("artistName"))
        score = 0
        if result_title == target_title:
            score += 8
        elif target_title and result_title and (target_title in result_title or result_title in target_title):
            score += 5
        if result_artist == target_artist:
            score += 4
        elif target_artist and result_artist and (target_artist in result_artist or result_artist in target_artist):
            score += 2
        if score > best_score:
            best, best_score = result, score
    if not best or best_score < 5:
        return None
    artwork = _large_itunes_artwork(best.get("artworkUrl100") or best.get("artworkUrl60"))
    if not artwork:
        return None
    return {"artwork": artwork, "apple_music_url": clean(best.get("trackViewUrl"))}


def enrich_recent_chart_artwork(rows, weekly, previous_rows, ua, lookup_limit=12):
    """Reuse known covers first, then gently query Apple's no-token search API."""
    weekly_by_pair = {
        (_music_match_key(row.get("title")), _music_match_key(row.get("artist"))): row
        for row in weekly
    }
    weekly_by_title = {_music_match_key(row.get("title")): row for row in weekly}
    previous_by_id = {clean(row.get("id")): row for row in previous_rows if row.get("id")}
    unresolved = []
    for row in rows:
        pair = (_music_match_key(row.get("title")), _music_match_key(row.get("artist")))
        previous = previous_by_id.get(clean(row.get("id"))) or {}
        known = weekly_by_pair.get(pair) or weekly_by_title.get(pair[0]) or previous
        if known and known.get("artwork"):
            row["artwork"] = known["artwork"]
            row["artwork_checked"] = True
            if known.get("apple_music_url"):
                row["apple_music_url"] = known["apple_music_url"]
        elif previous.get("artwork_checked"):
            row["artwork"] = ""
            row["artwork_checked"] = True
        else:
            row["artwork"] = ""
            row["artwork_checked"] = False
            unresolved.append(row)

    targets = unresolved[:max(0, int(lookup_limit))]
    for index, row in enumerate(targets):
        try:
            match = fetch_itunes_artwork(row.get("title"), row.get("artist"), ua)
            if match:
                row.update(match)
        except Exception as error:
            print(f"MUSIC WARN artwork {row.get('artist')} - {row.get('title')}: {error}")
        row["artwork_checked"] = True
        if index < len(targets) - 1:
            # Apple's public Search API documents an approximate 20 calls/minute limit.
            time.sleep(3.1)
    return rows


def refresh_music(content_cfg, generated, out_path, ua):
    cfg = content_cfg.get("music") or {}
    weekly = []
    recent_songs = []
    recent_chart = []
    statuses = {}
    chart_date = ""
    try:
        previous_music = json.loads(out_path.read_text("utf-8")) if out_path.exists() else {}
    except Exception:
        previous_music = {}

    try:
        weekly, chart_date = fetch_billboard_hot100(ua, cfg.get("weekly_limit", 30))
        statuses["billboard_japan"] = {
            "label": "Billboard JAPAN Hot 100",
            "ok": True,
            "count": len(weekly),
            "checked_at": generated,
        }
        print(f"MUSIC billboard_japan: {len(weekly)} items")
    except Exception as e:
        statuses["billboard_japan"] = {
            "label": "Billboard JAPAN Hot 100",
            "ok": False,
            "count": 0,
            "checked_at": generated,
            "error": f"{type(e).__name__}: {e}",
        }
        print(f"MUSIC ERR billboard_japan: {e}")

    try:
        recent_songs = fetch_apple_weekly_new_songs(ua, cfg.get("recent_song_limit", cfg.get("new_release_limit", 30)))
        statuses["apple_music_weekly_new"] = {
            "label": "Apple Music Japan · 本周新曲",
            "ok": True,
            "count": len(recent_songs),
            "checked_at": generated,
            "endpoint": APPLE_NEW_URL,
        }
        print(f"MUSIC apple_music_weekly_new: {len(recent_songs)} items")
    except Exception as e:
        recent_songs = chart_debut_fallback(weekly, cfg.get("recent_song_limit", 30))
        statuses["apple_music_weekly_new"] = {
            "label": "Apple Music Japan · 本周新曲",
            "ok": bool(recent_songs),
            "count": len(recent_songs),
            "checked_at": generated,
            "fallback": "Billboard JAPAN Hot 100 本周新进榜" if recent_songs else "",
            "error": f"{type(e).__name__}: {e}",
        }
        print(f"MUSIC WARN apple_music_weekly_new: {e}; fallback={len(recent_songs)}")

    try:
        recent_chart, recent_chart_date = fetch_youtube_japan_recent_chart(
            ua,
            cfg.get("recent_chart_limit", 30),
            cfg.get("recent_chart_max_weeks", 8),
        )
        recent_chart = enrich_recent_chart_artwork(
            recent_chart,
            weekly,
            previous_music.get("recent_chart") or [],
            ua,
            cfg.get("recent_chart_cover_lookup_limit", 12),
        )
        statuses["youtube_japan_recent"] = {
            "label": "YouTube Japan · 近期热门榜",
            "ok": True,
            "count": len(recent_chart),
            "cover_count": sum(bool(row.get("artwork")) for row in recent_chart),
            "checked_at": generated,
            "chart_date": recent_chart_date,
            "endpoint": YOUTUBE_JAPAN_WEEKLY_URL,
        }
        print(f"MUSIC youtube_japan_recent: {len(recent_chart)} items")
    except Exception as e:
        statuses["youtube_japan_recent"] = {
            "label": "YouTube Japan · 近期热门榜",
            "ok": False,
            "count": 0,
            "checked_at": generated,
            "error": f"{type(e).__name__}: {e}",
        }
        print(f"MUSIC ERR youtube_japan_recent: {e}")

    out_path.write_text(
        json.dumps(
            {
                "generated_at": generated,
                "chart_date": chart_date,
                "weekly_chart": weekly,
                # Keep the old key for front-end/backward compatibility; semantics are now recent songs.
                "new_releases": recent_songs,
                "recent_songs": recent_songs,
                "recent_chart": recent_chart,
                "sources": statuses,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        "utf-8",
    )
