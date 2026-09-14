
"""Normalize genuine quarterly statements; never substitute missing facts with zero."""
import math,time
from datetime import date
import requests
import yfinance as yf
from reliability import source, cached_source, selected
TAGS={
"revenue":["RevenueFromContractWithCustomerExcludingAssessedTax","Revenues","SalesRevenueNet"],
"operatingIncome":["OperatingIncomeLoss"],"netIncome":["NetIncomeLoss"],"grossProfit":["GrossProfit"],
"ocf":["NetCashProvidedByUsedInOperatingActivities"],
"capex":["PaymentsToAcquirePropertyPlantAndEquipment"],"sbc":["ShareBasedCompensation"],
"shares":["WeightedAverageNumberOfDilutedSharesOutstanding"]
}
def days(a,b): return (date.fromisoformat(a)-date.fromisoformat(b)).days
def quarterly_facts(facts,tags,unit="USD",additive=True):
 result={}
 for tag in tags:
  records=facts.get(tag,{}).get("units",{}).get(unit,[])
  pairs={}
  for x in records:
   if not x.get("start") or x.get("form") not in ("10-Q","10-K","10-Q/A","10-K/A"): continue
   key=(x["start"],x["end"])
   if key not in pairs or x.get("filed","")>pairs[key].get("filed",""): pairs[key]=x
  own={}
  for (start,end),x in pairs.items():
   duration=days(end,start)
   if 65<=duration<=110: own[end]={**x,"note":"单季申报","tag":tag}
  if additive:
   for (start,end),x in pairs.items():
    if not 150<=days(end,start)<=380 or end in own: continue
    candidates=[p for (s,e),p in pairs.items() if s==start and 65<=days(end,e)<=110 and days(e,s)>=65]
    if candidates:
     p=max(candidates,key=lambda p:p["end"])
     own[end]={**x,"val":x["val"]-p["val"],"note":"累计数相减："+str(x["val"])+" − "+str(p["val"]),"tag":tag}
  for end,x in own.items(): result.setdefault(end,x)
 return result
def from_sec(raw,cik):
 facts=raw["facts"]["us-gaap"]
 series={k:quarterly_facts(facts,tags,"shares" if k=="shares" else "USD",k!="shares") for k,tags in TAGS.items()}
 out=[]
 for end,r in sorted(series["revenue"].items())[-12:]:
  q={"end":end,"filed":r.get("filed"),"note":""}
  notes=[]
  for k,items in series.items():
   x=items.get(end);q[k]=x["val"] if x else None
   if x and "相减" in x["note"]: notes.append(k+"："+x["note"])
  q["fcf"]=q["ocf"]-q["capex"] if q["ocf"] is not None and q["capex"] is not None else None
  acc=r.get("accn","");q["sourceURL"]=f"https://www.sec.gov/Archives/edgar/data/{int(cik)}/{acc.replace('-','')}/{acc}-index.html"
  q["note"]="；".join(notes);out.append(q)
 return out
def number(df,row,col):
 try:
  n=float(df.loc[row,col]);return n if math.isfinite(n) else None
 except (KeyError,TypeError,ValueError): return None
def from_yahoo(ticker):
 t=yf.Ticker(ticker);income=t.quarterly_income_stmt;cash=t.quarterly_cashflow
 if income.empty: raise ValueError("Yahoo returned no quarterly income statement")
 im={"revenue":"Total Revenue","operatingIncome":"Operating Income","netIncome":"Net Income","grossProfit":"Gross Profit","shares":"Diluted Average Shares"}
 cm={"ocf":"Operating Cash Flow","capex":"Capital Expenditure","sbc":"Stock Based Compensation"}
 out=[]
 for col in sorted(income.columns):
  q={"end":str(col.date()),"filed":None,"sourceURL":f"https://finance.yahoo.com/quote/{ticker}/financials/","note":"Yahoo 标准化单季数据；可能重述；现金流日期须与利润表一致"}
  q.update({k:number(income,row,col) for k,row in im.items()});q.update({k:number(cash,row,col) for k,row in cm.items()})
  if q["revenue"] is None: continue
  # Yahoo represents capital expenditure as a cash outflow (negative).
  if q["capex"] is not None: q["capex"]=-q["capex"]
  q["fcf"]=q["ocf"]-q["capex"] if q["ocf"] is not None and q["capex"] is not None else None
  out.append(q)
 return out
def collect(config,old,now):
 sources=[];companies=[];previous={x["ticker"]:x for x in old.get("companies",[])};sec_available=True
 for ticker,name,cik in config["stocks"]:
  if not selected(config,ticker) and ticker in previous and cached_source(old,ticker):
   companies.append(previous[ticker]);sources.append(cached_source(old,ticker));continue
  sec_url=f"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik:010d}.json"
  qs=[];provider="";error=""
  if sec_available:
   try:
    r=requests.get(sec_url,headers={"User-Agent":"PTUniverseResearch/1.0 contact 36136585+XiminHu66@users.noreply.github.com"},timeout=20)
    if r.status_code in (403,429):
     sec_available=False;sources.append(source(old,"sec","SEC EDGAR",sec_url,now,False,error=f"HTTP {r.status_code}；本轮切换 Yahoo，不继续请求 SEC",optional=True))
    r.raise_for_status();qs=from_sec(r.json(),cik);provider="SEC EDGAR"
    time.sleep(.25)
   except Exception as e: error=str(e)[:160]
  if not qs:
   try: qs=from_yahoo(ticker);provider="Yahoo Finance 标准化财报"
   except Exception as e: error=str(e)[:160]
  if len(qs)>=2:
   item={"ticker":ticker,"name":name,"cik":cik,"provider":provider,"sourceURL":sec_url if provider=="SEC EDGAR" else f"https://finance.yahoo.com/quote/{ticker}/financials/","quarters":qs,"updatedAt":now,"stale":False}
   companies.append(item);sources.append(source(old,ticker,ticker+" · "+provider,item["sourceURL"],now,True,len(qs)))
  else:
   if ticker in previous: companies.append({**previous[ticker],"stale":True})
   sources.append(source(old,ticker,ticker,sec_url,now,False,error=error or "不足两个有效季度"))
  print("FINANCIAL",ticker,len(qs),provider,error if not qs else "")
  time.sleep(.3)
 return {"version":1,"updatedAt":max((c["updatedAt"] for c in companies if c.get("updatedAt")),default=old.get("updatedAt")),"attemptedAt":now,"companies":companies,"sources":sources}
