"""Small generated packager fixtures only; no live source, cookie or media call."""
import hashlib,json,sys,struct,zlib
from pathlib import Path
sys.path.insert(0,str(Path(sys.argv[1]).resolve()))
from builders import epub,cbz
root=Path(sys.argv[2]);root.mkdir(parents=True,exist_ok=True)
def chunk(tag,data):return struct.pack('>I',len(data))+tag+data+struct.pack('>I',zlib.crc32(tag+data)&0xffffffff)
png=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',8,12,8,2,0,0,0))+chunk(b'IDAT',zlib.compress((b'\0'+b'\x78\xc8\xff'*8)*12))+chunk(b'IEND',b'')
manifest={'scope':'windows-ci-local-fixtures-only','files':[]}
for i,(name,kind,raw) in enumerate([
 ('小说 测试.epub','epub',epub('中文测试',[{'title':'第一章','text':'第一段。\n第二段。'}])),
 ('中文 漫画.cbz','cbz',cbz('中文测试',[{'data':png,'mime':'image/png'}],'CC0 generated test fixture'))]):
 (root/name).write_bytes(raw);manifest['files'].append({'id':str(i+1)*24,'label':name,'name':name,'kind':kind,'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()})
(root/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False),encoding='utf-8')
