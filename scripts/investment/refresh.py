"""Licensed public disclosure snapshots. No personal portfolios are uploaded."""
import datetime as dt, hashlib, json, pathlib, urllib.request, concurrent.futures
ROOT=pathlib.Path(__file__).resolve().parents[2]
OUT=ROOT/'apps/investment-desk/data/public-trades.json'
PEOPLE=['nancy-pelosi','ro-khanna','josh-gottheimer','michael-mccaul','tommy-tuberville']
FUNDS=['berkshire','aschenbrenner','ackman','druckenmiller']
NOW=dt.datetime.now(dt.timezone.utc).isoformat()
def get(path):
    req=urllib.request.Request('https://tracefour.com/v1/'+path,headers={'User-Agent':'PTUniverseResearch/1.0 (+https://github.com/XiminHu66/PT-Universe)','Accept':'application/json'})
    with urllib.request.urlopen(req,timeout=30) as r:
        raw=r.read(4_000_001)
        if len(raw)>4_000_000: raise ValueError('response too large')
        return json.loads(raw)
def collect(kind,slug):
    path=('congress/' if kind=='congress' else 'trackers/')+slug
    payload=get(path); d=payload['data']; url='https://tracefour.com/'+path
    if kind=='congress':
        trades=[]
        for t in d.get('trades',[])[:200]:
            if not t.get('ticker') or not t.get('sourceLink'): continue
            trades.append({k:t.get(k) for k in ['filingId','memberName','ticker','assetDescription','assetType','type','owner','transactionDate','disclosureDate','amountLabel','sourceLink','ingestedAt']})
        return {'id':slug,'kind':kind,'name':d['member']['memberName'],'url':url,'trades':trades,'checkedAt':NOW,'dataAt':payload.get('meta',{}).get('fetchedAt'),'ok':True}
    return {'id':slug,'kind':'13f','name':d['identity']['displayName'],'url':url,'snapshot':d.get('snapshot'),'filingHistory':d.get('filingHistory',[])[:3],'caveats':d.get('caveatKeys',[]),'checkedAt':NOW,'ok':True}
def main():
    old=json.loads(OUT.read_text()) if OUT.exists() else {'sources':[]}
    prior={s['id']:s for s in old['sources']}; rows=[]
    # At most nine public API calls per run; respect the provider's free rate limit.
    for kind,slug in [('congress',s) for s in PEOPLE]+[('13f',s) for s in FUNDS]:
        try: row=collect(kind,slug)
        except Exception as e: row={**prior.get(slug,{'id':slug,'kind':kind,'name':slug,'trades':[]}),'ok':False,'error':str(e)[:250],'attemptedAt':NOW}
        rows.append(row)
    if not any(s['ok'] for s in rows): raise RuntimeError('All disclosure sources failed; keep deployed snapshot')
    result={'generatedAt':NOW,'provider':'Tracefour · public filings compilation','providerURL':'https://tracefour.com/api-docs/congress-trading-api','license':'CC BY 4.0','sources':rows,'socialSources':[{'name':'Serenity','url':'https://x.com/aleabitoreddit','status':'Muse 可监视的公开观点；未接入自动 X 抓取，观点不等于成交证明'},{'name':'Quiver Quantitative','url':'https://www.quiverquant.com/congresstrading/','status':'交叉核对入口'},{'name':'Capitol Trades','url':'https://www.capitoltrades.com/trades','status':'交叉核对入口；当前抓取受限'}]}
    OUT.parent.mkdir(parents=True,exist_ok=True); OUT.write_text(json.dumps(result,ensure_ascii=False,separators=(',',':'))+'\n')
    print(json.dumps({'sources':len(rows),'successful':sum(s['ok'] for s in rows),'transactions':sum(len(s.get('trades',[])) for s in rows)}))
if __name__=='__main__': main()
