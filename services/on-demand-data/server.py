"""Bounded single-job HTTP cache. No scheduler, credentials, browser or public port."""
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import threading
import time
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit, parse_qs

ROOT = Path(__file__).resolve().parents[2]
POLICY = {'3c': (3600, 240, 12), 'disclosures': (3600, 300, 12), 'stock': (300, 150, 160)}
MAX_BYTES = 8 * 1024 * 1024

def validate(dataset, symbol=''):
    if dataset not in POLICY or (dataset == 'stock' and not re.fullmatch(r'\^?[A-Z][A-Z0-9.=-]{0,14}', symbol)) or (dataset != 'stock' and symbol):
        raise ValueError('Invalid dataset or symbol')
    return dataset + ('-' + symbol.replace('^', '_') if symbol else '')

def run_collector(dataset, symbol, previous):
    with tempfile.TemporaryDirectory(prefix='pt-on-demand-') as folder:
        p = Path(folder)
        (p / 'previous.json').write_text(json.dumps(previous))
        env = {**os.environ, 'HOME': folder, 'XDG_CACHE_HOME': folder, 'OPENBLAS_NUM_THREADS': '1', 'OMP_NUM_THREADS': '1'}
        # Separate process bounds collector lifetime and resets module-level NOW.
        result = subprocess.run([sys.executable, str(ROOT / 'services/on-demand-data/collector.py'), dataset, symbol, folder],
                                env=env, cwd=folder, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=POLICY[dataset][1])
        if result.returncode or not (p / 'result.json').exists():
            raise RuntimeError('上游暂不可用，保留上次成功数据')
        raw = (p / 'result.json').read_bytes()
        if len(raw) > MAX_BYTES:
            raise ValueError('Result too large')
        return json.loads(raw)

class Store:
    def __init__(self, directory, collector=run_collector, clock=time.time):
        self.directory = Path(directory)
        self.directory.mkdir(parents=True, exist_ok=True)
        self.collector, self.clock = collector, clock
        self.lock = threading.RLock()
        self.active = None
        self.errors = {}

    def read(self, key):
        try:
            raw = (self.directory / (key + '.json')).read_bytes()
            return json.loads(raw) if len(raw) <= MAX_BYTES else {}
        except (OSError, ValueError):
            return {}

    def write(self, key, value):
        temporary = self.directory / (key + '.tmp')
        raw = json.dumps(value, ensure_ascii=False, allow_nan=False)
        if len(raw.encode()) > MAX_BYTES:
            raise ValueError('Result too large')
        # Public cache cannot grow indefinitely as custom symbols accumulate.
        if key != 'budget':
            files = sorted((p for p in self.directory.glob('*.json') if p.stem not in {key, 'budget', self.active}), key=lambda p: p.stat().st_mtime)
            total = sum(p.stat().st_size for p in files)
            while files and (len(files) >= 255 or total + len(raw.encode()) > 128 * 1024 * 1024):
                oldest = files.pop(0)
                total -= oldest.stat().st_size
                oldest.unlink()
        temporary.write_text(raw)
        temporary.replace(self.directory / (key + '.json'))

    def seed(self, dataset, symbol):
        paths = {'3c': 'apps/3c-scout/data/products.json', 'disclosures': 'apps/investment-desk/data/public-trades.json', 'stock': 'apps/stock-alert/data/market.json'}
        value = json.loads((ROOT / paths[dataset]).read_text())
        return value.get('symbols', {}).get(symbol, {}) if dataset == 'stock' else value

    def request(self, dataset, symbol='', start=False, force=False):
        key = validate(dataset, symbol)
        with self.lock:
            record = self.read(key)
            age = self.clock() - record.get('at', 0)
            ttl = 60 if force else POLICY[dataset][0]
            state = 'fresh' if record and age < POLICY[dataset][0] else 'stale'
            error = self.errors.get(key)
            if self.active == key:
                state = 'running'
            elif start and age >= ttl:
                if self.active:
                    state, error = 'busy', '另一个数据更新正在进行，请稍后刷新'
                else:
                    day = datetime.fromtimestamp(self.clock(), timezone.utc).date().isoformat()
                    budget = self.read('budget')
                    if budget.get('day') != day:
                        budget = {'day': day, 'counts': {}}
                    count = budget['counts'].get(dataset, 0)
                    last = record.get('attemptAt', 0)
                    if count >= POLICY[dataset][2] or self.clock() - last < 60:
                        state, error = 'limited', '已合并近期刷新；请稍后重试（每天有采集上限）'
                    else:
                        budget['counts'][dataset] = count + 1
                        self.write('budget', budget)
                        record['attemptAt'] = self.clock()
                        self.write(key, record)
                        self.active, state = key, 'running'
                        threading.Thread(target=self.work, args=(key, dataset, symbol), daemon=True).start()
            elif error:
                state = 'error'
            data = record.get('data')
            if not data:
                data = self.seed(dataset, symbol)
            return {'dataset': dataset, 'symbol': symbol, 'state': state, 'data': data,
                    'updatedAt': datetime.fromtimestamp(record['at'], timezone.utc).isoformat() if record.get('at') else None,
                    'error': error, 'retryAfter': 5 if state == 'running' else 60,
                    'refreshMode': 'on-demand', 'cacheSeconds': POLICY[dataset][0]}

    def work(self, key, dataset, symbol):
        try:
            previous = self.read(key).get('data') or self.seed(dataset, symbol)
            result = self.collector(dataset, symbol, previous)
            with self.lock:
                self.write(key, {'at': self.clock(), 'attemptAt': self.clock(), 'data': result})
                self.errors.pop(key, None)
        except Exception:
            with self.lock:
                self.errors[key] = '本次采集失败，已保留上次成功数据；请稍后手动重试'
        finally:
            with self.lock:
                self.active = None

def handler(store):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass

        def do_GET(self):
            self.respond(False)

        def do_POST(self):
            self.respond(True)

        def respond(self, start):
            try:
                url = urlsplit(self.path)
                if url.path == '/health' and not start:
                    body = {'ok': True, 'mode': 'on-demand', 'active': bool(store.active)}
                else:
                    query = parse_qs(url.query)
                    if set(query) - {'symbol', 'force'} or len(self.path) > 120 or self.headers.get('Transfer-Encoding') or int(self.headers.get('Content-Length', '0')) > 0:
                        raise ValueError('Invalid request')
                    body = store.request(url.path.removeprefix('/'), query.get('symbol', [''])[0], start, query.get('force', [''])[0] == '1')
                raw = json.dumps(body, ensure_ascii=False, allow_nan=False).encode()
                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Cache-Control', 'no-store')
                self.send_header('Content-Length', str(len(raw)))
                self.end_headers()
                self.wfile.write(raw)
            except (ValueError, KeyError):
                self.send_error(400, 'Invalid public dataset request')
    return Handler

if __name__ == '__main__':
    ThreadingHTTPServer(('0.0.0.0', 8080), handler(Store(os.getenv('PT_DATA', '/data')))).serve_forever()
