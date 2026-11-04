"""Add a bounded reader to the current BiliPack server; preserve all other routes."""
from pathlib import Path
import sys
p=Path(sys.argv[1]);s=p.read_text()
if "from './reader.mjs'" not in s:
 s="import {createReader} from './reader.mjs';\n"+s
 anchor='  const server=http.createServer(async(req,res)=>{'
 assert s.count(anchor)==1,'Unique live HTTP handler required'
 s=s.replace(anchor,"  const reader=createReader({data,origin,token,control:new BrowserControl({targetFile:path.join(data,'reader-target.json'),scoped:true})});\n"+anchor)
 anchor="      if(req.method==='POST'&&!authorized(req))return json(res,403,{error:'请刷新页面后重试'});"
 assert s.count(anchor)==1,'Parent CSRF boundary changed'
 s=s.replace(anchor,anchor+'\n      if(await reader(req,res,url))return;')
 anchor='  return {server,browser,persist,fileManager,cleanup};'
 assert s.count(anchor)==1
 s=s.replace(anchor,"  server.on('close',()=>{void reader.close()});\n"+anchor)
p.write_text(s)
