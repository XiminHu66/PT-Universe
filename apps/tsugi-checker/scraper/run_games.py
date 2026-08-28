from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from game_enrich import main as enrich_games
from games import refresh_games
from steam_pc import main as refresh_steam_pc

ROOT = Path(__file__).resolve().parents[1]
CONTENT = ROOT / "config/content.json"
GAME_FEED = ROOT / "data/game-releases.json"
GAME_STATE = ROOT / "data/game-state.json"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36 TsugiUpdateChecker/1.0"


def now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def record_optional_failure(stage: str, exc: Exception) -> None:
    """Keep the core refresh usable when an optional enrichment stage is unavailable."""
    payload = json.loads(GAME_FEED.read_text("utf-8"))
    payload.setdefault("sources", {})[stage] = {
        "label": "Steam 浏览器补充" if stage == "steam_browser" else "游戏元数据补充",
        "ok": False,
        "fallback": True,
        "checked_at": payload.get("generated_at"),
        "error": f"{type(exc).__name__}: {exc}",
    }
    GAME_FEED.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", "utf-8")


def main() -> None:
    content = json.loads(CONTENT.read_text("utf-8"))
    refresh_games(content, now(), GAME_FEED, GAME_STATE, UA)

    try:
        refresh_steam_pc()
    except Exception as exc:
        print(f"STEAMPC STAGE WARN: {type(exc).__name__}: {exc}")
        record_optional_failure("steam_browser", exc)

    try:
        enrich_games()
    except Exception as exc:
        print(f"GAME ENRICH STAGE WARN: {type(exc).__name__}: {exc}")
        record_optional_failure("metadata_enrichment", exc)

    payload = json.loads(GAME_FEED.read_text("utf-8"))
    counts = {key: len(value or []) for key, value in (payload.get("items") or {}).items()}
    if not sum(counts.values()):
        raise RuntimeError("game refresh produced no items and no last-good fallback")
    print(f"GAME REFRESH COMPLETE generated_at={payload.get('generated_at')} counts={counts}")


if __name__ == "__main__":
    main()
