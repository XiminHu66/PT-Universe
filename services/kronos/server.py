"""One bounded on-demand inference process, independent of the stock collector."""
import json
import os
import subprocess
import sys
import threading
import time
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

import pandas as pd
from market import CALENDAR, SYMBOLS

JOB_SECONDS = 420
RETRY_SECONDS = 900


def completed_session(now):
    instant = pd.Timestamp(now)
    date = instant.tz_convert("America/New_York").normalize().tz_localize(None)
    session = CALENDAR.date_to_session(date, direction="previous")
    if instant < CALENDAR.session_close(session) + pd.Timedelta(minutes=20):
        session = CALENDAR.previous_session(session)
    return session.date().isoformat()


def host_has_room():
    values = {}
    for line in Path('/proc/meminfo').read_text().splitlines():
        key, value = line.split(':', 1)
        if key in ('MemTotal', 'MemAvailable'):
            values[key] = int(value.split()[0])
    return values['MemAvailable'] - 3 * 1024 * 1024 >= values['MemTotal'] * 0.15


class JobStore:
    def __init__(self, root):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)
        self.lock = threading.Lock()
        self.active = None

    def read(self, name):
        path = self.root / (name + ".json")
        try:
            if path.stat().st_size < 128_000:
                return json.loads(path.read_text())
        except (OSError, ValueError):
            pass
        return {}

    def write(self, name, value):
        temp = self.root / (name + ".tmp")
        temp.write_text(json.dumps(value, allow_nan=False))
        temp.replace(self.root / (name + ".json"))

    def work(self, symbol, session):
        output = self.root / "pending.json"
        try:
            output.unlink(missing_ok=True)
            subprocess.run(
                [sys.executable, str(Path(__file__).with_name("forecast.py")), symbol, session, str(output)],
                check=True, timeout=JOB_SECONDS, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            )
            value = json.loads(output.read_text())
            if value.get("symbol") != symbol or value.get("asOf") != session or len(value.get("paths", ())) != 4:
                raise ValueError("Bad result")
            with self.lock:
                self.write(symbol, value)
        except (OSError, ValueError, subprocess.SubprocessError) as error:
            print("Kronos inference failed:", type(error).__name__, flush=True)
        finally:
            output.unlink(missing_ok=True)
            with self.lock:
                self.active = None

    def request(self, symbol, start):
        now = time.time()
        session = completed_session(datetime.fromtimestamp(now, timezone.utc))
        with self.lock:
            snapshot = self.read(symbol)
            attempt = self.read("attempt-" + symbol)
            attempts = attempt.get("count", 0) if attempt.get("session") == session else 0
            state = "fresh" if snapshot.get("asOf") == session else "stale" if snapshot else "empty"
            error = None
            if self.active == symbol:
                state = "running"
            elif start and state != "fresh":
                if self.active:
                    state, error = "busy", "另一标的正在推理，请稍后再试"
                elif attempts >= 2 or (attempts and now - attempt["at"] < RETRY_SECONDS):
                    state, error = "limited", "当前交易日的推理额度或重试间隔已用尽"
                elif not host_has_room():
                    state, error = "busy", "VPS 当前可用内存不足，保留上次结果"
                else:
                    self.write("attempt-" + symbol, {"session": session, "count": attempts + 1, "at": now})
                    self.active, state = symbol, "running"
                    threading.Thread(target=self.work, args=(symbol, session), daemon=True).start()
            elif attempts and state != "fresh":
                error = "上次推理未完成，可稍后手动重试"
            return {"state": state, "session": session, "data": snapshot or None, "error": error}


def handler(store):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass

        def do_GET(self):
            self.respond(False)

        def do_POST(self):
            self.respond(True)

        def respond(self, start):
            url = urlsplit(self.path)
            params = parse_qs(url.query, keep_blank_values=True)
            symbol = params.get("symbol", [""])[0]
            if url.path == "/health" and not start:
                code, value = 200, {"ok": True}
            elif (url.path == "/kronos" and set(params) == {"symbol"} and len(params["symbol"]) == 1
                  and symbol in SYMBOLS and len(self.path) < 64 and not self.headers.get("Transfer-Encoding")
                  and self.headers.get("Content-Length", "0") == "0"):
                code, value = 200, store.request(symbol, start)
            else:
                code, value = 400, {"error": "Invalid Kronos request"}
            raw = json.dumps(value, ensure_ascii=False, allow_nan=False).encode()
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)
    return Handler


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", 8080), handler(JobStore(os.getenv("PT_KRONOS_DATA", "/data/results")))).serve_forever()
