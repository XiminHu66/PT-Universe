from datetime import date
import unittest
from events import parse_civic,parse_seattle,CENTERS

class RegionTests(unittest.TestCase):
 def test_seven_regions(self):
  self.assertEqual(set(CENTERS),{'Kirkland','Bellevue','Redmond','Lynnwood','Everett','Kent','Seattle'})
 def test_everett_date_venue_and_expired_filter(self):
  html='''<li><h3><a href="/Calendar.aspx?EID=123">FREE Community Access</a></h3><span itemprop="startDate">2026-09-17T15:00:00</span><span itemprop="address">1502 Wall Street, Everett</span><p itemprop="description">Free admission</p></li>'''
  rows=parse_civic(html,date(2026,9,14),date(2026,10,29));self.assertEqual(len(rows),1)
  self.assertEqual(rows[0]['city'],'Everett');self.assertTrue(rows[0]['free']);self.assertFalse(rows[0]['locationExact'])
  self.assertEqual(parse_civic(html,date(2026,10,1),date(2026,10,29)),[])
 def test_seattle_all_day_is_not_invented_noon(self):
  html='''<p class="date-bar__date">September 17</p><div class="row"><div class="event-list__time">All Day</div><h2 class="event-list__title"><a href="events/event-calendar/test">Public Art</a></h2><div class="event-list__price">Free Event</div></div>'''
  rows=parse_seattle(html,date(2026,9,14),date(2026,10,29))
  self.assertEqual(rows[0]['start'],'2026-09-17');self.assertTrue(rows[0]['free'])
 def test_seattle_event_time_and_official_coordinates(self):
  html='''<p class="date-bar__date">September 18</p><div class="row"><div class="event-list__time">7:30 p.m.</div><h2 class="event-list__title"><a href="events/event-calendar/concert">Concert</a></h2><a class="event-list__location-link" href="https://maps.google.com/!3d47.6219473!4d-122.3517443">Map</a></div>'''
  row=parse_seattle(html,date(2026,9,14),date(2026,10,29))[0]
  self.assertEqual(row['start'],'2026-09-18T19:30:00');self.assertTrue(row['locationExact'])

if __name__=='__main__':unittest.main()
