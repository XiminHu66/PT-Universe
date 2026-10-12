import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'apps/tsugi-checker/scraper'))
from aggregators import parse_site_latest
import main
class SourceTests(unittest.TestCase):
 def test_full_title_and_latest_detail(self):
  html='<li><a href="/novel/5428.html"><img alt="完整小說名稱" src="/cover.jpg"><h4>完整小...</h4><p>简介</p></a></li>'
  rows=parse_site_latest(html,'https://tw.linovelib.com/wenku/','linovelib','BiliNovel','novel',60)
  self.assertEqual(rows[0]['title'],'完整小說名稱')
  rows[0]['latest']='第1話'
  previous=main.fetch;main.fetch=lambda *a:'<html><a href="/novel/5428/catalog">最后更新·2026-10-12 第一章 第24話 偶遇</a></html>'
  try:
   main.enrich_site_rows(rows,{'id':'linovelib','enrich':True,'detail_delay':0})
   self.assertEqual(rows[0]['latest'],'第一章 第24話 偶遇');self.assertEqual(rows[0]['updated_text'],'2026-10-12');self.assertTrue(rows[0]['latest_checked_at'])
  finally:main.fetch=previous
 def test_missing_latest_block_cannot_use_rankings(self):
  with self.assertRaises(RuntimeError):parse_site_latest('<h2>排行榜</h2><a href="/comic/a">排行榜作品</a>','https://www.mangacopy.com/','copymanga','CopyManga','manga')
 def test_failed_details_do_not_count_as_verified(self):
  previous=main.fetch;main.fetch=lambda *a:(_ for _ in ()).throw(RuntimeError('offline'))
  try:
   rows=[{'id':'x','title':'漫画','url':'https://www.mangacopy.com/comic/a','latest':'最新更新'}]
   main.enrich_site_rows(rows,{'id':'copymanga','enrich':True,'detail_delay':0});self.assertIn('enrich_error',rows[0]);self.assertNotIn('latest_checked_at',rows[0])
  finally:main.fetch=previous
if __name__=='__main__':unittest.main()
