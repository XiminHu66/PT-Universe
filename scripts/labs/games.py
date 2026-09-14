
import time,requests
from urllib.parse import quote,unquote
BASE="https://www.cheapshark.com/api/1.0/"
def get(path,**params):
 r=requests.get(BASE+path,params=params,timeout=25);r.raise_for_status();time.sleep(.25);return r.json()
def normalize(x,stores):
 deal=x.get("dealID")
 return {"id":str(x["gameID"]),"title":x["title"],"price":float(x["salePrice"]),"regular":float(x["normalPrice"]),"discount":float(x.get("savings",0)),"store":stores.get(str(x["storeID"]),str(x["storeID"])),"storeID":str(x["storeID"]),"dealID":deal,"url":"https://www.cheapshark.com/redirect?dealID="+quote(unquote(deal),safe=""),"steamID":x.get("steamAppID"),"thumb":x.get("thumb"),"rating":int(x.get("steamRatingPercent") or 0),"reviews":int(x.get("steamRatingCount") or 0)}
def collect(config,old,now):
 sources=[];deals=[];stores={}
 try: stores={s["storeID"]:s["storeName"] for s in get("stores")}
 except Exception: pass
 for params in [{"pageSize":60,"sortBy":"Deal Rating"},{"pageSize":60,"storeID":"1","sortBy":"Recent"},*[{"pageSize":20,"title":t,"sortBy":"Price"} for t in config["gameTitles"]]]:
  try:
   rows=get("deals",**params);deals.extend(normalize(x,stores) for x in rows)
   sources.append({"name":"CheapShark · "+params.get("title",params.get("sortBy","")),"url":"https://www.cheapshark.com/","ok":True,"count":len(rows)})
  except Exception as e:sources.append({"name":"CheapShark","url":"https://www.cheapshark.com/","ok":False,"count":0,"error":str(e)[:160]})
 grouped={}
 for d in deals:
  k=d["id"]
  if k not in grouped:grouped[k]={**d,"offers":[]}
  grouped[k]["offers"].append(d)
  if d["price"]<grouped[k]["price"]: grouped[k]={**d,"offers":grouped[k]["offers"]}
 history=old.get("history",{})
 for k,d in grouped.items():
  d["offers"]=list({x["dealID"]:x for x in d["offers"]}.values());d["offers"].sort(key=lambda x:x["price"])
  points=[p for p in history.get(k,[]) if p["date"]!=now[:10]]
  history[k]=(points+[{"date":now[:10],"price":d["price"]}])[-180:]
  d["observedLow"]=min(p["price"] for p in history[k]);d["observedSince"]=history[k][0]["date"]
 current=sorted(grouped.values(),key=lambda d:(-d["discount"],-d["reviews"]))
 return {"version":1,"updatedAt":now if current else old.get("updatedAt"),"attemptedAt":now,"games":current or old.get("games",[]),"history":history,"sources":sources,"currency":"USD","provider":"CheapShark","stores":stores}
