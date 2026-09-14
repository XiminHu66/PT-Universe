
import time,requests
from reliability import source, cached_source, selected
from urllib.parse import quote,unquote
BASE="https://www.cheapshark.com/api/1.0/"
def get(path,**params):
 r=requests.get(BASE+path,params=params,headers={"User-Agent":"PTUniverseGames/1.0 (https://github.com/XiminHu66/PT-Universe)"},timeout=25)
 print("GAME HTTP",r.status_code,r.url)
 r.raise_for_status();time.sleep(.4);return r.json()
def normalize(x,stores):
 deal=x.get("dealID")
 return {"id":str(x["gameID"]),"title":x["title"],"price":float(x["salePrice"]),"regular":float(x["normalPrice"]),"discount":float(x.get("savings",0)),"store":stores.get(str(x["storeID"]),str(x["storeID"])),"storeID":str(x["storeID"]),"dealID":deal,"url":"https://www.cheapshark.com/redirect?dealID="+quote(unquote(deal),safe=""),"steamID":x.get("steamAppID"),"thumb":x.get("thumb"),"rating":int(x.get("steamRatingPercent") or 0),"reviews":int(x.get("steamRatingCount") or 0)}
def collect(config,old,now):
 sources=[];deals=[];stores=old.get("stores",{})
 try: stores={s["storeID"]:s["storeName"] for s in get("stores")}
 except Exception: pass
 batches=dict(old.get("sourceBatches",{}))
 specs=[("top",{"pageSize":60,"sortBy":"Deal Rating"}),("steam-recent",{"pageSize":60,"storeID":"1","sortBy":"Recent"}),*[("title:"+t,{"pageSize":20,"title":t,"sortBy":"Price"}) for t in config["gameTitles"]]]
 for sid,params in specs:
  if not selected(config,sid) and cached_source(old,sid):
   sources.append(cached_source(old,sid));deals.extend(batches.get(sid,[]));continue
  try:
   rows=get("deals",**params)
   # An empty exact-title search is valid; an empty broad feed is suspicious.
   if not isinstance(rows,list) or (not rows and sid in ("top","steam-recent")):raise ValueError("Empty or invalid broad deal feed")
   batches[sid]=[{**normalize(x,stores),"checkedAt":now,"stale":False} for x in rows]
   sources.append(source(old,sid,"CheapShark · "+params.get("title",params.get("sortBy","")),"https://www.cheapshark.com/",now,True,len(rows)))
  except Exception as e:
   print("GAME ERROR",type(e).__name__,str(e)[:200])
   batches[sid]=[{**d,"stale":True} for d in batches.get(sid,[])]
   sources.append(source(old,sid,"CheapShark · "+params.get("title",params.get("sortBy","")),"https://www.cheapshark.com/",now,False,error=str(e)[:160]))
  deals.extend(batches.get(sid,[]))
 grouped={}
 for d in deals:grouped.setdefault(d["id"],[]).append(d)
 history=dict(old.get("history",{}));current=[]
 for k,offers in grouped.items():
  # A stale cheap offer must not win over a current observation of that deal.
  unique={}
  for o in offers:
   prior=unique.get(o["dealID"])
   if prior is None or (not o.get("stale"),o.get("checkedAt", ""))>(not prior.get("stale"),prior.get("checkedAt", "")):unique[o["dealID"]]=o
  offers=sorted(unique.values(),key=lambda x:(bool(x.get("stale")),x["price"]))
  d={**offers[0],"offers":offers}
  if not d.get("stale"):
   points=[p for p in history.get(k,[]) if p["date"]!=now[:10]]
   history[k]=(points+[{"date":now[:10],"price":d["price"]}])[-180:]
  if history.get(k):
   d["observedLow"]=min(p["price"] for p in history[k]);d["observedSince"]=history[k][0]["date"]
  current.append(d)
 # Backward compatibility for the first run before per-source batches exist.
 if not old.get("sourceBatches") and any(not s["ok"] for s in sources):
  present={d["id"] for d in current}
  current.extend({**d,"stale":True,"checkedAt":d.get("checkedAt") or old.get("updatedAt")} for d in old.get("games",[]) if d["id"] not in present)
 current.sort(key=lambda d:(bool(d.get("stale")),-d["discount"],-d["reviews"]))
 return {"version":2,"updatedAt":max((s["lastSuccessAt"] for s in sources if s.get("lastSuccessAt")),default=old.get("updatedAt")),"attemptedAt":now,"games":current or [{**d,"stale":True} for d in old.get("games",[])],"history":history,"sources":sources,"sourceBatches":batches,"currency":"USD","provider":"CheapShark","stores":stores}
