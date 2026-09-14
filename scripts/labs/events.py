
import re,json,time,hashlib,html
from datetime import date,timedelta,datetime
from urllib.parse import urljoin
import requests
from bs4 import BeautifulSoup
from dateutil import parser
CENTERS={"Kirkland":[47.6815,-122.2087],"Bellevue":[47.6101,-122.2015],"Redmond":[47.6740,-122.1215]}
def get(url):
 r=requests.get(url,headers={"User-Agent":"PTUniverseEvents/1.0 (https://github.com/XiminHu66/PT-Universe)"},timeout=25);r.raise_for_status();time.sleep(.15);return r
def text(s):return BeautifulSoup(str(s or ""),"html.parser").get_text(" ",strip=True)
def category(title):
 s=title.lower()
 if any(k in s for k in ("meeting","commission","council regular")):return "会议"
 if any(k in s for k in ("market","fair","festival")):return "市集节庆"
 if any(k in s for k in ("music","concert","art","jazz","dance")):return "艺术音乐"
 if any(k in s for k in ("park","stewardship","walk","trail")):return "户外"
 return "社区活动"
def event(title,start,url,city,venue="",cost="",desc="",lat=None,lon=None,end=None):
 title=text(title);loc=text(venue)
 exact=False
 try:
  lat,lon=float(lat),float(lon);exact=45<lat<50 and -125<lon<-120
 except (TypeError,ValueError):pass
 if not exact:lat,lon=CENTERS[city]
 return {"id":hashlib.sha1((url+"|"+start).encode()).hexdigest()[:16],"title":title,"start":start,"end":end,"url":url,"city":city,"venue":loc or city+" · 具体地点见原文","cost":text(cost) or "费用未注明","free":str(cost).strip().lower() in ("free","0","$0","免费"),"description":text(desc)[:220],"category":category(title),"lat":lat,"lon":lon,"locationExact":exact}
def kirkland(today,until):
 base="https://www.kirklandwa.gov/Whats-Happening/Community-Events";out=[];seen=set()
 for page in range(1,6):
  url=base if page==1 else base+"?dlv_OC%20CL%20Public%20Events%20Listing=(pageindex="+str(page)+")"
  soup=BeautifulSoup(get(url).text,"html.parser")
  for a in soup.select('a[href*="/Whats-Happening/Community-Events/"]'):
   raw=a.get_text(" ",strip=True);m=re.search(r"\b(\d{1,2} [A-Za-z]{3} 20\d{2})\b",raw)
   if not m:continue
   dateval=parser.parse(m.group(1)).date()
   if not today<=dateval<=until:continue
   title=raw[:m.start()].strip();href=urljoin(base,a["href"])
   if not title or href in seen:continue
   seen.add(href);desc=raw[m.end():].split("Tagged as:")[0].strip()
   if category(title)=="会议":continue
   start=dateval.isoformat();venue="";cost="";lat=None;lon=None;occurrences=[]
   try:
    detail=BeautifulSoup(get(href).text,"html.parser")
    dat=detail.select_one(".event-date")
    if dat:
     dt=dat.get_text(" ",strip=True);tm=re.search(r"(\d{1,2}:\d{2}\s*[AP]M)",dt)
     if tm:start+="T"+datetime.strptime(tm.group(1).replace(" ",""),"%I:%M%p").strftime("%H:%M:%S")
    location=detail.select_one(".event-location,.location-details,.location-address,[class*=venue]")
    if location:venue=location.get_text(" ",strip=True)[:200]
    # Do not interpret a mention of free parking or vaccinations as a free event.
    content=detail.get_text(" ",strip=True)
    geo=re.search(r"\b(47\.\d+)\s*,\s*(-122\.\d+)",content)
    if geo:lat,lon=geo.groups()
    loc=re.search(r"\bLocation\s+(.+?)\s*(?:View Map|Skip to below map|Add to Calendar)",content)
    if loc:venue=loc.group(1).strip(" ,")
    fee=re.search(r"Event Snapshot\s+Cost\s+(.+?)(?:\s+Contact|\s+Tagged as:)",content)
    if fee:cost=fee.group(1).strip()[:80]
    for occurrence in detail.select(".multi-date-item"):
     label=occurrence.get_text(" ",strip=True)
     dm=re.search(r"([A-Za-z]+ \d{1,2}, 20\d{2})",label)
     if not dm:continue
     dd=parser.parse(dm.group(1)).date()
     if not today<=dd<=until:continue
     tt=re.search(r"(\d{1,2}:\d{2}\s*[AP]M)",label)
     val=dd.isoformat()
     if tt:val+="T"+datetime.strptime(tt.group(1).replace(" ",""),"%I:%M%p").strftime("%H:%M:%S")
     occurrences.append(val)
    if re.search(r"(?:free and open to the public|free admission|admission is free|this free event)",content,re.I):cost="Free"
   except Exception:pass
   for occurrence in dict.fromkeys(occurrences or [start]):out.append(event(title,occurrence,href,"Kirkland",venue,cost,desc,lat,lon))
 return out
def redmond(today,until):
 url=f"https://experienceredmond.com/wp-json/tribe/events/v1/events?per_page=100&start_date={today.isoformat()}&end_date={until.isoformat()}"
 payload=get(url).json();out=[]
 for x in payload.get("events",[]):
  v=x.get("venue") or {};v=v if isinstance(v,dict) else {}
  venue=", ".join(str(v.get(k) or "") for k in ("venue","address","city") if v.get(k))
  out.append(event(x["title"],x["start_date"].replace(" ","T"),x["url"],"Redmond",venue,x.get("cost"),x.get("description"),v.get("geo_lat") or v.get("latitude"),v.get("geo_lng") or v.get("longitude"),(x.get("end_date") or "").replace(" ","T") or None))
 return out
def bellevue(today,until):
 base="https://bellevuewa.gov/calendar";soup=BeautifulSoup(get(base).text,"html.parser")
 titles={urljoin(base,a["href"]):a.get_text(" ",strip=True) for a in soup.select('a[href^="/events/"]') if a.get_text(" ",strip=True) not in ("View Event","")}
 links=list(titles)[:35];out=[]
 for url in links:
  try:
   detail=BeautifulSoup(get(url).text,"html.parser");d=detail.select_one("time[datetime]");h=detail.select_one("h1")
   if not d or not h:continue
   start=d["datetime"][:10]
   if not today.isoformat()<=start<=until.isoformat():continue
   dt=detail.select_one(".field-date-time");tm=re.search(r"(\d{1,2}:\d{2}\s*[AP]M)",dt.get_text(" ",strip=True) if dt else "")
   if tm:start+="T"+datetime.strptime(tm.group(1).replace(" ",""),"%I:%M%p").strftime("%H:%M:%S")
   title=titles.get(url) or h.get_text(" ",strip=True)
   if category(title)=="会议":continue
   loc=detail.select_one('[class*="field--name-field-location"],[class*="field--name-field-event-location"]')
   body=detail.select_one(".field--name-body,.field--name-field-event-description")
   content=detail.get_text(" ",strip=True)
   location=re.search(r"\bLocation\s+(.+?)\s+Description\b",content)
   description=re.search(r"\bDescription\s+(.+?)(?:Reasonable Accommodation|$)",content)
   venue=loc.get_text(" ",strip=True) if loc else location.group(1) if location else ""
   desc=body.get_text(" ",strip=True) if body else description.group(1) if description else ""
   out.append(event(title,start,url,"Bellevue",venue,desc=desc))
  except Exception as e:print("EVENT DETAIL",url,str(e)[:100])
 return out
def collect(config,old,now):
 today=datetime.fromisoformat(now).astimezone(__import__("zoneinfo").ZoneInfo("America/Los_Angeles")).date();until=today+timedelta(days=config.get("eventDays",45))
 specs=[("Kirkland","https://www.kirklandwa.gov/Whats-Happening/Community-Events",kirkland),("Redmond","https://experienceredmond.com/redmond-events/",redmond),("Bellevue","https://bellevuewa.gov/calendar",bellevue)]
 events=[];sources=[]
 for city,url,fn in specs:
  try:
   rows=fn(today,until)
   if not rows:raise ValueError("No dated upcoming events parsed")
   events.extend({**e,"source":city,"checkedAt":now,"stale":False} for e in rows)
   sources.append({"name":city+" 官方活动","url":url,"ok":True,"count":len(rows)})
  except Exception as e:
   events.extend({**e,"stale":True} for e in old.get("events",[]) if e["city"]==city and e["start"][:10]>=today.isoformat())
   sources.append({"name":city+" 官方活动","url":url,"ok":False,"count":0,"error":str(e)[:160]})
  print("EVENTS",city,sources[-1])
 events=list({e["id"]:e for e in events}.values());events.sort(key=lambda e:e["start"])
 return {"version":1,"updatedAt":now if any(s["ok"] for s in sources) else old.get("updatedAt"),"attemptedAt":now,"events":events,"sources":sources,"timezone":"America/Los_Angeles","through":until.isoformat()}
