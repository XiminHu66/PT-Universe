"""Fixed public collectors; invoked only by an explicit page request, never cron."""
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import sys
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[2]

def module(name, path):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    obj = importlib.util.module_from_spec(spec)
    sys.modules[name] = obj
    spec.loader.exec_module(obj)
    return obj

def collect(dataset, symbol, previous, workspace):
    now = datetime.now(timezone.utc)
    output = workspace / 'snapshot.json'
    output.write_text(json.dumps(previous))
    if dataset == '3c':
        obj = module('products', 'apps/3c-scout/scripts/fetch_products.py')
        obj.OUTPUT, obj.NOW = output, now
        result = obj.run()
        if not result.get('items') or not any(s.get('ok') for s in result.get('sources', [])):
            raise ValueError('No healthy product sources')
        return result
    if dataset == 'disclosures':
        obj = module('disclosures', 'scripts/investment/refresh.py')
        obj.OUT, obj.NOW = output, now.isoformat()
        obj.main()
        return json.loads(output.read_text())
    if dataset == 'stock':
        obj = module('market', 'apps/stock-alert/scripts/fetch_market.py')
        item = obj.symbol_snapshot(symbol, obj.SYMBOLS.get(symbol, (symbol, symbol, '')), previous)
        if not item.get('history') or item.get('price') is None:
            raise ValueError('No fresh market history')
        item.update(fetchedAt=now.isoformat(), source='Yahoo Finance · VPS on demand')
        return item
    raise ValueError('Unsupported dataset')

if __name__ == '__main__':
    # Dataset/symbol were validated by the parent; no user URL or code is accepted.
    workspace = Path(sys.argv[3])
    previous = json.loads((workspace / 'previous.json').read_text())
    with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
        result = collect(sys.argv[1], sys.argv[2], previous, workspace)
    (workspace / 'result.json').write_text(json.dumps(result, ensure_ascii=False, allow_nan=False))
