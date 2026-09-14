
"""Real collected snapshots; deterministic mock only for on-demand external quote lookup."""
import json,threading,functools,os
from pathlib import Path
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/"test-results/labs";OUT.mkdir(parents=True,exist_ok=True)
base=os.getenv("LABS_BASE_URL")
server=None
if not base:
 handler=functools.partial(SimpleHTTPRequestHandler,directory=str(ROOT))
 server=ThreadingHTTPServer(("127.0.0.1",8765),handler);threading.Thread(target=server.serve_forever,daemon=True).start();base="http://127.0.0.1:8765/"
pages=["thesis-lab","earnings-dojo","game-deals","eastside-weekend"]
with sync_playwright() as p:
 browser=p.chromium.launch()
 context=browser.new_context(viewport={"width":1280,"height":900},accept_downloads=True)
 page=context.new_page();errors=[];page.on("pageerror",lambda e:errors.append(str(e)))
 for app in pages:
  response=page.goto(base+"apps/"+app+"/",wait_until="networkidle",timeout=60000)
  assert response.status==200,(app,response.status)
  page.wait_for_function("!document.querySelector('#app').innerText.includes('正在载入')",timeout=30000)
  assert page.locator("h1").inner_text()
  assert page.locator("#health details").count()==1,app
  if app=="thesis-lab":
   assert page.locator("#company option").count()>=6
   page.locator("#newThesis").click()
   page.locator('[name="title"]').fill('验证现金流 <script>window.BAD=1</script>')
   page.locator('[name="reason"]').fill("正自由现金流，保留风险记录")
   page.locator('[name="metric"]').select_option("fcf");page.locator('[name="threshold"]').fill("0")
   page.locator('#editor button[type="submit"]').click()
   assert page.locator("#theses").inner_text().find("验证现金流")>=0
   page.locator('[data-review]').first.click()
   page.reload(wait_until="networkidle")
   assert page.locator("#theses").inner_text().find("验证现金流")>=0
   assert page.evaluate("window.BAD===undefined")
  elif app=="earnings-dojo":
   assert page.locator("#case option").count()>=3
   page.locator('[name="revenue"]').select_option("up")
   page.locator('[name="margin"]').select_option("up")
   page.locator('[name="cash"]').select_option("yes")
   page.locator('[name="reason"]').fill("先核实营运资本和季节性")
   page.locator('#answer button[type="submit"]').click()
   assert page.locator("#reveal").inner_text().find("下一季")>=0
   assert page.locator(".rating").count()==1
  elif app=="game-deals":
   assert page.locator("#games .card").count()>=10
   page.locator("[data-wish]").first.click()
   page.locator('[data-tab="wishlist"]').click()
   assert page.locator("#games .card").count()>=1
   def quote(route):
    fixture={"info":{"title":"Browser test game","steamAppID":"1364780","thumb":""},"deals":[{"dealID":"test","storeID":"1","price":"19.99","retailPrice":"59.99","savings":"66.7"}],"cheapestPriceEver":{"price":"15"}}
    route.fulfill(status=200,content_type="application/json",body=json.dumps(fixture))
   page.route("**/api/1.0/games?id=*",quote)
   page.locator("[data-detail]").first.click()
   page.locator('[name="target"]').fill("25")
   page.locator('[name="edition"]').fill("Steam 本体")
   page.locator('#manageForm button[type="submit"]').click()
   page.locator('[data-tab="target"]').click()
   assert page.locator("#games .card.target").count()>=1
  elif app=="eastside-weekend":
   page.locator("#range").select_option("45")
   assert page.locator("#events .card").count()>=5
   page.locator("[data-save]").first.click()
   with page.expect_download() as dl:page.locator("#calendar").click()
   target=OUT/"events.ics";dl.value.save_as(target);assert "BEGIN:VEVENT" in target.read_text()
   page.locator("[data-map]").first.click()
   assert page.locator("#selected h3").count()==1
  page.screenshot(path=str(OUT/(app+"-desktop.png")),full_page=True)
  page.set_viewport_size({"width":390,"height":844})
  page.screenshot(path=str(OUT/(app+"-mobile.png")),full_page=True)
  assert page.evaluate("document.querySelector('main').scrollWidth<=window.innerWidth+2"),app+" mobile overflow"
  page.set_viewport_size({"width":1280,"height":900})
  print("BROWSER PASS",app)
 page.goto(base,wait_until="networkidle",timeout=60000)
 for app in pages: assert page.locator('[data-app="'+app+'"]').count()>=1,app+" missing home registration"
 assert not errors,errors
 browser.close()
if server:server.shutdown()
print("ALL BROWSER CHECKS PASSED")
