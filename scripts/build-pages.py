"""Publish only browser assets and public snapshots; exclude source runtimes and CI evidence."""
from pathlib import Path
import shutil, json, subprocess, os
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'_site'
EXT={'.html','.css','.js','.mjs','.json','.webmanifest','.xml','.svg','.png','.jpg','.jpeg','.webp','.gif','.ico','.woff','.woff2','.ttf','.txt','.pdf','.mp3','.ogg','.wav','.wasm'}
SKIP={'node_modules','__pycache__','.git','.github','test-results','tests','screenshots','vendor','scraper','scripts','.venv','build','dist'}
if OUT.exists():shutil.rmtree(OUT)
OUT.mkdir()
def copy(p):
    rel=p.relative_to(ROOT)
    if p.is_file() and p.suffix.lower() in EXT and not any(x in SKIP for x in rel.parts):
        target=OUT/rel;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,target)
for p in ROOT.iterdir():
    if p.is_file():copy(p)
for name in ['apps','assets','styles','fonts','images','data','licenses']:
    directory=ROOT/name
    if directory.exists():
        for p in directory.rglob('*'):copy(p)
(OUT/'.nojekyll').touch()
revision=subprocess.run(['git','rev-parse','HEAD'],cwd=ROOT,capture_output=True,text=True)
sha=revision.stdout.strip() if revision.returncode==0 else os.environ.get('GITHUB_SHA','local-preview')
(OUT/'deployment.json').write_text(json.dumps({'sourceCommit':sha,'pipeline':'shared-pages-v2'})+'\n')
files=[p for p in OUT.rglob('*') if p.is_file()]
total=sum(p.stat().st_size for p in files)
assert total<80*1024**2,f'Unexpected static bundle growth: {total} bytes'
assert (OUT/'index.html').exists()
print(f'Pages distribution: {len(files)} files, {total/1024**2:.2f} MiB')
