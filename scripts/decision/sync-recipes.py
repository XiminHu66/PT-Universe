"""Snapshot the same complete HowToCook dishes collection used by Food Orbit."""
import argparse,json,re,subprocess
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('source',type=Path);args=p.parse_args()
root=Path(__file__).resolve().parents[2];source=args.source.resolve()
sha=subprocess.check_output(['git','-C',str(source),'rev-parse','HEAD'],text=True).strip()
date=subprocess.check_output(['git','-C',str(source),'show','-s','--format=%cI','HEAD'],text=True).strip()
recipes=[]
for f in sorted((source/'dishes').rglob('*.md')):
 path=f.relative_to(source).as_posix()
 if re.search(r'README|template|CONTRIBUT',path,re.I):continue
 md=f.read_text(encoding='utf-8');match=re.search(r'^#\s+(.+)$',md,re.M)
 recipes.append({'path':path,'name':re.sub(r'的做法$','',match.group(1).strip()) if match else f.stem,'md':md})
if len(recipes)<300:raise SystemExit(f'Incomplete recipe collection: {len(recipes)}; leaving existing snapshot intact')
lic=(source/'LICENSE').read_text()
if 'public domain' not in lic:raise SystemExit('Source license changed; review before replacing snapshot')
data={'version':1,'source':'https://github.com/Anduin2017/HowToCook','sourceCommit':sha,'updatedAt':date,'license':'Unlicense','count':len(recipes),'recipes':recipes}
out=root/'apps/meal-orbit/data';out.mkdir(parents=True,exist_ok=True)
(out/'recipes.json').write_text(json.dumps(data,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')
(out/'HOWTOCOOK-LICENSE.txt').write_text(lic,encoding='utf-8')
print(f'Synced all {len(recipes)} recipes at {sha}; {len(json.dumps(data,ensure_ascii=False))} characters')
