"""Update the reader embedded in the existing BiliPack app, without new services."""
from pathlib import Path
import sys,json
server=Path(sys.argv[1]);root=Path(__file__).resolve().parents[2];s=server.read_text()
module=(root/'services/bilinovel-reader/reader.mjs').read_text()
module='\n'.join(line for line in module.splitlines() if not line.startswith('import '))
assets={p.name:p.read_text() for p in (root/'services/bilinovel-reader/public').iterdir() if p.is_file()}
module=module.replace("const assets=join(dirname(fileURLToPath(import.meta.url)),'public');",'const assets=READER_ASSETS;').replace('bytes=await readFile(join(assets,name))','bytes=Buffer.from(assets[name])')
embedded='/* pt-bilinovel-reader-v3 */\nconst READER_ASSETS='+json.dumps(assets,ensure_ascii=False)+';\n'+module+'\n\n'
anchor='export async function createApp('
assert s.count(anchor)==1
if '/* pt-bilinovel-reader-v' in s:s=s[:s.index('/* pt-bilinovel-reader-v')]+s[s.index(anchor):]
s=s.replace(anchor,embedded+anchor)
if "import {dirname,join} from 'node:path';" not in s:s="import {dirname,join} from 'node:path';\n"+s
anchor='  const server=http.createServer(async(req,res)=>{'
reader="  const reader=createReader({data,origin,token,control:new BrowserControl({targetFile:path.join(data,'reader-target.json'),scoped:true}),admit:async()=>{if(isBusy())throw Error('小说下载正在使用浏览器，请稍后打开新章节；已缓存的章节仍可阅读');const d=await storage();if(!d.work.allowed||!d.root.allowed)throw Error('磁盘已到15%保留边界，暂不创建阅读会话');}});"
import re
s,n=re.subn(r"  const reader=createReader\([^\n]+\);",lambda _:reader,s)
if not n:s=s.replace(anchor,reader+'\n'+anchor)
anchor="      if(req.method==='POST'&&!authorized(req))return json(res,403,{error:'请刷新页面后重试'});"
if 'if(await reader(req,res,url))return;' not in s:s=s.replace(anchor,anchor+'\n      if(await reader(req,res,url))return;')
anchor='  return {server,browser,persist,fileManager,cleanup};'
assert s.count(anchor)==1
if "server.on('close',()=>{void reader.close()})" not in s:s=s.replace(anchor,"  server.on('close',()=>{void reader.close()});\n"+anchor)
server.write_text(s)
