import json
from pathlib import Path
import tempfile
import threading
import time
import unittest
from server import Store, validate

class OnDemandTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.now=2000000000
        self.calls=[];self.finish=threading.Event()
        def collector(dataset,symbol,previous):
            self.calls.append((dataset,symbol,previous));self.finish.wait(2)
            return {'symbol':symbol,'history':[{'c':123}],'price':123}
        self.store=Store(self.tmp.name,collector,lambda:self.now)
        self.store.seed=lambda dataset,symbol:{'price':100,'original':True}

    def done(self):
        self.finish.set()
        for _ in range(100):
            if not self.store.active:return
            time.sleep(.005)
        self.fail('worker did not complete')

    def test_reads_never_start_collection_and_requests_merge(self):
        self.assertEqual(self.store.request('stock','NVDA')['data']['price'],100)
        self.assertEqual(self.calls,[])
        self.assertEqual(self.store.request('stock','NVDA',True)['state'],'running')
        self.assertEqual(self.store.request('stock','NVDA',True,True)['state'],'running')
        self.assertEqual(self.store.request('3c',start=True)['state'],'busy')
        self.done();self.assertEqual(len(self.calls),1)
        self.assertEqual(self.store.request('stock','NVDA')['data']['price'],123)
        self.store.request('stock','NVDA',True)
        self.assertEqual(len(self.calls),1)

    def test_failed_refresh_preserves_success_time_and_data(self):
        self.store.write('stock-NVDA',{'at':self.now-400,'data':{'price':99}})
        self.store.collector=lambda *_:(_ for _ in ()).throw(OSError('down'))
        self.store.request('stock','NVDA',True);self.done()
        result=self.store.request('stock','NVDA')
        self.assertEqual(result['state'],'error');self.assertEqual(result['data']['price'],99)
        self.assertEqual(self.store.read('stock-NVDA')['at'],self.now-400)
        self.assertEqual(self.store.request('stock','NVDA',True,True)['state'],'limited')

    def test_manual_refresh_bypasses_ttl_but_not_one_minute_cooldown(self):
        self.store.write('stock-NVDA',{'at':self.now-100,'data':{'price':99}})
        self.assertEqual(self.store.request('stock','NVDA',True)['state'],'fresh')
        self.assertEqual(self.calls,[])
        self.assertEqual(self.store.request('stock','NVDA',True,True)['state'],'running')
        self.done();self.assertEqual(len(self.calls),1)

    def test_budget_survives_service_restart(self):
        self.store.write('budget',{'day':'2033-05-18','counts':{'stock':160}})
        # Use actual clock date, not a fixture-specific assumption.
        from datetime import datetime,timezone
        self.store.write('budget',{'day':datetime.fromtimestamp(self.now,timezone.utc).date().isoformat(),'counts':{'stock':160}})
        restarted=Store(self.tmp.name,lambda *_:self.fail('budget bypass'),lambda:self.now)
        restarted.seed=self.store.seed
        self.assertEqual(restarted.request('stock','NVDA',True)['state'],'limited')

    def test_only_fixed_datasets_and_bounded_symbols(self):
        for dataset,symbol in [('private',''),('stock','../../etc/passwd'),('stock','https://evil'),('stock','A'*16),('3c','NVDA'),('stock','')]:
            with self.assertRaises(ValueError):validate(dataset,symbol)
        for symbol in ['^GSPC','BTC-USD','BRK-B','0700.HK']: 
            if symbol[0].isdigit():continue
            self.assertTrue(validate('stock',symbol))

if __name__=='__main__':unittest.main()
