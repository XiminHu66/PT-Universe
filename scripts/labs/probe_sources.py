import requests,json
from bs4 import BeautifulSoup
urls=[
"https://data.sec.gov/api/xbrl/companyfacts/CIK0001045810.json",
"https://www.cheapshark.com/api/1.0/deals?pageSize=5",
"https://www.kirklandwa.gov/Whats-Happening/Community-Events",
"https://experienceredmond.com/wp-json/tribe/events/v1/events?per_page=5",
"https://bellevuewa.gov/calendar",
"https://www.bellevuedowntown.com/events/calendar"
]
for url in urls:
 try:
  r=requests.get(url,headers={"User-Agent":"PTUniverseResearch/1.0 (https://github.com/XiminHu66/PT-Universe)"},timeout=35)
  print("SOURCE",url,r.status_code,len(r.content))
  if "json" in r.headers.get("content-type","") or "/api/" in url or "wp-json" in url:
   data=r.json()
   if "companyfacts" in url: print("FACTS",list(data["facts"]["us-gaap"])[:20])
   else: print(json.dumps(data,ensure_ascii=False)[:5000])
  else:
   soup=BeautifulSoup(r.text,"html.parser")
   print("JSONLD",[s.get_text()[:3000] for s in soup.select('script[type="application/ld+json"]')][:4])
   print("TIME",[(str(s.parent)[:700]) for s in soup.select("time")][:6])
   print("LINKS",[(a.get_text(" ",strip=True),a.get("href")) for a in soup.select("a[href]") if any(p in a["href"].lower() for p in ("/events/","/event/","calendar.aspx?","/community-events/"))][:30])
 except Exception as e: print(type(e).__name__,str(e)[:300])
