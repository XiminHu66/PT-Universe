"""Embed the reader into an existing BiliPack application update.

No infrastructure or deployment configuration is changed. This produces one
ordinary application source file compatible with the existing release bundle.
"""
from pathlib import Path
import sys,json
server=Path(sys.argv[1]);root=Path(__file__).resolve().parents[2]
s=server.read_text()
assert '/* pt-bilinovel-reader-v' not in s,'Reader already assembled'
module=(root/'services/bilinovel-reader/reader.mjs').read_text()
module=module[module.index('// Legacy endpoint'):]
embedded='/* pt-bilinovel-reader-v2-local */\n'+module+'\n'
anchor='export async function createApp('
assert s.count(anchor)==1
s=s.replace(anchor,embedded+'\n'+anchor)
s="import {dirname,join} from 'node:path';\n"+s
anchor='  const server=http.createServer(async(req,res)=>{'
assert s.count(anchor)==1
s=s.replace(anchor,"  const reader=createReader({data,origin,token,control:new BrowserControl({targetFile:path.join(data,'reader-target.json'),scoped:true})});\n"+anchor)
anchor="      if(req.method==='POST'&&!authorized(req))return json(res,403,{error:'请刷新页面后重试'});"
assert s.count(anchor)==1
s=s.replace(anchor,anchor+'\n      if(await reader(req,res,url))return;')
anchor='  return {server,browser,persist,fileManager,cleanup};'
assert s.count(anchor)==1
s=s.replace(anchor,"  server.on('close',()=>{void reader.close()});\n"+anchor)
server.write_text(s)
