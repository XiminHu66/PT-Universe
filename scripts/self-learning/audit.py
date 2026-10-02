"""Content coverage, embedded Python examples, and independent numeric checks."""
import json,math,subprocess,tempfile,statistics
from pathlib import Path
root=Path(__file__).resolve().parents[2]/'apps/self-learning/data'
read=lambda f:json.loads((root/f).read_text())
manifest=read('manifest.json');sources=read('sources.json');ids={s['id'] for s in sources}
assert len(manifest['courses'])==5 and len(sources)==len(ids)
assert all(s['url'].startswith('https://') and s['checkedAt']=='2026-10-02' for s in sources)
count=0;total=0;codes=0
for meta in manifest['courses']:
 c=read(meta['file']);count+=len(c['lessons']);amount=[]
 for l in c['lessons']:
  assert len(l['sections'])>=4 and all(len(s['paragraphs'])>=2 for s in l['sections'])
  assert len(l['walkthrough']['steps'])==3 and l['check']['answer']
  w=l['walkthrough'];check=l['check']
  computed=sum(len(str(v)) for v in l['body']+[p for s in l['sections'] for p in s['paragraphs']]+[l['example'],l['pitfall']]+l['steps']+[l['criteria'],l['answer'],w['setup']]+w['steps']+[w['result'],check['question'],check['answer']])
  assert computed==l['textCharacters'] and computed>=1100,l['id']
  assert all(r['id'] in ids and r['section'] for r in l['refs'])
  amount.append(computed)
  if l.get('code'):
   # Only the trusted, checked-in tutorial code; never user import data.
   with tempfile.TemporaryDirectory() as tmp:
    p=Path(tmp)/'lab.py';p.write_text(l['code'])
    r=subprocess.run(['python3',str(p)],cwd=tmp,capture_output=True,text=True,timeout=10)
    assert r.returncode==0,(l['id'],r.stderr)
   codes+=1
 assert sum(amount)==meta['teachingCharacters']==c['teachingCharacters']
 total+=sum(amount)
 print(c['title'],len(amount),'chapters;',min(amount),'-',max(amount),'characters')
assert count==80 and total==manifest['teachingCharacters']
# Independent calculations for numbers in the teaching, not rendered-string mirrors.
near=lambda x,y,tol=0.005:abs(x-y)<tol
assert near(1-math.comb(18,5)/math.comb(20,5),0.447368421,1e-9)
assert near(1-math.comb(23,5)/math.comb(25,5),0.366666667,1e-9)
assert near(1-0.95**20,0.641514078,1e-9)
assert near((0.91**0.5-1)*100,-4.6061)
assert near((1.08**0.5-1)*100,3.9230)
assert near(365/(660/150),82.9545)
assert near(5/1.1+105/1.1**2,91.3223)
pv=sum(v/1.1**t for t,v in enumerate([10,11,12],1))
assert near(pv,27.1976)
ev=pv+153/1.1**3
assert near(ev,142.1488)
assert f'{(ev-30+10)/10:.2f}'=='12.21'
for price,expected in [(90,-4),(105,1),(120,6)]:
 payoff=max(price-100,0)-max(price-110,0)-4
 assert payoff==expected
assert 10*(1+0.2*(2-1))==12 and 100/(1-0.2)==125
print(f'PASS: {count} chapters, {total} teaching characters, {len(sources)} references, {codes} executable labs, independent numeric checks.')
