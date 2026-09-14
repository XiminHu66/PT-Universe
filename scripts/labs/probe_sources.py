
import requests,json
from bs4 import BeautifulSoup
import yfinance as yf
try:
 t=yf.Ticker("NVDA")
 for name in ["quarterly_income_stmt","quarterly_cashflow"]:
  d=getattr(t,name);print("FINANCIAL",name,d.shape); print(d.to_json()[:10000])
except Exception as e: print("FINANCIAL ERROR",str(e))
for url in [
"https://www.kirklandwa.gov/Whats-Happening/Community-Events/Parks-and-Community-Services/Special-Events-Division/Kirkland-Wednesday-Market",
"https://bellevuewa.gov/events/2026-2027-cultural-conversations-kickoff",
"https://www.kirklandwa.gov/Whats-Happening/Community-Events?dlv_OC%20CL%20Public%20Events%20Listing=(pageindex=2)"
]:
 try:
  r=requests.get(url,timeout=30);s=BeautifulSoup(r.text,"html.parser");print("SOURCE",url,r.status_code)
  print("JSONLD",[x.get_text()[:4000] for x in s.select('script[type="application/ld+json"]')])
  print("ITEMPROP",[str(x)[:700] for x in s.select("[itemprop],time")][:20])
  m=s.select_one("main") or s;print("TEXT",m.get_text(" ",strip=True)[-14000:-1000])
  print("CLASS",[(x.get("class"),x.get_text(" ",strip=True)[:100]) for x in s.select('[class*="date"],[class*="location"]')][:20])
 except Exception as e: print("ERROR",str(e))
