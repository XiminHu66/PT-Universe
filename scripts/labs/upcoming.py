"""Daily official event checks; keep verified dates on source outages, never infer dates."""
import concurrent.futures,json,re
from datetime import date,datetime
from html.parser import HTMLParser
from pathlib import Path
from urllib.request import Request,urlopen
from reliability import source,PACIFIC
ROOT=Path(__file__).resolve().parents[2]
CONFIG=ROOT/'apps/daily-nexus/data/upcoming-sources.json'
class Text(HTMLParser):
 def __init__(self):super().__init__();self.parts=[];self.skip=0
 def handle_starttag(self,t,a):
  if t in ('script','style'):self.skip+=1
 def handle_endtag(self,t):
  if t in ('script','style') and self.skip:self.skip-=1
 def handle_data(self,d):
  if not self.skip:self.parts.append(d)
def extract(row,html,today):
 parser=Text();parser.feed(html);text=' '.join(' '.join(parser.parts).split())
 for m in re.finditer(row['pattern'],text,re.I):
  fields=m.groupdict();year=int(fields['year']);month=row['month'];start=date(year,month,int(fields['day']))
  end=date(year,row.get('endMonth',month),int(fields.get('end') or fields['day']))
  if end<today or (start-today).days>550:continue
  old_date=row['date'];suffix=old_date[10:] if old_date[:10]==start.isoformat() else 'T12:00:00'
  return {**row,'date':start.isoformat()+suffix,'dateKey':start.isoformat(),'endDate':end.isoformat(),'title':re.sub(r'20\d{2}',str(year),row['title'])}
 raise ValueError('No explicit current event date matched; keeping last verified dates')
def get(url):
 request=Request(url,headers={'User-Agent':'PTUniverseEvents/1.0 (https://github.com/XiminHu66/PT-Universe)'})
 with urlopen(request,timeout=15) as response:return response.read(2500000).decode('utf-8',errors='replace')
def collect(config,old,now,fetcher=get):
 settings=json.loads(CONFIG.read_text());today=datetime.fromisoformat(now.replace('Z','+00:00')).astimezone(PACIFIC).date();old_rows={x['id']:x for x in old.get('items',[])}
 sources=[source(old,'catalog','Official event catalog',settings['events'][0]['url'],now,True,len(settings['events']))]
 def check(row):
  sid=row['id'];previous=old_rows.get('official:'+sid);fallback=previous or row
  try:
   item=clean(extract(row,fetcher(row['url']),today));item['verifiedAt']=now;item['stale']=False
   health=source(old,sid,row['source'],row['url'],now,True,1,optional=True)
  except Exception as error:
   item={**clean(fallback),'stale':True};health=source(old,sid,row['source'],row['url'],now,False,1,str(error)[:180],optional=True)
  return item,health
 def clean(row):return {k:v for k,v in row.items() if k not in ('pattern','month','endMonth')}|{'id':row['id'] if str(row['id']).startswith('official:') else 'official:'+row['id'],'manual':False,'dateStatus':'verified'}
 with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:results=list(pool.map(check,settings['events']))
 items=[r for r,h in results if r.get('endDate',r['date'][:10])>=today.isoformat()]
 for watch in settings['watchlist']:
  try:
   announcements=discover(watch,fetcher(watch['url']),today)
   for item in announcements:item['verifiedAt']=now
   items.extend(announcements);sources.append(source(old,watch['id'],watch['title'],watch['url'],now,True,len(announcements),optional=True))
  except Exception as error:
   items.extend({**x,'stale':True} for x in old.get('items',[]) if x['id'].startswith('announcement:'+watch['id']+':') and x['dateKey']>=today.isoformat())
   sources.append(source(old,watch['id'],watch['title'],watch['url'],now,False,0,str(error)[:180],optional=True))
 return {'version':1,'updatedAt':now,'attemptedAt':now,'items':items,'sources':sources+[h for r,h in results if h],'watchlist':settings['watchlist']}

# Announcements are accepted only as explicit event metadata or launch headlines.
# Game release dates appearing elsewhere on these pages must never become show dates.
def discover(row,html,today):
 import calendar,xml.etree.ElementTree as ET
 candidates=[]
 if row.get('kind')=='rss':
  xml=ET.fromstring(html)
  for item in xml.findall('.//item'):
   title=item.findtext('title') or ''
   if row['title'].lower() not in title.lower() or not re.search(r'return|airs?|announc|join|watch|tune in',title,re.I):continue
   published=item.findtext('pubDate') or ''
   year_match=re.search(r'20\d{2}',published)
   if not year_match:continue
   year=int(year_match[0]);body=' '.join(item.itertext());p=Text();p.feed(body)
   text=' '.join(p.parts)
   month_names='|'.join(list(calendar.month_name)[1:])
   match=re.search(r'\b('+month_names+r')\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(20\d{2}))?',title,re.I)
   if not match:continue
   month=list(calendar.month_name).index(match[1].title());event_year=int(match[3] or year)
   event_date=date(event_year,month,int(match[2]))
   # Only a near-future date announced in this recent official post is eligible.
   if match[3] is None and event_date<today and today.month==12 and month==1:event_date=event_date.replace(year=event_year+1)
   if 0<=(event_date-today).days<=60:candidates.append((event_date,item.findtext('link') or row['url']))
 else:
  p=Text();p.feed(html);text=' '.join(' '.join(p.parts).split())
  brand=re.escape(row['title'])
  for match in re.finditer(brand+r'\s+(\d{1,2})[./](\d{1,2})[./](20\d{2})',text,re.I):
   value=date(int(match[3]),int(match[1]),int(match[2]))
   if 0<=(value-today).days<=60:candidates.append((value,row['url']))
 return [{'id':'announcement:'+row['id']+':'+d.isoformat(),'title':row['title'],'date':d.isoformat()+'T12:00:00','dateKey':d.isoformat(),'endDate':d.isoformat(),'category':'event','source':row['title']+' · 官方官宣','url':url,'manual':False,'priority':118,'dateStatus':'verified'} for d,url in candidates[:2]]
