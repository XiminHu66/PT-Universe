import unittest,json
from datetime import date
from upcoming import extract,discover,CONFIG,collect
class UpcomingTests(unittest.TestCase):
 def test_explicit_date_range_and_no_copyright_guess(self):
  config=json.loads(CONFIG.read_text());ces=next(x for x in config['events'] if x['id']=='ces')
  row=extract(ces,'<p>Media day January 4, 2027</p><p>CES 2027: Jan. 6–9, 2027</p><footer>copyright 2028</footer>',date(2026,10,28))
  self.assertEqual(row['dateKey'],'2027-01-06');self.assertEqual(row['endDate'],'2027-01-09')
  with self.assertRaises(ValueError):extract(ces,'CES 2027, Copyright 2027',date(2026,10,28))
 def test_source_outage_preserves_verified_date(self):
  out=collect({}, {}, '2026-10-28T18:00:00+00:00',fetcher=lambda _: (_ for _ in ()).throw(ValueError('outage')))
  self.assertGreater(len(out['items']),5);self.assertTrue(all(x['stale'] for x in out['items']));self.assertTrue(any(x['id']=='official:ces' for x in out['items']))
 def test_direct_archive_is_not_future_game_release(self):
  row={'id':'nintendo-direct','title':'Nintendo Direct','url':'https://www.nintendo.com/us/nintendo-direct/'}
  self.assertEqual(discover(row,'Nintendo Direct 9.9.2026 Monster Hunter launches December 4, 2026',date(2026,10,28)),[])
  found=discover(row,'Nintendo Direct 11.5.2026',date(2026,10,28));self.assertEqual(found[0]['dateKey'],'2026-11-05')
 def test_rss_announcement_not_recap_or_release(self):
  row={'id':'state-of-play','title':'State of Play','url':'https://blog.playstation.com/tag/state-of-play/feed/','kind':'rss'}
  xml='<rss><channel><item><title>State of Play returns November 5</title><pubDate>Wed, 28 Oct 2026 10:00:00 GMT</pubDate><link>https://blog.playstation.com/announcement/</link></item><item><title>State of Play recap: Game launches January 28</title><pubDate>Wed, 28 Oct 2026 10:00:00 GMT</pubDate></item></channel></rss>'
  found=discover(row,xml,date(2026,10,28));self.assertEqual(len(found),1);self.assertEqual(found[0]['dateKey'],'2026-11-05')
if __name__=='__main__':unittest.main()
