"""Real in-memory SQLite bridge for D1 SQL/transaction acceptance; no media storage."""
import json
import sqlite3
import sys
from pathlib import Path

db = sqlite3.connect(':memory:', isolation_level=None)
db.row_factory = sqlite3.Row
db.executescript(Path(__file__).with_name('schema.sql').read_text())
for line in sys.stdin:
    request = json.loads(line)
    try:
        operations = request['ops']
        transaction = request.get('batch', False)
        if transaction:
            db.execute('BEGIN')
        results = []
        for i, op in enumerate(operations):
            if request.get('fail_at') == i:
                raise RuntimeError('Injected database failure')
            cur = db.execute(op['sql'], op.get('args', []))
            rows = [dict(row) for row in cur.fetchall()]
            results.append({'results': rows, 'meta': {'changes': max(0, cur.rowcount)}})
        if transaction:
            db.execute('COMMIT')
        result = {'id': request['id'], 'results': results}
    except Exception as exc:
        if db.in_transaction:
            db.execute('ROLLBACK')
        result = {'id': request['id'], 'error': str(exc)}
    print(json.dumps(result), flush=True)
