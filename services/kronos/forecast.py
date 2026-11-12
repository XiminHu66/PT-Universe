"""Generate reproducible, independent Kronos Base scenarios from completed sessions."""
import json
import sys
from zlib import crc32
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
import torch
from market import BARS, HORIZON, PRICE, SYMBOL, HistoryError, calendar_name, exchange_calendar, fetch, prepare_history
from model import Kronos, KronosPredictor, KronosTokenizer

MODEL_REVISION = "2b554741eca47781b64468546e77fef3e85130e6"
TOKENIZER_REVISION = "0e0117387f39004a9016484a186a908917e22426"
SAMPLE_COUNT = 4


def generate(symbol, cutoff):
    torch.set_num_threads(1)
    torch.set_num_interop_threads(1)
    calendar = exchange_calendar(symbol)
    raw, currency = fetch(symbol, cutoff - pd.Timedelta(days=450), cutoff)
    bars = prepare_history(raw, calendar, cutoff)
    history = bars[BARS].copy()
    ratio = bars.adjclose / bars.close
    history[PRICE] = history[PRICE].mul(ratio / ratio.iloc[-1], axis=0)
    future = calendar.sessions_window(cutoff, HORIZON + 1)[1:]
    tokenizer = KronosTokenizer.from_pretrained("NeoQuasar/Kronos-Tokenizer-base", revision=TOKENIZER_REVISION).eval()
    model = Kronos.from_pretrained("NeoQuasar/Kronos-base", revision=MODEL_REVISION).eval()
    predictor = KronosPredictor(model, tokenizer, device="cpu", max_context=512)
    paths = []
    for sample in range(SAMPLE_COUNT):
        torch.manual_seed(crc32(symbol.encode()) * SAMPLE_COUNT + sample)
        prediction = predictor.predict(
            history, pd.Series(history.index), pd.Series(future), HORIZON,
            sample_count=1, top_p=0.9, verbose=False,
        )
        paths.append(prediction["close"].to_numpy(dtype=float))
    values = np.asarray(paths)
    if values.shape != (SAMPLE_COUNT, HORIZON) or not np.isfinite(values).all() or (values <= 0).any():
        raise ValueError("Invalid model output")
    reference = float(history.close.iloc[-1])
    return {
        "symbol": symbol,
        "asOf": cutoff.date().isoformat(),
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "model": "Kronos Base",
        "modelRevision": MODEL_REVISION,
        "source": "Yahoo Finance · 完整日线",
        "lookback": len(history),
        "calendar": calendar_name(symbol),
        "currency": currency,
        "reference": reference,
        "dates": [day.date().isoformat() for day in future],
        "paths": np.round(values, 4).tolist(),
        "up": int((values[:, -1] > reference).sum()),
        "down": int((values[:, -1] < reference).sum()),
        "endMedian": float(np.median(values[:, -1])),
        "endLow": float(values[:, -1].min()),
        "endHigh": float(values[:, -1].max()),
    }


if __name__ == "__main__":
    ticker, date, destination = sys.argv[1:]
    if not SYMBOL.fullmatch(ticker):
        raise ValueError("Invalid symbol")
    try:
        result = generate(ticker, pd.Timestamp(date))
    except HistoryError as error:
        result = {"error": str(error)}
    Path(destination).write_text(json.dumps(result, allow_nan=False))
