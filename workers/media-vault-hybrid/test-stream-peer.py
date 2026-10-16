# Real Agent transport against local workerd. Only source HTTP/file I/O is a tiny
# fixture; no real hosts, credentials, user files, media sources or cloud grants.
import asyncio
import importlib.util
import io
import json
import os
from pathlib import Path
import sys
import tempfile
from unittest.mock import patch
os.environ.update(MEDIA_CLOUD_URL='https://fixture.workers.dev',MEDIA_AGENT_TOKEN='a'*64,MEDIA_TOKEN='b'*64)
spec=importlib.util.spec_from_file_location('runtime_agent',str(Path(os.environ['MEDIA_AGENT_SOURCE'])/'agent.py'))
agent=importlib.util.module_from_spec(spec)
with patch.object(Path,'mkdir'),patch.object(Path,'chmod'):spec.loader.exec_module(agent)
with tempfile.TemporaryDirectory() as directory:
    agent.ROOT=Path(directory);agent.STATE=Path(directory)/'agent'/'hybrid-state.json'
    agent.STATE.parent.mkdir();(agent.ROOT/'adapter'/'generated').mkdir(parents=True)
    cid='a'*24;relative='generated/'+cid+'.epub';payload=b'PK\x03\x04'
    (agent.ROOT/'adapter'/relative).write_bytes(payload)
    agent.STATE.write_text(json.dumps({cid:{'local_id':'f'*24,'final':True,'status':'complete'}}))
    def local(method,path,data=None):
        if method=='GET' and path.startswith('/jobs/files?'):return {'files':[{'path':relative,'size':len(payload)}]}
        if method=='POST' and path=='/download-ticket':return {'ticket':'local-fixture'}
        raise AssertionError('Unexpected source I/O')
    agent.local=local;agent.urlopen=lambda *a,**k:io.BytesIO(payload)
    agent.WS_URL=sys.argv[1]
    asyncio.run(agent.websocket_loop())
