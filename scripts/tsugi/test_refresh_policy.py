import unittest
from datetime import datetime,timezone
from refresh_policy import game_decision,REQUIRED
def snapshot(stamp):
    return {'generated_at':stamp,'items':{'pc':[{'id':'real'}]},'sources':{k:{'ok':True,'fallback':False,'checked_at':stamp} for k in REQUIRED}}
class Tests(unittest.TestCase):
    def test_delayed_cron_does_not_silently_skip_stale_data(self):
        now=datetime(2026,10,28,20,tzinfo=timezone.utc)
        self.assertTrue(game_decision(snapshot('2026-10-14T17:24:33Z'),now)[0])
    def test_fresh_morning_snapshot_prevents_afternoon_rescrape(self):
        now=datetime(2026,10,28,20,tzinfo=timezone.utc)
        self.assertFalse(game_decision(snapshot('2026-10-28T15:10:00Z'),now)[0])
    def test_partial_source_retries(self):
        d=snapshot('2026-10-28T15:10:00Z');d['sources']['famitsu']['fallback']=True
        self.assertTrue(game_decision(d,datetime(2026,10,28,20,tzinfo=timezone.utc))[0])
    def test_dst_standard_time_before_eight(self):
        self.assertFalse(game_decision({},datetime(2026,11,3,15,30,tzinfo=timezone.utc))[0])
        self.assertTrue(game_decision({},datetime(2026,11,3,16,0,tzinfo=timezone.utc))[0])
    def test_manual_is_explicit(self):
        self.assertTrue(game_decision({},datetime(2026,10,28,10,tzinfo=timezone.utc),'workflow_dispatch')[0])
    def test_empty_items_never_success(self):
        d=snapshot('2026-10-28T15:10:00Z');d['items']={}
        self.assertTrue(game_decision(d,datetime(2026,10,28,20,tzinfo=timezone.utc))[0])
if __name__=='__main__':unittest.main()
