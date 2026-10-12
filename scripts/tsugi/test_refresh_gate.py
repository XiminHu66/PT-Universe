import unittest
from datetime import datetime
from refresh_gate import fallback_needed, PACIFIC,REQUIRED_SITES
class GateTests(unittest.TestCase):
 def test_quality_not_just_timestamp(self):
  now=datetime(2026,10,12,8,30,tzinfo=PACIFIC);stamp='2026-10-12T15:01:00Z'
  status={'files':[{'name':name,'metadata':{'updatedAt':stamp}} for name in ['site-updates.json','music.json']], 'runs':[]}
  source={'ok':True,'checked_at':stamp,'verifiedChapterCount':48};site={'sources':{name:dict(source) for name in REQUIRED_SITES}}
  self.assertFalse(fallback_needed(status,site,now)[0])
  site['sources']['copymanga']['degraded']=True;self.assertTrue(fallback_needed(status,site,now)[0])
  site['sources']['copymanga']={'ok':True,'count':48};self.assertTrue(fallback_needed(status,site,now)[0])
  status['runs']=[{'scope':'all','status':'running','started_at':'2026-10-12T14:00:00Z'}];self.assertTrue(fallback_needed(status,site,now)[0])
  status['runs'][0]['started_at']='2026-10-12T15:28:00Z';self.assertFalse(fallback_needed(status,site,now)[0])
 def test_dst_and_previous_day(self):
  from refresh_gate import fresh_stamp
  self.assertTrue(fresh_stamp('2026-11-03T16:01:00Z',datetime(2026,11,3,8,30,tzinfo=PACIFIC)))
  self.assertFalse(fresh_stamp('2026-10-11T15:01:00Z',datetime(2026,10,12,8,30,tzinfo=PACIFIC)))
if __name__=='__main__':unittest.main()
