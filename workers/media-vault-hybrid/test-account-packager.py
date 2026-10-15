"""Local companion-checkout integration; no source network or retained media."""
import re,hashlib,importlib,io,json,os,sqlite3,sys,tempfile,zipfile
from pathlib import Path
from unittest.mock import patch
payload=json.load(sys.stdin)
assert payload['kind']=='novel' and payload['skip_images'] is True
sys.path.insert(0,str(Path(sys.argv[1]).resolve()))
os.environ.setdefault('MEDIA_TOKEN','x'*48);os.environ.setdefault('ARIA_RPC_SECRET','y'*48)
real_connect=sqlite3.connect
with tempfile.TemporaryDirectory(prefix='mv-contract-') as scratch:
 root=Path(scratch)
 with patch.object(Path,'mkdir'),patch.object(sqlite3,'connect',side_effect=lambda *_a,**kw:real_connect(str(root/'import.db'),**kw)):
  adapter=importlib.import_module('adapter')
 content=importlib.import_module('content_jobs')
 def api(route,url):
  if route=='novel':return {'title':'契约测试小说','chapters':[{'url':'https://fixture/1'},{'url':'https://fixture/2'}]}
  return {'title':'章节','blocks':[{'type':'text','text':'保留正常正文。'},{'type':'image','url':'https://fixture/should-not-fetch.png'}]}
 with patch.object(adapter,'DB',root/'jobs.db'),patch.object(adapter,'GENERATED_FILES',root),patch.object(adapter,'disk_ok'),patch.object(content,'api',side_effect=api),patch.object(content,'get_bytes',side_effect=AssertionError('text-only fetched illustration')),patch.object(content.time,'sleep'):
  jid=payload['id']
  with adapter.connect() as db:
   db.execute('INSERT INTO jobs(id,kind,url,backend_id,created) VALUES (?,?,?,?,?)',(jid,'novel',payload['url'],jid,0))
   db.execute('INSERT INTO generated(id,status) VALUES (?,?)',(jid,'queued'));db.commit()
  adapter.run_content_job(jid,'novel',payload)
  status=adapter.status(adapter.row_by_id(jid));assert status['status']=='complete',status
  raw=(root/(jid+'.epub')).read_bytes()
  with zipfile.ZipFile(io.BytesIO(raw)) as archive:
   assert archive.namelist()[0]=='mimetype' and archive.read('mimetype')==b'application/epub+zip'
   css=next(archive.read(name).decode() for name in archive.namelist() if name.endswith('.css'))
   assert re.search(r'text-indent:2(?:\.0)?em',css) and re.search(r'margin:0 0 0(?:\.0)?em',css)
   assert not any(name.startswith('OEBPS/images/') for name in archive.namelist())
   chapters=[name for name in archive.namelist() if name.endswith('.xhtml') and '保留'.encode() in archive.read(name)]
   assert len(chapters)==2
  print(json.dumps({'status':'complete','text_only':True,'compact_layout':True,'sha256':hashlib.sha256(raw).hexdigest(),'files':[{'path':'generated/'+jid+'.epub','name':jid+'.epub','size':len(raw)}]}))
