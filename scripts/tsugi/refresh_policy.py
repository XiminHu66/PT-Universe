"""Idempotent daily games collection, including legitimate delayed cron starts."""
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
from pathlib import Path
import json, os
PACIFIC=ZoneInfo('America/Los_Angeles')
REQUIRED=('appstore','googleplay','taptap_cn_new','taptap_cn_upcoming','steam_popular_new','steam_popular_upcoming','famitsu')
def fresh(value,now):
    try:
        d=datetime.fromisoformat(value.replace('Z','+00:00')).astimezone(PACIFIC)
        return d.date()==now.astimezone(PACIFIC).date() and d.hour>=8 and d<=now.astimezone(PACIFIC)
    except (TypeError,ValueError,AttributeError):return False
def game_decision(snapshot,now,event='schedule'):
    if event!='schedule':return True,'explicit_refresh'
    if now.astimezone(PACIFIC).hour<8:return False,'before_daily_window'
    sources=snapshot.get('sources',{})
    healthy=fresh(snapshot.get('generated_at'),now) and all(
        (s:=sources.get(key,{})).get('ok') is True and not s.get('fallback')
        and fresh(s.get('checked_at'),now) for key in REQUIRED)
    has_items=any(snapshot.get('items',{}).get(k) for k in ('mobile','pc','console'))
    return (False,'verified_today') if healthy and has_items else (True,'missing_stale_or_partial')
def main():
    file=Path('apps/tsugi-checker/data/game-releases.json')
    try:data=json.loads(file.read_text())
    except (OSError,ValueError):data={}
    run,reason=game_decision(data,datetime.now(timezone.utc),os.environ.get('REFRESH_EVENT','schedule'))
    output=f'refresh={str(run).lower()}\nreason={reason}\n'
    with open(os.environ['GITHUB_OUTPUT'],'a') as f:f.write(output)
    print(output)
if __name__=='__main__':main()
