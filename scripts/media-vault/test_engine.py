import importlib.util, json, os, pathlib, tempfile, threading, unittest, urllib.error, urllib.request
from unittest.mock import patch
TMP=tempfile.TemporaryDirectory();os.environ['MEDIA_DATA']=TMP.name
ROOT=pathlib.Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('engine',ROOT/'services/media-engine/engine.py');engine=importlib.util.module_from_spec(spec);spec.loader.exec_module(engine)
class EngineTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.server=engine.ThreadingHTTPServer(('127.0.0.1',0),engine.Handler);cls.url='http://127.0.0.1:'+str(cls.server.server_port)
  threading.Thread(target=cls.server.serve_forever,daemon=True).start()
 @classmethod
 def tearDownClass(cls):cls.server.shutdown();cls.server.server_close()
 def request(self,path,token='',origin=None,data=None):
  headers={'Authorization':'Bearer '+token}
  if origin:headers['Origin']=origin
  try:
   with urllib.request.urlopen(urllib.request.Request(self.url+path,headers=headers,data=json.dumps(data).encode() if data else None),timeout=5) as r:return r.status,json.load(r),r.headers
  except urllib.error.HTTPError as e:return e.code,json.load(e),e.headers
 def test_auth_and_cors(self):
  self.assertEqual(self.request('/health')[0],401)
  self.assertEqual(self.request('/health',engine.TOKEN,'https://evil.example')[0],403)
  status,data,headers=self.request('/health',engine.TOKEN,'https://ximinhu66.github.io')
  self.assertEqual(status,200);self.assertTrue(data['ok']);self.assertEqual(headers['Access-Control-Allow-Origin'],'https://ximinhu66.github.io')
 def test_private_destination_blocked(self):
  for url in ['http://127.0.0.1/x','http://10.0.0.1/','http://[::1]/','file:///etc/passwd','https://user:pass@example.com']:
   with self.assertRaises((ValueError,OSError)):engine.safe_url(url)
  with patch.object(engine.socket,'getaddrinfo',return_value=[(2,1,6,'',('192.168.1.5',443))]):
   with self.assertRaises(ValueError):engine.safe_url('https://public-looking.example')
 def test_magnet_validation(self):
  self.assertTrue(engine.safe_url('magnet:?xt=urn:btih:'+'a'*40,True))
  with self.assertRaises(ValueError):engine.safe_url('magnet:?xt=evil',True)
 def test_download_file_scope(self):
  id='a'*32;folder=engine.DATA/'downloads'/id;folder.mkdir(parents=True,exist_ok=True)
  (folder/'novel.epub').write_bytes(b'book');(folder/'process.log').write_text('sensitive log');(folder/'unfinished.mp4.part').write_bytes(b'partial');(folder/'escape').symlink_to(engine.TOKEN_FILE)
  self.assertEqual([f['name'] for f in engine.job_files(id)],['novel.epub'])
  self.assertEqual(self.request('/download?ticket=wrong')[0],401)
  with self.assertRaises(ValueError):engine.job_files('../../etc')
 def test_cancelled_job_does_not_start(self):
  id='b'*32;engine.state['jobs'][id]={'id':id,'status':'cancelled','kind':'video','url':'https://example.com','createdAt':engine.now()}
  with patch.object(engine,'run_process') as run:engine.work(id);run.assert_not_called()
 def test_queue_capacity(self):
  old=engine.state['jobs'];engine.state['jobs']={str(i):{'status':'queued'} for i in range(10)}
  try:
   with patch.object(engine,'safe_url',return_value='https://example.com'):
    with self.assertRaisesRegex(ValueError,'Queue is full'):engine.submit({'kind':'video','url':'https://example.com'})
  finally:engine.state['jobs']=old
if __name__=='__main__':unittest.main()
