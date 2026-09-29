"""Daily metadata snapshots; keep last good chart data on an upstream failure."""
import concurrent.futures, datetime, json, os, sys, urllib.error, urllib.request
from pathlib import Path
from zoneinfo import ZoneInfo
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'apps/media-vault/data/snapshot.json'
COUNTRIES=('jp','us','cn','tw','hk','kr','gb')
GENRES=('0','14','21','18','17','27','51','2')
API='https://pt-universe-api.summer07-nanjolno.workers.dev/api/media/'
def fetch(url):
    req=urllib.request.Request(url,headers={'User-Agent':'PT-Universe-MediaVault/1.0'})
    with urllib.request.urlopen(req,timeout=35) as r:return json.load(r)
def chart(pair):
    country,genre=pair;key=country+'-'+genre
    url=f'https://itunes.apple.com/{country}/rss/topsongs/limit=50/'+('' if genre=='0' else f'genre={genre}/')+'json'
    try:
        if country in ('cn','kr'):
            url=f'https://rss.marketingtools.apple.com/api/v2/{country}/music/most-played/100/songs.json'
            d=fetch(url)['feed'];items=[]
            for i,x in enumerate(d.get('results',[])):
                if genre!='0' and not any(g['genreId']==genre for g in x.get('genres',[])):continue
                items.append({'id':x['id'],'rank':i+1,'title':x['name'],'artist':x['artistName'],'artwork':x['artworkUrl100'],'url':x['url'],'preview':None})
            return key,{'country':country,'genre':genre,'source':'Apple Music 热播榜'+('' if genre=='0' else ' · 总榜内曲风筛选'),'sourceURL':url,'updatedAt':d['updated'],'fetchedAt':stamp(),'items':items},None
        d=fetch(url)['feed'];rows=d.get('entry',[])
        if not rows:raise ValueError('No entries for this country/genre')
        items=[]
        for i,x in enumerate(rows):
            links=x.get('link',[])
            if isinstance(links,dict):links=[links]
            items.append({'id':x.get('id',{}).get('attributes',{}).get('im:id'),'rank':i+1,'title':x['im:name']['label'],'artist':x['im:artist']['label'],'artwork':x.get('im:image',[{}])[-1].get('label'),'url':x['id']['label'],'genre':x.get('category',{}).get('attributes',{}).get('label'),'preview':next((a['attributes'].get('href') for a in links if a.get('attributes',{}).get('type')=='audio/x-m4a'),None)})
        return key,{'country':country,'genre':genre,'source':'iTunes Top Songs · 商店销量榜','sourceURL':url,'updatedAt':d.get('updated',{}).get('label'),'fetchedAt':stamp(),'items':items},None
    except Exception as e:return key,None,str(e)
def stamp():return datetime.datetime.now(datetime.timezone.utc).isoformat()
def main():
    try:old=json.loads(OUT.read_text())
    except (OSError,ValueError):old={}
    pt=datetime.datetime.now(ZoneInfo('America/Los_Angeles'))
    scheduled=os.environ.get('EVENT')=='schedule'
    same_day=old.get('pacificDay')==pt.date().isoformat()
    keys=[c+'-'+g for c in COUNTRIES for g in GENRES]+['novels','anime']
    previous_health=old.get('health',{}) if scheduled and same_day else {}
    if scheduled:
        if pt.hour<8 or pt.hour>11:return
        if all(previous_health.get(k,{}).get('ok') for k in keys):return
    data={**old,'generatedAt':stamp(),'pacificDay':pt.date().isoformat(),'charts':old.get('charts',{}),'health':dict(previous_health),'successCount':0}
    pending=[(c,g) for c in COUNTRIES for g in GENRES if not previous_health.get(c+'-'+g,{}).get('ok')]
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        for key,result,error in pool.map(chart,pending):
            data['health'][key]={'ok':error is None,'checkedAt':stamp(),'error':error}
            if result:data['charts'][key]=result
    data['successCount']=sum(bool(data['health'].get(c+'-'+g,{}).get('ok')) for c in COUNTRIES for g in GENRES)
    for key,path in [('novels','novel/updates'),('anime','anime')]:
        if previous_health.get(key,{}).get('ok'):continue
        try:
            result=fetch(API+path)
            if result.get('error'):raise ValueError(result['error'])
            data[key]=result
            failures=[s.get('error') or s.get('url','来源不可用') for s in result.get('sources',[]) if not s.get('ok')]
            data['health'][key]={'ok':not failures,'checkedAt':stamp(),'error':'; '.join(failures) or None}
        except Exception as e:data['health'][key]={'ok':False,'checkedAt':stamp(),'error':str(e)}
    OUT.parent.mkdir(parents=True,exist_ok=True);OUT.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':'))+'\n')
    print(f"Updated {data['successCount']}/{len(COUNTRIES)*len(GENRES)} charts; failed source health retained")
    if not data['charts']:raise SystemExit('No usable chart snapshots')
if __name__=='__main__':main()
