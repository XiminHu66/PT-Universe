"""Execute actual companion Agent + adapter against disposable offline fixtures.
Only report metadata is returned. No source HTTP, deployed service or credentials.
"""
import contextlib,importlib,importlib.util,io,json,os,socket,sqlite3,sys,tempfile,zipfile
from pathlib import Path
from unittest.mock import patch
from urllib.parse import parse_qs,urlsplit
payload=json.load(sys.stdin);jobs=payload['jobs'];cancelled=set(payload.get('cancelled',[]))
sys.path.insert(0,str(Path(sys.argv[1]).resolve()))
os.environ.update(MEDIA_TOKEN='x'*64,ARIA_RPC_SECRET='y'*64,MEDIA_AGENT_TOKEN='z'*64,MEDIA_CLOUD_URL='https://fixture.workers.dev')
real_connect=sqlite3.connect
with tempfile.TemporaryDirectory(prefix='mv-integration-') as folder:
 root=Path(folder).resolve();generated=root/'adapter/generated';aria=root/'downloads';video=root/'metube'
 for p in [generated,aria,video,root/'agent']:p.mkdir(parents=True,exist_ok=True)
 with patch.object(Path,'mkdir'),patch.object(sqlite3,'connect',side_effect=lambda *_a,**kw:real_connect(str(root/'import.db'),**kw)):
  adapter=importlib.import_module('adapter')
 content=importlib.import_module('content_jobs')
 spec=importlib.util.spec_from_file_location('contract_agent',str(Path(sys.argv[2]).resolve()/'agent.py'));agent=importlib.util.module_from_spec(spec)
 with patch.object(Path,'mkdir'),patch.object(Path,'chmod'):spec.loader.exec_module(agent)
 reports=[];submissions=[];history=[];gids={};queue=iter(jobs)
 png=bytes.fromhex('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000b49444154789c636000020000050001a5f645400000000049454e44ae426082')
 class SynchronousContent:
  def __init__(self,target,args,**_):self.target=target;self.args=args
  def start(self):
   if self.args[0] not in cancelled:self.target(*self.args)
 def api(route,url):
  if route=='novel':return {'title':'离线集成小说','chapters':[{'url':'https://fixture/1'},{'url':'https://fixture/2'}]}
  return {'title':'测试章','blocks':[{'type':'text','text':'保留正常中文段落。\n\n第二段保持独立。'},{'type':'image','url':'https://fixture/forbidden.png'}]}
 def manga_fetch(url,*_):
  if '/chapter/' in url:return json.dumps({'result':'ok','data':{'id':'bd38fb72-e77f-40e9-abbf-21f53571f0be','attributes':{'translatedLanguage':'zh','pages':2,'externalUrl':None}}}).encode(),'application/json'
  if '/at-home/' in url:return json.dumps({'result':'ok','baseUrl':'https://fixture.mangadex.network','chapter':{'hash':'a'*32,'dataSaver':['1-a.png','2-b.png']}}).encode(),'application/json'
  return png,'image/png'
 def rpc(method,*args):
  if method=='addUri':
   opts=args[1];cid=opts['dir'].split('ptmv-')[1];gids[opts['gid']]=cid;target=aria/('ptmv-'+cid)/'payload.txt';target.parent.mkdir();target.write_bytes(b'owned offline payload');return opts['gid']
  cid=gids[args[0]];target=aria/('ptmv-'+cid)/'payload.txt'
  if method=='tellStatus':return {'status':'complete','completedLength':str(target.stat().st_size),'totalLength':str(target.stat().st_size),'followedBy':[]}
  if method=='getFiles':return [{'path':'/downloads/ptmv-'+cid+'/payload.txt'}]
  raise AssertionError('Unexpected engine method '+method)
 def metube(route,data=None,**_options):
  if route=='/add':
   name=data['custom_name_prefix']+".Kid's choice (ZDF, Terra X) & 中文 🎬!.mp4";raw=b'\x00\x00\x00\x18ftypisomoffline fixture'
   (video/name).write_bytes(raw);history.append({**data,'status':'finished','filename':name,'size':len(raw),'percent':100});return {'status':'ok'}
  if route=='/history':return {'done':history}
  raise AssertionError('Unexpected video method')
 def cloud(method,route,data=None):
  if route=='/agent/lease':return {'job':next(queue,None)}
  if route.startswith('/agent/job?'):
   cid=parse_qs(urlsplit(route).query)['id'][0];return {'status':'cancelled' if cid in cancelled else 'running'}
  if route=='/agent/report':reports.append(data);return {'ok':True}
  raise AssertionError('Unexpected cloud call '+route)
 def local(method,route,data=None):
  if route=='/jobs':
   submissions.append(dict(data));return adapter.add_job(data['kind'],data.get('url'),data.get('format'),body=data)
  cid=parse_qs(urlsplit(route).query).get('id',[None])[0] if '?' in route else data['id'];row=adapter.row_by_id(cid)
  if route.startswith('/jobs/status?'):return {'job':adapter.status(row)}
  if route.startswith('/jobs/files?'):return {'files':adapter.files_for(row)}
  if route=='/jobs/cancel':return adapter.cancel(row)
  raise AssertionError('Unexpected local call '+route)
 with contextlib.ExitStack() as stack:
  for target,name,value in [(adapter,'DB',root/'adapter/jobs.db'),(adapter,'GENERATED_FILES',generated),(adapter,'ARIA_FILES',aria),(adapter,'VIDEO_FILES',video),(agent,'ROOT',root),(agent,'STATE',root/'agent/state.json')]:stack.enter_context(patch.object(target,name,value))
  stack.enter_context(patch.object(socket,'create_connection',side_effect=AssertionError('Unexpected network access')))
  stack.enter_context(patch.object(adapter,'urlopen',side_effect=AssertionError('Unexpected adapter HTTP')))
  stack.enter_context(patch.object(content,'mangadex_get',side_effect=manga_fetch))
  stack.enter_context(patch.object(content,'get_bytes',side_effect=AssertionError('Text-only source attempted image HTTP')))
  stack.enter_context(patch.object(adapter,'disk_ok'));stack.enter_context(patch.object(adapter,'public_url'))
  stack.enter_context(patch.object(adapter.threading,'Thread',SynchronousContent));stack.enter_context(patch.object(content,'api',side_effect=api));stack.enter_context(patch.object(content.time,'sleep'))
  stack.enter_context(patch.object(content,'licensed_commons_file',return_value=({'mime':'image/png','data':png},'CC0 fixture')))
  stack.enter_context(patch.object(adapter,'rpc',side_effect=rpc));stack.enter_context(patch.object(adapter,'metube',side_effect=metube))
  stack.enter_context(patch.object(agent,'cloud',side_effect=cloud));stack.enter_context(patch.object(agent,'local',side_effect=local))
  state={}
  for _ in jobs:agent.poll_once(state)
  assert len(submissions)==len(jobs) and all(s['request_id']==j['id'] for s,j in zip(submissions,jobs))
  for job in jobs:
   cid=job['id'];assert state[cid]['final']
   if cid in cancelled:
    assert state[cid]['status']=='cancelled' and adapter.row_by_id(cid)['canceled']==1
    assert not any(r['id']==cid for r in reports);assert not (generated/(cid+'.epub')).exists()
   else:
    result=next(r for r in reports if r['id']==cid);assert result['status']=='complete' and result['files']
    if job['kind'] in ('novel','manga'):
     raw=(generated/(cid+('.epub' if job['kind']=='novel' else '.cbz'))).read_bytes()
     with zipfile.ZipFile(io.BytesIO(raw)) as archive:
      assert archive.testzip() is None
      if job['kind']=='novel':
       assert b'<p>' in archive.read('OEBPS/c0001.xhtml');assert '<p>保留正常中文段落。</p><p>第二段保持独立。</p>' in archive.read('OEBPS/c0001.xhtml').decode();assert archive.read('mimetype')==b'application/epub+zip';assert not any('/images/' in name for name in archive.namelist())
       assert len([name for name in archive.namelist() if name.startswith('OEBPS/c0')])==len(job['indices'])
      else:assert len([name for name in archive.namelist() if name.endswith('.png')])==(2 if job.get('provider')=='mangadex' else len(job['files']))
  before=len(submissions);recovered=agent.read_state();agent.poll_once(recovered);assert len(submissions)==before,'restart resubmitted a terminal task'
 print(json.dumps({'reports':reports,'cancelled':list(cancelled),'submissions':len(submissions),'restart_stable':True}))
