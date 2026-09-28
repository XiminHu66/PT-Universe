"""Private Media Vault engine: authenticated jobs, aria2, yt-dlp, novel packer.
No open proxy. Bind to loopback by default; tokens never travel to public Workers.
"""
import base64, concurrent.futures, datetime, hashlib, hmac, ipaddress, json, mimetypes, os, re, secrets, shutil, signal, socket, subprocess, tempfile, threading, time, urllib.parse, urllib.request, uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from zoneinfo import ZoneInfo
DATA=Path(os.environ.get('MEDIA_DATA',str(Path.home()/'.media-vault'))).resolve()
DATA.mkdir(parents=True,exist_ok=True)
TOKEN_FILE=DATA/'access-token'
if not TOKEN_FILE.exists():
    TOKEN_FILE.write_text(secrets.token_urlsafe(36));TOKEN_FILE.chmod(0o600)
TOKEN=os.environ.get('MEDIA_TOKEN') or TOKEN_FILE.read_text().strip()
if len(TOKEN)<24: raise RuntimeError('MEDIA_TOKEN must have at least 24 characters')
ORIGINS=set(os.environ.get('MEDIA_ORIGINS','https://ximinhu66.github.io,http://localhost:8000,http://127.0.0.1:8000').split(','))
LOCK=threading.RLock();POOL=concurrent.futures.ThreadPoolExecutor(max_workers=2)
STATE=DATA/'state.json';PROCESSES={};TICKETS={};RPC_TOKEN=secrets.token_urlsafe(32)
try: state=json.loads(STATE.read_text())
except (OSError,ValueError): state={'jobs':{},'watch':{}}
for j in state['jobs'].values():
    if j['status'] in ('queued','running','active','waiting','paused'):j['status']='interrupted'

def now():return datetime.datetime.now(datetime.timezone.utc).isoformat()
def save():
    with LOCK:
        tmp=STATE.with_suffix('.tmp');tmp.write_text(json.dumps(state,ensure_ascii=False));tmp.replace(STATE)
def safe_url(raw,magnet=False):
    if not isinstance(raw,str) or len(raw)>8192:raise ValueError('Invalid URL')
    u=urllib.parse.urlsplit(raw)
    if magnet and u.scheme=='magnet':
        xt=urllib.parse.parse_qs(u.query).get('xt',[''])[0]
        if not re.fullmatch(r'urn:btih:(?:[a-fA-F0-9]{40}|[A-Z2-7a-z]{32})',xt):raise ValueError('Invalid magnet hash')
        return raw
    if u.scheme not in ('https','http') or not u.hostname or u.username or u.password:raise ValueError('HTTP(S) URL required')
    if u.port not in (None,80,443):raise ValueError('Only standard public ports are supported')
    addresses=socket.getaddrinfo(u.hostname,u.port or 443,type=socket.SOCK_STREAM)
    if not addresses or any(not ipaddress.ip_address(a[4][0]).is_global for a in addresses):raise ValueError('Private network destinations are not allowed')
    return raw

def novel_url(raw):
    u=urllib.parse.urlsplit(raw)
    if u.scheme!='https' or u.hostname not in {'www.wenku8.net','wenku8.net','www.bilinovel.com','www.bilinovel.net','www.linovelib.com','w.linovelib.com'}:raise ValueError('Unsupported novel source')
    return safe_url(raw)

def rpc(method,*params):
    body=json.dumps({'jsonrpc':'2.0','id':'mv','method':'aria2.'+method,'params':['token:'+RPC_TOKEN,*params]}).encode()
    req=urllib.request.Request('http://127.0.0.1:6800/jsonrpc',data=body,headers={'Content-Type':'application/json'})
    with urllib.request.urlopen(req,timeout=10) as r: d=json.load(r)
    if 'error' in d:raise ValueError(d['error']['message'])
    return d['result']

def run_process(args,cwd,job_id=None,timeout=120):
    log=Path(cwd)/'process.log'
    with log.open('w') as out:
        p=subprocess.Popen(args,cwd=cwd,stdout=out,stderr=subprocess.STDOUT,start_new_session=True)
        if job_id:
            with LOCK:
                if state['jobs'][job_id]['status']=='cancelled':os.killpg(p.pid,signal.SIGTERM)
                PROCESSES[job_id]=p
        try:
            code=p.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            os.killpg(p.pid,signal.SIGKILL);p.wait();raise ValueError('Operation timed out; retry later or check the source')
        finally:
            if job_id:
                with LOCK:PROCESSES.pop(job_id,None)
        if code:raise ValueError(log.read_text(errors='replace')[-1800:] or 'Downloader failed')

def novel_call(mode,url,index=None):
    novel_url(url)
    with tempfile.TemporaryDirectory(prefix='novel-',dir=DATA) as tmp:
        args=['novel-adapter',mode,url]+([str(index)] if index is not None else [])
        run_process(args,tmp,timeout=85)
        return json.loads((Path(tmp)/'result.json').read_text())

def resolve(url):
    safe_url(url)
    with tempfile.TemporaryDirectory(prefix='resolve-',dir=DATA) as tmp:
        run_process(['yt-dlp','--no-playlist','--skip-download','--no-warnings','--socket-timeout','15','--retries','1','--write-info-json','-o',str(Path(tmp)/'media'),'--',url],tmp,timeout=60)
        files=list(Path(tmp).glob('*.info.json'))
        if not files:raise ValueError('No metadata was returned')
        d=json.loads(files[0].read_text())
        if d.get('has_drm'):raise ValueError('DRM protected media is not supported')
        return {'title':d.get('title'),'formats':[{'id':f['format_id'],'url':f.get('url'),'format':f.get('ext'),'label':str(f.get('format_note') or f.get('resolution') or f['format_id'])+' · '+str(f.get('ext','')),'note':f.get('format'),'size':f.get('filesize') or f.get('filesize_approx'),'audioOnly':f.get('vcodec')=='none','videoOnly':f.get('acodec')=='none'} for f in d.get('formats',[]) if not f.get('has_drm') and f.get('ext') not in ('mhtml',)],'subtitles':list(d.get('subtitles',{}))}

def update_job(id,**values):
    with LOCK:state['jobs'][id].update(values);save()

def work(id):
    with LOCK:
        j=state['jobs'][id]
        if j['status']=='cancelled':return
        j['status']='running';save()
    folder=DATA/'downloads'/id;folder.mkdir(parents=True,exist_ok=True)
    try:
        if j['kind']=='torrent':
            gid=rpc('addUri',[j['url']],{'dir':str(folder),'seed-time':'0','seed-ratio':'0','max-download-limit':'0','follow-torrent':'true','max-tries':'3','retry-wait':'10'})
            update_job(id,gid=gid,status='active');return
        if j['kind']=='novel':
            run_process(['novel-adapter','pack',j['url']],folder,id,timeout=14400)
            if not list(folder.rglob('*.epub')):raise ValueError('Packer did not produce an EPUB')
        else:
            fmt=j.get('format') or 'bv*+ba/b'
            if not re.fullmatch(r'[a-zA-Z0-9_+/.\[\]*<>=?,-]{1,150}',fmt):raise ValueError('Invalid format selector')
            args=['yt-dlp','--no-playlist','--newline','--socket-timeout','20','--retries','3','--max-filesize','10G','--write-subs','--sub-langs','zh.*,cmn.*','--embed-subs','--no-overwrites','-f',fmt,'-o',str(folder/'%(title).160B [%(id)s].%(ext)s'),'--',j['url']]
            run_process(args,folder,id,timeout=14400)
        with LOCK:
            if j['status']=='cancelled':return
        files=job_files(id)
        if not files:raise ValueError('No completed files were produced')
        update_job(id,status='complete',completed=sum(f['size'] for f in files),finishedAt=now())
    except Exception as e:
        with LOCK:
            if j['status']=='cancelled':return
        update_job(id,status='error',error=str(e)[-1800:],finishedAt=now())

def submit(body):
    kind=body.get('kind');url=body.get('url','')
    if kind not in ('torrent','video','novel'):raise ValueError('Unsupported job kind')
    novel_url(url) if kind=='novel' else safe_url(url,kind=='torrent')
    with LOCK:
        if sum(j['status'] in ('queued','running','active','waiting') for j in state['jobs'].values())>=10:raise ValueError('Queue is full (10 active jobs)')
        if shutil.disk_usage(DATA).free<1_000_000_000:raise ValueError('Less than 1 GB disk space remains')
        id=uuid.uuid4().hex
        state['jobs'][id]={'id':id,'kind':kind,'url':url,'format':body.get('format'),'status':'queued','createdAt':now(),'completed':0,'total':0};save()
        POOL.submit(work,id)
        return {'id':id}

def refresh_jobs():
    with LOCK:jobs=list(state['jobs'].values())
    for j in jobs:
        if j.get('gid') and j['status'] in ('active','waiting','paused'):
            try:
                d=rpc('tellStatus',j['gid'])
                if d.get('followedBy'):update_job(j['id'],gid=d['followedBy'][0]);continue
                values={'status':d['status'],'total':int(d.get('totalLength',0)),'completed':int(d.get('completedLength',0)),'speed':int(d.get('downloadSpeed',0))}
                if d.get('errorMessage'):values['error']=d['errorMessage']
                name=d.get('bittorrent',{}).get('info',{}).get('name')
                if name:values['title']=name
                update_job(j['id'],**values)
            except Exception as e:update_job(j['id'],status='error',error=str(e))
    with LOCK:return sorted(state['jobs'].values(),key=lambda j:j['createdAt'],reverse=True)[:100]

def job_files(id):
    if not re.fullmatch('[a-f0-9]{32}',id):raise ValueError('Invalid job ID')
    folder=DATA/'downloads'/id
    result=[]
    for f in folder.rglob('*'):
        if f.is_file() and not f.is_symlink() and folder.resolve() in f.resolve().parents and f.name not in ('process.log','result.json','bili_novel.log') and f.suffix not in ('.part','.ytdl','.aria2','.torrent','.json','.temp'):
            result.append({'name':f.name,'path':str(f.relative_to(folder)),'size':f.stat().st_size})
    return result[:1000]

def watch_loop():
    while True:
        try:
            refresh_jobs()
            current=datetime.datetime.now(ZoneInfo('America/Los_Angeles'));day=current.date().isoformat()
            if current.hour>=8:
                with LOCK: watches=list(state['watch'].items())
                for key,w in watches:
                    if w.get('day')==day:continue
                    try:
                        d=novel_call('catalog',w['url']);signature=hashlib.sha256(json.dumps(d['chapters'],sort_keys=True).encode()).hexdigest()
                        job=None
                        with LOCK:
                            prior=state['jobs'].get(w.get('jobId'),{})
                            changed=signature!=w.get('signature')
                        if (changed or prior.get('status') in ('error','interrupted','cancelled')) and prior.get('status') not in ('queued','running','active'):
                            job=submit({'kind':'novel','url':w['url']})['id']
                        with LOCK:
                            w.update(day=day,checkedAt=now(),signature=signature,title=d['title'],error=None)
                            if job:w['jobId']=job
                            save()
                    except Exception as e:
                        with LOCK:w.update(error=str(e),checkedAt=now(),day=day);save()
        except Exception as e: print('Background check:',e,flush=True)
        time.sleep(60)

class Handler(BaseHTTPRequestHandler):
    server_version='MediaVault/1.0'
    def log_message(self,fmt,*args):
        # Download ticket URLs must not be written to logs.
        print(self.command,urllib.parse.urlsplit(self.path).path,flush=True)
    def headers_common(self,status,ctype='application/json'):
        self.send_response(status);self.send_header('Content-Type',ctype);self.send_header('Cache-Control','no-store');self.send_header('X-Content-Type-Options','nosniff')
        origin=self.headers.get('Origin','')
        if origin in ORIGINS:self.send_header('Access-Control-Allow-Origin',origin);self.send_header('Vary','Origin')
    def respond(self,value,status=200):
        data=json.dumps(value,ensure_ascii=False).encode();self.headers_common(status);self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
    def authorized(self):
        origin=self.headers.get('Origin','')
        if origin and origin not in ORIGINS:self.respond({'error':'Origin not allowed'},403);return False
        if not hmac.compare_digest(self.headers.get('Authorization',''), 'Bearer '+TOKEN):self.respond({'error':'Invalid engine token'},401);return False
        return True
    def do_OPTIONS(self):
        if self.headers.get('Origin') not in ORIGINS:self.respond({'error':'Origin not allowed'},403);return
        self.headers_common(204);self.send_header('Access-Control-Allow-Methods','GET,POST,OPTIONS');self.send_header('Access-Control-Allow-Headers','Authorization,Content-Type');self.send_header('Access-Control-Allow-Private-Network','true');self.end_headers()
    def do_GET(self):
        path=urllib.parse.urlsplit(self.path);query=urllib.parse.parse_qs(path.query)
        if path.path=='/download':self.download(query.get('ticket',[''])[0]);return
        if not self.authorized():return
        try:
            if path.path=='/health':self.respond({'ok':True,'version':1,'freeBytes':shutil.disk_usage(DATA).free,'capabilities':{'ytDlp':bool(shutil.which('yt-dlp')),'novel':bool(shutil.which('novel-adapter')),'aria2':bool(shutil.which('aria2c'))}})
            elif path.path=='/jobs':self.respond({'jobs':refresh_jobs()})
            elif path.path=='/jobs/files':
                id=query.get('id',[''])[0]
                if state['jobs'].get(id,{}).get('status')!='complete':raise ValueError('Job is not complete')
                self.respond({'files':job_files(id)})
            elif path.path=='/watch':self.respond({'items':list(state['watch'].values())})
            else:self.respond({'error':'Not found'},404)
        except Exception as e:self.respond({'error':str(e)},400)
    def do_POST(self):
        if not self.authorized():return
        try:
            length=int(self.headers.get('Content-Length','0'))
            if not 0<length<=32768:raise ValueError('Invalid request size')
            body=json.loads(self.rfile.read(length));path=urllib.parse.urlsplit(self.path).path
            if path=='/resolve':self.respond(resolve(body['url']))
            elif path=='/novel/catalog':self.respond(novel_call('catalog',body['url']))
            elif path=='/novel/chapter':self.respond(novel_call('chapter',body['url'],int(body['index'])))
            elif path=='/jobs':self.respond(submit(body),202)
            elif path=='/jobs/cancel':
                id=body['id']
                with LOCK:
                    j=state['jobs'][id]
                    if j['status'] in ('complete','error','cancelled','interrupted'):raise ValueError('Job already ended')
                    update_job(id,status='cancelled')
                    p=PROCESSES.get(id)
                    if p and p.poll() is None:os.killpg(p.pid,signal.SIGTERM)
                    if j.get('gid'):
                        try:rpc('forceRemove',j['gid'])
                        except Exception:pass
                self.respond({'ok':True})
            elif path=='/watch':
                url=novel_url(body['url']);key=hashlib.sha256(url.encode()).hexdigest()
                with LOCK:
                    if body.get('remove'):state['watch'].pop(key,None)
                    else:
                        if len(state['watch'])>=20 and key not in state['watch']:raise ValueError('Watchlist limit: 20')
                        state['watch'].setdefault(key,{'url':url,'createdAt':now()})
                    save()
                self.respond({'ok':True})
            elif path=='/download-ticket':
                id=body['id'];relative=body['path']
                if state['jobs'].get(id,{}).get('status')!='complete':raise ValueError('Job is not complete')
                match=next((f for f in job_files(id) if f['path']==relative),None)
                if not match:raise ValueError('File not found')
                ticket=secrets.token_urlsafe(32)
                with LOCK:
                    for k,v in list(TICKETS.items()):
                        if v['expires']<time.time():TICKETS.pop(k,None)
                    TICKETS[ticket]={'path':DATA/'downloads'/id/relative,'expires':time.time()+300}
                self.respond({'ticket':ticket})
            else:self.respond({'error':'Not found'},404)
        except Exception as e:self.respond({'error':str(e)},400)
    def download(self,ticket):
        with LOCK:item=TICKETS.get(ticket)
        if not item or item['expires']<time.time():self.respond({'error':'Download link expired'},401);return
        path=item['path'];size=path.stat().st_size
        self.headers_common(200,mimetypes.guess_type(path.name)[0] or 'application/octet-stream')
        self.send_header('Content-Disposition',"attachment; filename*=UTF-8''"+urllib.parse.quote(path.name));self.send_header('Content-Length',str(size));self.end_headers()
        try:
            with path.open('rb') as f:shutil.copyfileobj(f,self.wfile,1024*1024)
        except (BrokenPipeError,ConnectionResetError):pass

def main():
    aria=None
    if shutil.which('aria2c'):
        aria=subprocess.Popen(['aria2c','--enable-rpc','--rpc-listen-all=false','--rpc-listen-port=6800','--rpc-secret='+RPC_TOKEN,'--enable-dht=true','--seed-time=0','--max-concurrent-downloads=3','--console-log-level=warn'],stdout=subprocess.DEVNULL)
    print('Media Vault engine: http://localhost:8789\nAccess token: '+TOKEN,flush=True)
    print('Token saved to '+str(TOKEN_FILE)+'. Downloads remain on this host.',flush=True)
    threading.Thread(target=watch_loop,daemon=True).start()
    try:ThreadingHTTPServer((os.environ.get('MEDIA_BIND','127.0.0.1'),int(os.environ.get('MEDIA_PORT','8789'))),Handler).serve_forever()
    finally:
        if aria:aria.terminate()
if __name__=='__main__':main()
