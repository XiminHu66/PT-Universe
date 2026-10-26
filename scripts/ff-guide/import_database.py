#!/usr/bin/env python3
"""Refresh verified public game-record snapshots. Keeps the previous output on any failure.

python scripts/ff-guide/import_database.py --cache-dir /tmp/ff-guide-cache --output /tmp/ff-guide-database.json
Requires curl and beautifulsoup4; never executes source-site JavaScript.
"""
import argparse
import concurrent.futures
import json
import os
from pathlib import Path
import re
import runpy
import subprocess
import tempfile

BASE_URLS={
 'codex-characters':'https://ffresonancecodex.com/characters',
 'codex-visions':'https://ffresonancecodex.com/visions',
 'codex-espers':'https://ffresonancecodex.com/espers',
 'codex-skills':'https://ffresonancecodex.com/skills',
 'codex-equipment':'https://ffresonancecodex.com/equipment',
 'codex-passives':'https://ffresonancecodex.com/passives',
 'codex-items':'https://ffresonancecodex.com/items',
 'codex-world':'https://ffresonancecodex.com/world',
 'atma-characters':'https://atma.gg/final-fantasy-resonance/characters',
 'atma-visions':'https://atma.gg/final-fantasy-resonance/visions',
 'atma-espers':'https://atma.gg/final-fantasy-resonance/espers',
 'atma-enemies':'https://atma.gg/final-fantasy-resonance/enemies',
 'atma-skills':'https://atma.gg/final-fantasy-resonance/skills',
 'atma-quests':'https://atma.gg/final-fantasy-resonance/quests',
}

def main():
 parser=argparse.ArgumentParser(description=__doc__)
 parser.add_argument('--cache-dir',type=Path,required=True)
 parser.add_argument('--output',type=Path,required=True)
 parser.add_argument('--use-cache',action='store_true',help='Keep previously downloaded pages; fetch missing pages only.')
 args=parser.parse_args()
 try:from bs4 import BeautifulSoup
 except ImportError:raise SystemExit('Install beautifulsoup4 before refreshing.')
 root=args.cache_dir.resolve();raw=root/'raw';raw.mkdir(parents=True,exist_ok=True)
 def fetch(item):
  name,url=item;dest=raw/(name+'.html')
  if args.use_cache and dest.exists():return name
  temporary=dest.with_suffix('.download')
  result=subprocess.run(['curl','-fsSL','--max-time','40','-A','Mozilla/5.0',url,'-o',str(temporary)],capture_output=True,text=True)
  if result.returncode:
   temporary.unlink(missing_ok=True)
   raise RuntimeError(f'{name}: source request failed ({result.returncode}); previous page retained')
  text=temporary.read_text()
  if '<html' not in text.lower() or '<main' not in text.lower():
   temporary.unlink(missing_ok=True);raise RuntimeError(f'{name}: unexpected response; previous page retained')
  os.replace(temporary,dest);return name
 with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
  for name in pool.map(fetch,BASE_URLS.items()):print('Fetched',name,flush=True)
 # RSC streams are JSON strings inside script tags, parsed as data (never evaluated).
 def walk(obj):
  if isinstance(obj,dict):
   if isinstance(obj.get('baseData'),dict):yield obj['baseData']
   for v in obj.values():yield from walk(v)
  elif isinstance(obj,list):
   for v in obj:yield from walk(v)
 for name in BASE_URLS:
  if not name.startswith('codex-') or name=='codex-world':continue
  found=[]
  for quoted in re.findall(r'rsc\.push\(("(?:[^"\\]|\\.)*")\)',(raw/(name+'.html')).read_text()):
   try:found.extend(walk(json.loads(json.loads(quoted).split(':',1)[1])))
   except (ValueError,IndexError):continue
  if not found:raise RuntimeError(f'{name}: source schema changed; previous output retained')
  (root/(name+'.json')).write_text(json.dumps(found[-1],ensure_ascii=False))
 b=BeautifulSoup((raw/'atma-enemies.html').read_text(),'html.parser')
 links={}
 for card in b.select('[data-enemy-card]'):
  a=card.find('a');href=a.get('href','') if a else ''
  if re.fullmatch(r'/final-fantasy-resonance/enemies/\d+',href):links['enemy-'+href.rsplit('/',1)[-1]]='https://atma.gg'+href
 if len(links)<596:raise RuntimeError('Enemy index unexpectedly shrank; previous output retained')
 with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
  for i,name in enumerate(pool.map(fetch,links.items())):
   if i%50==0:print(f'Enemy detail {i+1}/{len(links)}',flush=True)
 os.environ['FF_GUIDE_CACHE_DIR']=str(root)
 runpy.run_path(str(Path(__file__).with_name('build_database.py')),run_name='__main__')
 data=json.loads((root/'database.json').read_text());counts=data['meta']['counts']
 assert counts['characters']==8 and counts['visions']==26 and counts['espers']==9
 assert counts['skills']>=798 and counts['equipment']>=454 and counts['items']>=103
 assert counts['enemies']>=596 and data['meta']['enemyDetails']==counts['enemies']
 assert len({e['id'] for e in data['entries']})==len(data['entries'])
 assert all(e.get('title') and e.get('sourceUrl') and e.get('sourceIds') for e in data['entries'])
 args.output.parent.mkdir(parents=True,exist_ok=True)
 with tempfile.NamedTemporaryFile('w',dir=args.output.parent,delete=False,encoding='utf-8') as handle:
  handle.write(json.dumps(data,ensure_ascii=False,separators=(',',':'))+'\n');temporary=Path(handle.name)
 os.replace(temporary,args.output)
 print(json.dumps({'output':str(args.output),'counts':counts,'enemyDetails':data['meta']['enemyDetails']},ensure_ascii=False))

if __name__=='__main__':main()
