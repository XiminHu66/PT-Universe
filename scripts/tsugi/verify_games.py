"""Import one pinned game snapshot, then poll its Cloudflare queue task."""
import argparse
import json
import re
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

API = 'https://pt-universe-api.summer07-nanjolno.workers.dev'

def request(path, method='GET'):
    req = urllib.request.Request(API + path, method=method, headers={
        'User-Agent': 'PT-Universe-game-import/2',
        'Cache-Control': 'no-cache',
    })
    with urllib.request.urlopen(req, timeout=20) as response:
        return json.load(response)

def valid_snapshot(served, expected, commit):
    actual = served.get('generated_at', '')
    wanted = expected.get('generated_at', '')
    if not actual or actual < wanted:
        return False, 'served snapshot is older than the committed version'
    if actual == wanted and served.get('import_commit_sha') != commit:
        return False, 'expected GitHub commit has not been imported'
    parsed = datetime.fromisoformat(actual.replace('Z', '+00:00'))
    age = (datetime.now(timezone.utc) - parsed).total_seconds()
    if not -300 <= age <= 7200:
        return False, 'served snapshot timestamp is not recent'
    count = sum(len(served.get('items', {}).get(k, [])) for k in ('mobile', 'pc', 'console'))
    if not count:
        return False, 'served snapshot has no game items'
    return True, {'generated_at': actual, 'items': count, 'import_commit_sha': served.get('import_commit_sha')}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--commit', required=True)
    args = parser.parse_args()
    commit = args.commit.strip().lower()
    if not re.fullmatch(r'[a-f0-9]{40}', commit):
        parser.error('--commit must be a 40-character Git commit SHA')
    expected = json.loads(Path('apps/tsugi-checker/data/game-releases.json').read_text(encoding='utf-8'))
    submitted = request('/api/refresh/games?commit=' + commit, 'POST')
    request_id = submitted.get('requestId')
    if not request_id or not re.fullmatch(r'[0-9a-fA-F-]{36}', request_id):
        raise RuntimeError('Cloudflare did not acknowledge a game import task: ' + str(submitted))
    print('Import queued', request_id, 'commit', commit, 'reused', submitted.get('reused', False), flush=True)
    for attempt in range(32):
        task = request('/api/refresh/status/' + request_id)
        state = task.get('status', '')
        if state in ('success', 'partial', 'failed', 'skipped'):
            served = request('/api/data/game-releases.json?verify=' + str(time.time_ns()))
            valid, result = valid_snapshot(served, expected, commit)
            if valid:
                print(json.dumps({'verified': True, 'task_status': state, **result}, ensure_ascii=False), flush=True)
                return
            raise RuntimeError('Cloudflare task ' + state + ': ' + str(result) + '; error=' + str(task.get('error')))
        if state not in ('queued', 'running'):
            raise RuntimeError('Unexpected Cloudflare import state: ' + str(task))
        time.sleep(3)
    raise RuntimeError('Cloudflare game import timed out without completion')

if __name__ == '__main__':
    main()
