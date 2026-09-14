"""Small production check on every data deployment, including scheduled runs."""
import json
import os
import time
from urllib.request import Request, urlopen
from refresh import TARGETS, ROOT, data_path, read_data
BASE = 'https://ximinhu66.github.io/PT-Universe/'

def get(path):
    req = Request(BASE + path + '?verify=' + os.getenv('GITHUB_RUN_ID', str(time.time())),
                  headers={'Cache-Control': 'no-cache', 'User-Agent': 'PTUniverseHealth/1.0'})
    with urlopen(req, timeout=25) as response:
        assert response.status == 200, path
        return response.read().decode()

def verify():
    for app in ('thesis-lab', 'earnings-dojo', 'game-deals', 'eastside-weekend'):
        html = get('apps/' + app + '/')
        assert 'id="app"' in html and 'id="health"' in html, app
    for target, (_, _, key) in TARGETS.items():
        path = data_path(target)
        live = json.loads(get(path.relative_to(ROOT).as_posix()))
        expected = read_data(path)
        assert isinstance(live[key], list), target
        assert live.get('refresh', {}).get('runId') == expected.get('refresh', {}).get('runId'), target + ' publication version mismatch'
        assert live.get('updatedAt') == expected.get('updatedAt'), target + ' snapshot mismatch'
    print('PUBLICATION CHECK PASSED: four pages and three independent snapshots')

for attempt in range(3):
    try:
        verify()
        break
    except Exception:
        if attempt == 2:
            raise
        time.sleep(15)
