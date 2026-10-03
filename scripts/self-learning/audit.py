"""Content coverage, embedded Python examples, and independent numeric checks."""
import json,math,subprocess,tempfile,statistics
from pathlib import Path
root=Path(__file__).resolve().parents[2]/'apps/self-learning/data'
read=lambda f:json.loads((root/f).read_text())
manifest=read('manifest.json');sources=read('sources.json');ids={s['id'] for s in sources}
assert len(manifest['courses'])==9 and len(sources)==len(ids)
assert all(s['url'].startswith('https://') and s['checkedAt']=='2026-10-02' for s in sources)
count=0;total=0;codes=0;figures={}
for meta in manifest['courses']:
 c=read(meta['file']);count+=len(c['lessons']);amount=[]
 for l in c['lessons']:
  assert l.get('orientation',{}).get('intro') and l['orientation']['nextQuestion'],l['id']
  chapter_figures=[f for s in l['sections'] for f in s.get('figures',[])]
  assert chapter_figures,l['id']+' missing diagram'
  for f in chapter_figures:
   assert f['id'] not in figures,f['id']
   figures[f['id']]=f
   assert f['kind'] in {'flow','compare','matrix','line','bar','step','wave'}
   assert f['alt'] and f['caption'] and f['model']
   assert f['sourceIds'] and all(i in ids for i in f['sourceIds'])
   if f.get('series'):
    assert f['xLabel'] and f['yLabel']
    assert all(math.isfinite(x) for x in f['x'])
    assert all(a<b for a,b in zip(f['x'],f['x'][1:]))
    assert all(len(s['values'])==len(f['x']) and all(math.isfinite(v) for v in s['values']) for s in f['series'])
   elif f['kind']=='matrix':assert all(len(row)==len(f['headers']) for row in f['rows'])
   elif f['kind']=='wave':assert f['waveMode'] in {'parameters','harmonics','phase','alias'}
   else:assert len(f['nodes'])>=2 and all(n['label'] and n['detail'] for n in f['nodes'])
  assert len(l['sections'])>=4 and all(len(s['paragraphs'])>=2 for s in l['sections'])
  assert len(l['walkthrough']['steps'])==3 and l['check']['answer']
  w=l['walkthrough'];check=l['check']
  assert l['guide']['question'] and len(l['guide']['terms'])>=2
  assert all(t['term'] and len(t['definition'])>=12 for t in l['guide']['terms'])
  assert all(len(s['keyPoint'])>=12 for s in l['sections'])
  computed=sum(len(str(v)) for v in l['body']+[p for s in l['sections'] for p in s['paragraphs']]+[s['keyPoint'] for s in l['sections']]+[v for s in l['sections'] for v in (list(s['formula'].values()) if s.get('formula') else [])]+[l['guide']['question']]+[t['definition'] for t in l['guide']['terms']]+[l['example'],l['pitfall']]+l['steps']+[l['criteria'],l['answer'],w['setup']]+w['steps']+[w['result'],check['question'],check['answer']])
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
assert count==120 and total==manifest['teachingCharacters']
assert len(figures)==manifest['figureCount']==144
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
# Independent new-course calculations: electrical units, monthly economics,
# exact sample relationships, physical exposure and decoded image memory.
assert near((3.3-2.0)/270*1000,4.814814815)
assert near(((3.3-2.0)/270)**2*270,0.006259259,1e-9)
assert near(3.3/4095*1000,0.80586)
assert int.from_bytes(bytes([1,2]),'big')==258
assert int.from_bytes(bytes([1,2]),'little')==513
assert int.from_bytes(bytes([255,254]),'big',signed=True)==-2
assert near((100*2+1*58)/60,4.3)
assert near(1000/4.3/24,9.68992248)
assert near((100*2+1*28)/30,7.6)
assert 15-4-(10/60*30)==6
assert math.ceil(1000/6)==167 and 100*6-1000==-400
assert near(20*math.log10(0.5),-6.020599913,1e-9)
assert near(20*math.log10(0.25),-12.041199827,1e-9)
assert 48000/2048==23.4375
assert -12+(-4-(-12))/4==-10
for f,expected in [(6000,2000),(7000,1000),(9000,1000),(8000,0)]:
 folded=abs((f+4000)%8000-4000)
 assert folded==expected
assert near((4/8)**2*(125/250),1/8,1e-9)
assert (4/8)**2*(125/250)*(800/100)==1
assert near(4000*3000*4/2**20,45.7763671875,1e-9)
assert near(1/math.sqrt(4),0.5,1e-9)
# Check stored graph values against their declared models independently.
getgraph=lambda prefix:next(f for key,f in figures.items() if key.startswith(prefix) and f.get('series'))
for prefix,model in [
 ('games-05',lambda n:100*(1-math.comb(n-2,5)/math.comb(n,5))),
 ('games-06',lambda r:100/(1-r/100)),
 ('games-08',lambda n:100*(1-0.95**n)),
 ('games-10',lambda d:math.ceil(20/d)),
 ('finance-07',lambda y:5/(1+y/100)+105/(1+y/100)**2),
 ('finance-12',lambda s:max(s-100,0)-max(s-110,0)-4),
 ('hardware-07',lambda t:(100*t+1*(60-t))/60),
 ('product-05',lambda n:6*n-1000),
 ('audio-03',lambda a:20*math.log10(a))]:
 f=getgraph(prefix)
 assert all(near(y,model(x),1e-8) for x,y in zip(f['x'],f['series'][0]['values'])),prefix
assert manifest['referenceCount']==len(sources)
assert manifest['termExplanations']==sum(len(l['guide']['terms']) for m in manifest['courses'] for l in read(m['file'])['lessons'])
assert manifest['sectionKeyPoints']==sum(len(l['sections']) for m in manifest['courses'] for l in read(m['file'])['lessons'])
print(f'PASS: {count} chapters, {total} teaching characters, {len(sources)} references, {codes} executable labs, {len(figures)} diagram specifications, independent numeric checks.')
