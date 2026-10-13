import json,sys,unittest
from pathlib import Path
from datetime import date,datetime,timezone
from bs4 import BeautifulSoup
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'apps/tsugi-checker/scraper'))
from games import _parse_taptap_calendar

class CalendarTests(unittest.TestCase):
 def test_hydrated_dates_types_and_deduplication(self):
  values=[]
  def value(x):
   values.append(x);return len(values)-1
  def event(appid,title,stamp,kind='首发',level=1):
   card=value({'id':value(appid),'title':value(title),'icon':value({'url':value('https://img.tapimg.com/icon.jpg')})})
   value({'app_card_info':card,'start_time':value(datetime.fromisoformat(stamp).replace(tzinfo=timezone.utc).timestamp()),'sub_event_type_title':value(kind),'event_level':value(level)})
  event(1,'已发布推荐','2026-09-30T02:00:00')
  event(2,'新首发','2026-10-14T02:00:00')
  event(2,'新首发','2026-10-14T02:00:00',level=3)
  event(3,'预下载','2026-10-14T02:00:00','预下载')
  event(4,'限量测试','2026-10-14T02:00:00','测试招募')
  event(5,'次日首发','2026-10-14T18:00:00')
  event(6,'远期未定','2027-10-14T02:00:00')
  soup=BeautifulSoup('<script id="__NUXT_DATA__" type="application/json">'+json.dumps(values)+'</script>','lxml')
  rows=_parse_taptap_calendar(soup,'https://www.taptap.cn/upcoming',date(2026,10,14),8)
  self.assertEqual([r['title'] for r in rows],['新首发','次日首发'])
  self.assertEqual([r['release_date'] for r in rows],['2026-10-14','2026-10-15'])
  self.assertEqual(rows[0]['url'],'https://www.taptap.cn/app/2')
 def test_bad_hydration_returns_no_fabricated_rows(self):
  for payload in ('not-json','{}','[-1,null]'):
   soup=BeautifulSoup('<script id="__NUXT_DATA__">'+payload+'</script>','lxml')
   self.assertEqual(_parse_taptap_calendar(soup,'https://www.taptap.cn/upcoming',date(2026,10,14),8),[])

if __name__=='__main__':unittest.main()
