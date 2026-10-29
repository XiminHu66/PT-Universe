"""One bounded daily run; keep last-good data if all upstream sources fail."""
from pathlib import Path
from datetime import datetime,timezone
import json,os,shutil,subprocess,sys,tempfile
sys.path.insert(0,'/source/scripts/tsugi')
from refresh_policy import game_decision,REQUIRED
OUT=Path('/data')
def read(path):
    try:return json.loads(path.read_text())
    except (OSError,ValueError):return {}
def atomic(path,data):
    temp=path.with_suffix(path.suffix+'.tmp');temp.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n');temp.replace(path)
def validated(snapshot,now):
    try:age=(now-datetime.fromisoformat(snapshot['generated_at'].replace('Z','+00:00'))).total_seconds()
    except (ValueError,KeyError):raise RuntimeError('Missing collection timestamp')
    if not -300<=age<=900:raise RuntimeError('Collector output is stale')
    count=sum(len(snapshot.get('items',{}).get(k,[])) for k in ('mobile','pc','console'))
    good=[k for k in REQUIRED if snapshot.get('sources',{}).get(k,{}).get('ok') and not snapshot['sources'][k].get('fallback')]
    if not count or not good:raise RuntimeError('No newly verified source; last-good snapshot retained')
    return {'items':count,'fresh_sources':good,'failed_sources':[k for k in REQUIRED if k not in good]}
def main():
    old=read(OUT/'game-releases.json');force=os.environ.get('PT_GAME_FORCE')=='1'
    decision,reason=game_decision(old,datetime.now(timezone.utc),'manual' if force else 'schedule')
    if not decision:
        print('VPS_GAME_LIVE '+json.dumps({'skipped':True,'reason':reason,'generated_at':old.get('generated_at')}));return
    with tempfile.TemporaryDirectory(prefix='game-collector-') as tmp:
        root=Path(tmp);shutil.copytree('/source/apps/tsugi-checker',root/'apps/tsugi-checker')
        data=root/'apps/tsugi-checker/data'
        for name in ('game-releases.json','game-state.json'):
            if (OUT/name).exists():shutil.copyfile(OUT/name,data/name)
        result=subprocess.run([sys.executable,str(root/'apps/tsugi-checker/scraper/run_games.py')],timeout=360)
        if result.returncode:raise RuntimeError('Game scraper process failed')
        snapshot=read(data/'game-releases.json');status=validated(snapshot,datetime.now(timezone.utc))
        snapshot['refresh_source']='vps:08:00-primary'
        atomic(OUT/'game-releases.json',snapshot);atomic(OUT/'game-state.json',read(data/'game-state.json'))
        status.update({'success':not status['failed_sources'],'generated_at':snapshot['generated_at'],'checked_at':datetime.now(timezone.utc).isoformat()})
        atomic(OUT/'game-status.json',status);print('VPS_GAME_LIVE '+json.dumps(status))
        if status['failed_sources']:raise SystemExit(1)
if __name__=='__main__':
    try:main()
    except Exception as error:
        OUT.mkdir(parents=True,exist_ok=True)
        atomic(OUT/'game-status.json',{'success':False,'checked_at':datetime.now(timezone.utc).isoformat(),'error':str(error)})
        raise
