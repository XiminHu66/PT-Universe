"""Published UI tests, with explicit fault injection; branch API fixtures come from live API tests."""
import json,threading,functools,os,copy
from datetime import datetime,timezone
from pathlib import Path
from urllib.parse import urlparse,parse_qs
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'test-results/labs';OUT.mkdir(parents=True,exist_ok=True)
base=os.getenv('LABS_BASE_URL');server=None;production=bool(base)
if not base:
 handler=functools.partial(SimpleHTTPRequestHandler,directory=str(ROOT))
 server=ThreadingHTTPServer(('127.0.0.1',8765),handler);threading.Thread(target=server.serve_forever,daemon=True).start();base='http://127.0.0.1:8765/'
pages=['thesis-lab','earnings-dojo','eastside-weekend']
with sync_playwright() as p:
 browser=p.chromium.launch();context=browser.new_context(viewport={'width':1280,'height':900},accept_downloads=True)
 if not production:
  def api_fixture(route):
   url=route.request.url;kind='financial' if '/training/' in url else 'search' if '/search?' in url else 'prices'
   value=json.loads((ROOT/'test-results/research'/f'{kind}.json').read_text())
   if kind=='financial':
    # An explicit fixture for UI interaction; upstream refresh semantics are separately tested live.
    value['ticker']=parse_qs(urlparse(url).query)['symbol'][0];value['updatedAt']=datetime.now(timezone.utc).isoformat()
   route.fulfill(status=200,content_type='application/json',headers={'access-control-allow-origin':'*'},body=json.dumps(value))
  context.route('**/api/pc/**',api_fixture);context.route('**/api/training/**',api_fixture)
 page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 for app in pages:
  response=page.goto(base+'apps/'+app+'/',wait_until='networkidle',timeout=60000);assert response.status==200
  page.wait_for_selector('#health details',timeout=40000)
  if app=='thesis-lab':
   assert page.locator('#company option').count()>=6
   page.locator('#newThesis').click();page.locator('[name="title"]').fill('验证现金流 <script>window.BAD=1</script>')
   page.locator('[name="reason"]').fill('验证保存与复盘');page.locator('[name="metric"]').select_option('fcf');page.locator('[name="threshold"]').fill('0')
   page.locator('#editor button[type="submit"]').click();page.locator('[data-review]').first.click()
   page.reload(wait_until='networkidle');assert '验证现金流' in page.locator('#theses').inner_text();assert page.evaluate('window.BAD===undefined')
  elif app=='earnings-dojo':
   page.wait_for_function("document.querySelector('#refresh')&&!document.querySelector('#refresh').disabled",timeout=45000)
   assert '已重新查询' in page.locator('#liveStatus').inner_text(),page.locator('#liveStatus').inner_text()
   first_status=page.locator('#liveStatus').inner_text()
   with page.expect_response(lambda r:'/api/training/financials?' in r.url) as refreshed:page.locator('#refresh').click()
   assert refreshed.value.status==200
   page.wait_for_function("!document.querySelector('#refresh').disabled",timeout=45000)
   assert '已重新查询' in page.locator('#liveStatus').inner_text()
   assert page.locator('#case option').count()>=12
   for q in page.locator('[data-question]').all():q.select_option(index=1)
   page.locator('[name="reason"]').fill('先核实现金转换和股数变化');page.locator('#answer button[type="submit"]').click()
   assert page.locator('.rating').count()==1;assert '下一季' in page.locator('#reveal').inner_text() or '最新季度' in page.locator('#reveal').inner_text()
   old_case=page.locator('#case').input_value();page.locator('#next').click();assert page.locator('#case').input_value()!=old_case
  elif app=='eastside-weekend':
   page.locator('#range').select_option('45')
   for city in ['Lynnwood','Everett','Kent','Seattle']:
    page.locator('#city').select_option(label=city);assert page.locator('#events .card').count()>=1,city+' has no real events'
   page.locator('#city').select_option('');page.locator('[data-save]').first.click()
   with page.expect_download() as dl:page.locator('#calendar').click()
   target=OUT/'events.ics';dl.value.save_as(target);assert 'BEGIN:VEVENT' in target.read_text()
   page.locator('[data-map]').first.click();assert page.locator('#selected h3').count()==1
  page.screenshot(path=str(OUT/(app+'-desktop.png')),full_page=False);page.set_viewport_size({'width':390,'height':844})
  page.screenshot(path=str(OUT/(app+'-mobile.png')),full_page=False)
  assert page.evaluate("document.querySelector('main').scrollWidth<=window.innerWidth+2"),app+' mobile overflow'
  page.set_viewport_size({'width':1280,'height':900})
  datafile='apps/eastside-weekend/data/events.json' if app=='eastside-weekend' else 'apps/thesis-lab/data/financials.json'
  fixture=json.loads((ROOT/datafile).read_text());fixture['updatedAt']='2000-01-01T00:00:00Z'
  for source in fixture.get('sources',[]):source['lastSuccessAt']='2000-01-01T00:00:00Z'
  pattern='**/'+datafile.split('/')[-1]
  def snapshot(route):route.fulfill(status=200,content_type='application/json',body=json.dumps(fixture))
  def failure(route):route.fulfill(status=503,content_type='application/json',headers={'access-control-allow-origin':'*'},body='{"error":"injected upstream outage"}')
  page.route(pattern,snapshot);page.route('**/api/training/**',failure)
  page.reload(wait_until='networkidle');page.wait_for_selector('#freshness[data-state="expired"]')
  if app=='earnings-dojo':assert '实时核对失败' in page.locator('#liveStatus').inner_text()
  fixture['updatedAt']=datetime.now(timezone.utc).isoformat()
  for source in fixture['sources']:
   source['lastSuccessAt']=fixture['updatedAt']
   if not source.get('optional'):source['ok']=True
  required=[s for s in fixture['sources'] if not s.get('optional')];required[0]['ok']=False
  page.reload(wait_until='networkidle');page.wait_for_selector('#freshness[data-state="partial"]')
  page.unroute(pattern,snapshot);page.unroute('**/api/training/**',failure)
  print('BROWSER PASS',app,flush=True)
 page.goto(base+'apps/tsugi-checker/#pc-prices',wait_until='networkidle',timeout=60000)
 page.locator('#nav [data-tab="games"]').click();page.locator('#pcpQuery').fill('Street Fighter 6');page.locator('#pcpSubmit').click()
 page.wait_for_selector('#pcpCandidate',timeout=40000)
 options=page.locator('#pcpCandidate option').all_text_contents();chosen=next(i for i,x in enumerate(options) if 'Street Fighter' in x and '6' in x)
 page.locator('#pcpCandidate').select_option(index=chosen)
 page.wait_for_selector('.pcp-offer.best',timeout=40000)
 assert page.locator('.pcp-offer').count()>=2
 assert 'Steam' in page.locator('#pcpPrices').inner_text()
 assert page.locator('.pcp-offer.best a').get_attribute('href').startswith('https://')
 page.screenshot(path=str(OUT/'tsugi-prices-desktop.png'),full_page=False);page.set_viewport_size({'width':390,'height':844})
 assert page.evaluate("document.querySelector('#pc-prices').scrollWidth<=window.innerWidth+2"),'Tsugi price search mobile overflow'
 page.screenshot(path=str(OUT/'tsugi-prices-mobile.png'),full_page=False)
 print('BROWSER PASS tsugi PC price search',flush=True)
 page.goto(base,wait_until='networkidle',timeout=60000)
 for app in pages+['tsugi-checker']:assert page.locator('[data-app="'+app+'"]').count()>=1
 assert page.locator('[data-app="game-deals"]').count()==0
 assert not errors,errors
 browser.close()
if server:server.shutdown()
print('ALL BROWSER CHECKS PASSED')
