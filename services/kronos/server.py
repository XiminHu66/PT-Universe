"""Durable, bounded queue for one Kronos inference subprocess at a time."""
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

from market import SYMBOL, HistoryError, calendar_name, completed_session

JOB_SECONDS = 420
RETRY_SECONDS = 900
MAX_DAILY = 180
CACHE_DAYS = 45
MAX_CACHE_FILES = 2048


def host_has_room():
    values = {}
    for line in Path('/proc/meminfo').read_text().splitlines():
        key, value = line.split(':', 1)
        if key in ('MemTotal', 'MemAvailable'):
            values[key] = int(value.split()[0])
    return values['MemAvailable'] - 3 * 1024 * 1024 >= values['MemTotal'] * 0.15


class JobStore:
    def __init__(self, root, clock=time.time, room=host_has_room, autostart=True):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)
        self.clock, self.room = clock, room
        self.condition = threading.Condition()
        self.active = None
        self.queue = list(dict.fromkeys(symbol for symbol in self.read('queue').get('symbols', [])
                                        if isinstance(symbol, str) and SYMBOL.fullmatch(symbol)))[:MAX_DAILY]
        if autostart:
            threading.Thread(target=self.process, daemon=True).start()

    def read(self, name):
        path = self.root / (name + '.json')
        try:
            if path.stat().st_size < 128_000:
                value = json.loads(path.read_text())
                if isinstance(value, dict):
                    return value
        except (OSError, ValueError):
            pass
        return {}

    def write(self, name, value):
        temp = self.root / (name + '.tmp')
        temp.write_text(json.dumps(value, allow_nan=False))
        temp.replace(self.root / (name + '.json'))

    def budget(self, now):
        day = now.date().isoformat()
        saved = self.read('budget')
        return saved if saved.get('day') == day else {'day': day, 'count': 0}

    def save_queue(self):
        self.write('queue', {'symbols': self.queue})

    def attempt(self, symbol, session):
        value = self.read('attempt-' + symbol)
        return value if value.get('session') == session else {}

    def prune(self):
        protected = {'queue', 'budget', *self.queue}
        protected.update('attempt-' + symbol for symbol in self.queue)
        cutoff = self.clock() - CACHE_DAYS * 86400
        files = sorted((p for p in self.root.glob('*.json') if p.stem not in protected),
                       key=lambda p: p.stat().st_mtime, reverse=True)
        for index, path in enumerate(files):
            if index >= MAX_CACHE_FILES or path.stat().st_mtime < cutoff:
                path.unlink(missing_ok=True)

    def work(self, symbol, session, attempt):
        output = self.root / 'pending.json'
        error = None
        try:
            output.unlink(missing_ok=True)
            subprocess.run(
                [sys.executable, str(Path(__file__).with_name('forecast.py')), symbol, session, str(output)],
                check=True, timeout=JOB_SECONDS, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            )
            value = json.loads(output.read_text())
            if value.get('error'):
                error = value['error']
            elif value.get('symbol') != symbol or value.get('asOf') != session or len(value.get('paths', ())) != 4:
                raise ValueError('Bad result')
            else:
                with self.condition:
                    self.write(symbol, value)
        except (OSError, ValueError, subprocess.SubprocessError) as exc:
            print('Kronos inference failed:', type(exc).__name__, flush=True)
            error = '推理暂未完成，可稍后重试'
        finally:
            output.unlink(missing_ok=True)
            with self.condition:
                if error:
                    self.write('attempt-' + symbol, {**attempt, 'error': error})
                self.active = None

    def next_job(self):
        # Caller holds the condition. Leave pending jobs intact during resource pressure.
        if not self.queue or not self.room():
            return None
        now = datetime.fromtimestamp(self.clock(), timezone.utc)
        budget = self.budget(now)
        if budget['count'] >= MAX_DAILY:
            return None
        if not budget['count']:
            self.prune()
        while self.queue:
            symbol = self.queue.pop(0)
            self.save_queue()
            try:
                session = completed_session(symbol, now).isoformat()
            except (HistoryError, ValueError):
                continue
            if self.read(symbol).get('asOf') == session:
                continue
            attempt = self.attempt(symbol, session)
            self.write('budget', {**budget, 'count': budget['count'] + 1})
            attempt = {'session': session, 'count': attempt.get('count', 0) + 1, 'at': now.timestamp()}
            self.write('attempt-' + symbol, attempt)
            self.active = symbol
            return symbol, session, attempt
        return None

    def process(self):
        while True:
            try:
                with self.condition:
                    job = self.next_job()
                    if job is None:
                        self.condition.wait(timeout=30 if self.queue else None)
                        continue
                self.work(*job)
            except (OSError, ValueError, KeyError) as error:
                print('Kronos queue temporarily unavailable:', type(error).__name__, flush=True)
                with self.condition:
                    self.active = None
                    self.condition.wait(timeout=30)

    def request(self, symbol, start):
        now = datetime.fromtimestamp(self.clock(), timezone.utc)
        try:
            session = completed_session(symbol, now).isoformat()
        except (HistoryError, ValueError):
            return {'state': 'unavailable', 'data': None, 'error': '该市场的交易日历暂不可用'}
        with self.condition:
            snapshot = self.read(symbol)
            attempt = self.attempt(symbol, session)
            state = 'fresh' if snapshot.get('asOf') == session else 'stale' if snapshot else 'empty'
            error, queue_position = None, None
            if self.active == symbol:
                state = 'running'
            elif symbol in self.queue:
                state = 'queued'
                queue_position = self.queue.index(symbol) + 1
            elif state != 'fresh':
                count = attempt.get('count', 0)
                error = attempt.get('error') or ('上次推理未完成，可稍后重试' if count else None)
                if start:
                    if count >= 2 or (count and now.timestamp() - attempt['at'] < RETRY_SECONDS):
                        state = 'limited'
                        error = error or '当前交易日的重试间隔尚未结束'
                    elif self.budget(now)['count'] + len(self.queue) >= MAX_DAILY:
                        state, error = 'limited', '今日推理队列已满，可稍后重试'
                    else:
                        self.queue.append(symbol)
                        self.save_queue()
                        state, queue_position, error = 'queued', len(self.queue), None
                        self.condition.notify()
                elif count:
                    state = 'error'
            if state == 'queued' and not self.room():
                error = 'VPS 可用内存达到保留线，队列将在有余量时继续'
            return {'state': state, 'session': session, 'calendar': calendar_name(symbol),
                    'data': snapshot or None, 'error': error, 'queuePosition': queue_position}


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
            symbol = params.get('symbol', [''])[0]
            if url.path == '/health' and not start:
                code, value = 200, {'ok': True}
            elif (url.path == '/kronos' and set(params) == {'symbol'} and len(params['symbol']) == 1
                  and SYMBOL.fullmatch(symbol) and len(self.path) < 64 and not self.headers.get('Transfer-Encoding')
                  and self.headers.get('Content-Length', '0') == '0'):
                code, value = 200, store.request(symbol, start)
            else:
                code, value = 400, {'error': 'Invalid Kronos request'}
            raw = json.dumps(value, ensure_ascii=False, allow_nan=False).encode()
            self.send_response(code)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Content-Length', str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)
    return Handler


if __name__ == '__main__':
    ThreadingHTTPServer(('0.0.0.0', 8080), handler(JobStore(os.getenv('PT_KRONOS_DATA', '/data/results')))).serve_forever()
