"""Independent fallback: file timestamps alone cannot prove source chapters are fresh."""
from datetime import datetime
from zoneinfo import ZoneInfo
PACIFIC=ZoneInfo('America/Los_Angeles')
REQUIRED_SITES=('manhuagui','linovelib','copymanga')
def fresh_stamp(stamp, now):
    try:
        checked=datetime.fromisoformat(stamp.replace('Z','+00:00')).astimezone(PACIFIC)
        return checked.date()==now.date() and checked.hour>=8
    except (TypeError,ValueError,AttributeError):return False

def fallback_needed(status, site, now):
    files={x.get('name'):x for x in status.get('files',[])}
    file_fresh=lambda name:fresh_stamp((files.get(name,{}).get('metadata') or {}).get('updatedAt',''),now)
    healthy=file_fresh('site-updates.json') and file_fresh('music.json') and all(
        (s:=site.get('sources',{}).get(source,{})).get('ok') is True
        and not s.get('fallback') and not s.get('degraded')
        and fresh_stamp(s.get('checked_at',''),now)
        for source in REQUIRED_SITES)
    if healthy:return False,'all_sources_verified_today'
    for run in status.get('runs',[]):
        if run.get('scope') not in ('all','sites','music') or run.get('status') not in ('queued','running'):continue
        try:
            started=datetime.fromisoformat(run['started_at'].replace('Z','+00:00')).astimezone(PACIFIC)
            if 0<=(now-started).total_seconds()<600:return False,'bounded_refresh_in_progress'
        except (KeyError,TypeError,ValueError):pass
    return True,'source_missing_failed_or_unverified'
