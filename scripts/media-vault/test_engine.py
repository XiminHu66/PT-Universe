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
 def test_qobuz_requires_private_auth_and_own_config(self):
  self.assertEqual(self.request('/music/qobuz/search',data={'q':'artist'})[0],401)
  with patch.dict(os.environ,{'QOBUZ_APP_ID':'','QOBUZ_AUTH_TOKEN':'','QOBUZ_SECRET':''}):
   status,data,_=self.request('/music/qobuz/search',engine.TOKEN,data={'q':'artist'})
   self.assertEqual(status,400);self.assertIn('尚未配置',data['error'])
 def test_qobuz_rejects_sample_before_download(self):
  with patch.dict(os.environ,{'QOBUZ_APP_ID':'fixture-app','QOBUZ_AUTH_TOKEN':'fixture-token','QOBUZ_SECRET':'fixture-secret'}),patch.object(engine,'qobuz_request',return_value={'sample':True}) as api:
   with self.assertRaisesRegex(ValueError,'试听'):engine.qobuz_download('123','6',pathlib.Path(TMP.name),'fake')
   args=api.call_args.args
   self.assertEqual(args[0],'track/getFileUrl');self.assertEqual(args[1]['format_id'],'6')
   ts=args[1]['request_ts']
   self.assertEqual(args[1]['request_sig'],engine.hashlib.md5(('trackgetFileUrlformat_id6intentstreamtrack_id123'+ts+'fixture-secret').encode()).hexdigest())
 def test_qobuz_download_rejects_wrong_type_and_incomplete(self):
  import io
  folder=pathlib.Path(TMP.name);engine.state['jobs']['music-fixture']={'status':'running'}
  class Body(io.BytesIO):
   def __init__(self,data,total):super().__init__(data);self.headers={'Content-Length':str(total)}
  for payload,total in [(b'MP3!',4),(b'fLaCpartial',99)]:
   response=Body(payload,total)
   with patch.dict(os.environ,{'QOBUZ_APP_ID':'app','QOBUZ_AUTH_TOKEN':'token','QOBUZ_SECRET':'secret'}),patch.object(engine,'qobuz_request',return_value={'url':'https://example.com/audio','format_id':6}),patch.object(engine,'safe_url',side_effect=lambda u:u),patch.object(engine.urllib.request,'build_opener') as opener:
    opener.return_value.open.return_value=response
    with self.assertRaises(ValueError):engine.qobuz_download('123','6',folder,'music-fixture')
    self.assertFalse((folder/'123.flac').exists());self.assertFalse((folder/'123.flac.part').exists())
 def test_queue_capacity(self):
  old=engine.state['jobs'];engine.state['jobs']={str(i):{'status':'queued'} for i in range(10)}
  try:
   with patch.object(engine,'safe_url',return_value='https://example.com'):
    with self.assertRaisesRegex(ValueError,'Queue is full'):engine.submit({'kind':'video','url':'https://example.com'})
  finally:engine.state['jobs']=old
if __name__=='__main__':unittest.main()
