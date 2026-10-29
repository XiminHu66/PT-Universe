"""Verify the served source version, not merely a green pipeline or HTTP 200."""
import json,os,time,urllib.request
from datetime import datetime,timezone
from pathlib import Path
API='https://pt-universe-api.summer07-nanjolno.workers.dev'
expected=json.loads(Path('apps/tsugi-checker/data/game-releases.json').read_text())
def request(path,method='GET'):
    r=urllib.request.Request(API+path,method=method,headers={'User-Agent':'PT-Universe-game-verification/1','Cache-Control':'no-cache'})
    with urllib.request.urlopen(r,timeout=25) as response:return json.load(response)
last=None
for attempt in range(8):
    try:
        request('/api/refresh/games','POST')
        served=request('/api/data/game-releases.json?verify='+str(time.time_ns()))
        if isinstance(served,str):served=json.loads(served)
        actual=served.get('generated_at','')
        if actual>=expected['generated_at']:
            now=datetime.now(timezone.utc);age=(now-datetime.fromisoformat(actual.replace('Z','+00:00'))).total_seconds()
            if not -300<=age<=7200:raise RuntimeError('Served game snapshot is stale')
            count=sum(len(served.get('items',{}).get(k,[])) for k in ('mobile','pc','console'))
            if not count:raise RuntimeError('Served game snapshot is empty')
            good=[k for k,v in served.get('sources',{}).items() if v.get('ok') and not v.get('fallback')]
            if not good:raise RuntimeError('No source was actually refreshed')
            print(json.dumps({'verified':True,'generated_at':actual,'items':count,'fresh_sources':good}))
            break
        last='Served snapshot has not reached the committed version'
    except Exception as error:last=str(error)
    if attempt==7:raise SystemExit(last)
    time.sleep(8)
