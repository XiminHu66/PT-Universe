import datetime, importlib.util, json, pathlib, tempfile, unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('refresh',pathlib.Path(__file__).with_name('refresh.py'))
refresh=importlib.util.module_from_spec(spec);spec.loader.exec_module(refresh)

class Clock(datetime.datetime):
    @classmethod
    def now(cls,tz=None):
        return cls(2026,9,29,16,23,tzinfo=datetime.timezone.utc).astimezone(tz)

class RefreshTests(unittest.TestCase):
    def run_refresh(self,old):
        with tempfile.TemporaryDirectory() as folder:
            out=pathlib.Path(folder)/'snapshot.json';out.write_text(json.dumps(old))
            def chart(pair):return '-'.join(pair),{'items':[{'title':'current'}]},None
            def fetch(url):
                return {'sources':[{'ok':True},{'ok':False,'error':'source unavailable'}]} if url.endswith('novel/updates') else {'items':[{'title':'episode'}]}
            with patch.object(refresh,'OUT',out),patch.object(refresh.datetime,'datetime',Clock),patch.dict(refresh.os.environ,{'EVENT':'schedule'}),patch.object(refresh,'chart',side_effect=chart) as charts,patch.object(refresh,'fetch',side_effect=fetch) as sources:
                refresh.main()
                return json.loads(out.read_text()),charts.call_count,sources.call_count

    def fixture(self):
        keys=[c+'-'+g for c in refresh.COUNTRIES for g in refresh.GENRES]
        return {'pacificDay':'2026-09-29','successCount':56,'charts':{k:{'items':[]} for k in keys},'health':{k:{'ok':True} for k in keys+['novels','anime']}}

    def test_recovery_retries_only_failed_sources(self):
        old=self.fixture();old['health']['jp-0']['ok']=False;old['health']['novels']['ok']=False
        data,charts,sources=self.run_refresh(old)
        self.assertEqual((charts,sources),(1,1));self.assertEqual(data['successCount'],56)
        self.assertFalse(data['health']['novels']['ok']);self.assertIn('source unavailable',data['health']['novels']['error'])
        self.assertEqual(data['charts']['us-0'],old['charts']['us-0'])

    def test_complete_day_does_not_refetch(self):
        old=self.fixture();data,charts,sources=self.run_refresh(old)
        self.assertEqual((charts,sources),(0,0));self.assertEqual(data,old)

    def test_new_day_refreshes_all_sources(self):
        old=self.fixture();old['pacificDay']='2026-09-28'
        data,charts,sources=self.run_refresh(old)
        self.assertEqual((charts,sources),(56,2));self.assertEqual(data['pacificDay'],'2026-09-29')

if __name__=='__main__':unittest.main()
