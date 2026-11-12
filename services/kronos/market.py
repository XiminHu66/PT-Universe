"""Fetch completed US daily bars and validate a common session calendar."""
import json
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

import exchange_calendars as calendars
import numpy as np
import pandas as pd

SYMBOLS = ("QQQ", "NVDA", "AMD", "GOOGL", "SMH")
CALENDAR = calendars.get_calendar("XNYS")
PRICE = ["open", "high", "low", "close"]
BARS = PRICE + ["volume"]


def fetch(symbol, start, cutoff):
    query = urlencode({
        "period1": int(start.tz_localize("UTC").timestamp()),
        "period2": int((cutoff + pd.Timedelta(days=2)).tz_localize("UTC").timestamp()),
        "interval": "1d",
    })
    failures = []
    for host in ("query1.finance.yahoo.com", "query2.finance.yahoo.com"):
        url = f"https://{host}/v8/finance/chart/{symbol}?{query}"
        try:
            request = Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urlopen(request, timeout=15) as response:
                result = json.load(response)["chart"]["result"][0]
            dates = pd.to_datetime(result["timestamp"], unit="s", utc=True)
            dates = dates.tz_convert("America/New_York").tz_localize(None).normalize()
            indicators = result["indicators"]
            frame = pd.DataFrame(indicators["quote"][0], index=dates)[BARS]
            frame["adjclose"] = indicators["adjclose"][0]["adjclose"]
            return frame.loc[start:cutoff]
        except (HTTPError, URLError, TimeoutError, ValueError, KeyError, TypeError) as error:
            failures.append(f"{host}: {error}")
            time.sleep(1)
    raise RuntimeError(f"{symbol} download failed: {'; '.join(failures)}")


def validate(frame, sessions, symbol):
    if frame.index.has_duplicates:
        raise ValueError(f"{symbol}: duplicate session dates")
    frame = frame.reindex(sessions)
    if not np.isfinite(frame.to_numpy()).all():
        raise ValueError(f"{symbol}: missing or invalid completed daily bars")
    if (frame[PRICE + ["adjclose"]] <= 0).any().any() or (frame["volume"] <= 0).any():
        raise ValueError(f"{symbol}: nonpositive price or volume")
    if (frame["high"] < frame[["open", "close", "low"]].max(axis=1)).any():
        raise ValueError(f"{symbol}: high below another price")
    if (frame["low"] > frame[["open", "close", "high"]].min(axis=1)).any():
        raise ValueError(f"{symbol}: low above another price")
    return frame

