"""Playwright smoke test against the Pages tree served on localhost."""
import argparse
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit

from playwright.sync_api import expect, sync_playwright

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--url', default='http://localhost:8765')
parser.add_argument('--browser', choices=['chromium', 'webkit'], default='chromium')
parser.add_argument('--executable')
parser.add_argument('--directory', type=Path, help='Serve this local directory through Playwright routing')
args = parser.parse_args()

now = datetime.now(timezone.utc).isoformat()
sources = [{'id': key, 'name': name, 'category': 'tech', 'url': f'https://example.org/{key}.xml'}
           for key, name in [('test-a', '样本甲'), ('test-b', '样本乙')]]
items = [{'id': f'{source["id"]}-{i}', 'source_id': source['id'], 'source': source['name'],
          'category': 'tech', 'title': f'{source["name"]}文章 {i}',
          'link': f'https://example.org/{source["id"]}/{i}', 'summary': '用于本地浏览器验收',
          'published_at': now}
         for source in sources for i in range(24)]
feed = {'sources': sources, 'items': items}
hot = {'revision': 'rss-hot-topics-v1', 'generated_at': now,
       'sources': [{'id': 'sample', 'name': '样本热榜', 'kind': 'hotlist', 'status': 'ok'}],
       'items': [{'id': 'hot-1', 'kind': 'hotlist', 'source_id': 'sample', 'source': '样本热榜',
                  'title': '热点样本', 'url': 'https://example.org/hot', 'collected_at': now}]}
base = args.url.rstrip('/')
desk_url = f'{base}/apps/reading-desk/'
rss_url = f'{base}/apps/rss-dashboard/'


def route_request(route):
    url = route.request.url
    if url.startswith(rss_url + 'data/feed.json'):
        route.fulfill(json=feed)
    elif url.endswith('.workers.dev/hot-topics'):
        route.fulfill(json=hot, headers={'Access-Control-Allow-Origin': '*'})
    elif url.startswith(base + '/'):
        if args.directory is None:
            route.continue_()
        else:
            resource = args.directory / urlsplit(url[len(base):]).path.lstrip('/')
            if resource.is_dir():
                resource /= 'index.html'
            if resource.is_file():
                route.fulfill(path=resource)
            else:
                route.fulfill(status=404)
    else:
        route.abort()


def width_fits(page):
    return page.evaluate("document.documentElement.scrollWidth <= innerWidth")


def select_tab(page, name):
    page.get_by_role('tab', name=name, exact=True).click()


with sync_playwright() as playwright:
    browser = getattr(playwright, args.browser).launch(executable_path=args.executable)
    context = browser.new_context(viewport={'width': 744, 'height': 1133}, is_mobile=args.browser == 'webkit',
                                  has_touch=True)
    context.route('**/*', route_request)
    if args.browser == 'chromium':
        context.grant_permissions(['clipboard-read', 'clipboard-write'])
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(base + '/')
    expect(page.get_by_role('heading', name='Reading Desk', exact=True)).to_be_visible()
    page.get_by_role('heading', name='Reading Desk', exact=True).click()
    expect(page).to_have_url(desk_url)

    rss = page.frame_locator('#rss-frame')
    expect(page.get_by_role('tab', name='RSS Orbit')).to_have_attribute('aria-selected', 'true')
    expect(rss.get_by_role('heading', name='还没有选定常用源')).to_be_visible()
    expect(rss.locator('.sidebar')).to_be_hidden()
    expect(rss.locator('#loadMoreButton')).to_be_hidden()
    page.emulate_media(color_scheme='dark')
    expect(rss.locator('html')).to_have_attribute('data-theme', 'dark')
    page.emulate_media(color_scheme='light')
    expect(rss.locator('html')).to_have_attribute('data-theme', 'light')
    rss.get_by_role('button', name='选择常用源').click()
    rss.get_by_role('checkbox', name='样本甲').check()
    rss.get_by_role('button', name='保存', exact=True).click()
    expect(rss.locator('#resultCount')).to_have_text('24')
    expect(rss.locator('[data-article]').filter(has_text='样本乙')).to_have_count(0)
    article = rss.locator('[data-article]').first
    article.click()
    expect(rss.get_by_role('link', name='阅读原文 ↗')).to_have_attribute('href', items[0]['link'])
    rss.get_by_role('button', name='关闭预览').click()
    workspace = rss.locator('.workspace')
    workspace.evaluate('(element) => element.scrollTop = 400')
    assert workspace.evaluate('(element) => element.scrollTop') == 400

    page.get_by_role('button', name='今日热点').click()
    expect(rss.get_by_role('link', name='热点样本 ↗')).to_have_attribute('href', 'https://example.org/hot')
    rss.get_by_role('button', name='热榜', exact=True).click()
    expect(rss.get_by_role('link', name='热点样本 ↗')).to_be_visible()
    rss.get_by_role('button', name='信息源设置').click()
    expect(rss.locator('#hotTopicsSources')).to_be_visible()
    rss.locator('#manageDialog').get_by_role('button', name='关闭', exact=True).click()
    page.go_back()
    expect(rss.locator('#viewTitle')).to_be_visible()
    assert workspace.evaluate('(element) => element.scrollTop') == 400
    child = page.frame(url=lambda url: url.startswith(rss_url))
    child.evaluate("window.dispatchEvent(new MessageEvent('message', {origin:'https://example.org',source:parent,data:{type:'reading-desk-rss-view',view:'hot'}}))")
    child.evaluate("window.dispatchEvent(new MessageEvent('message', {origin:location.origin,source:window,data:{type:'reading-desk-rss-view',view:'hot'}}))")
    expect(rss.locator('#hotTopicsView')).to_be_hidden()

    select_tab(page, 'ChatGPT')
    expect(page.locator('.priority h3')).to_have_text(['工作日 RSS AI 简报', '工作日持仓与机会扫描'])
    expect(page.locator('[data-task]')).to_have_count(5)
    task = page.locator('[data-task="rss-ai"]')
    expect(task).to_have_attribute('href', 'https://chatgpt.com/schedules')
    page.get_by_role('button', name='设置直达链接').click()
    field = page.get_by_role('textbox', name='工作日 RSS AI 简报')
    field.fill('https://example.org/c/test')
    page.get_by_role('button', name='保存链接').click()
    expect(field).to_have_attribute('aria-invalid', 'true')
    field.fill('https://chatgpt.com/c/example-conversation')
    page.get_by_role('button', name='保存链接').click()
    expect(task).to_have_attribute('href', 'https://chatgpt.com/c/example-conversation')
    select_tab(page, 'RSS Orbit')
    assert workspace.evaluate('(element) => element.scrollTop') == 400
    page.reload()
    expect(rss.locator('#resultCount')).to_have_text('24')
    select_tab(page, 'ChatGPT')
    expect(task).to_have_attribute('href', 'https://chatgpt.com/c/example-conversation')

    select_tab(page, 'Muse')
    expect(page.locator('#muse-spaces-link')).to_have_attribute('href', 'https://applink.muse.ai/')
    expect(page.get_by_role('link', name='App Store ↗')).to_have_attribute('href', 'https://apps.apple.com/us/app/muse-from-meta/id6760173601')
    expect(page.locator('.secondary-card a')).to_have_attribute('href', '../watch-inbox/')
    page.get_by_role('button', name='设置直达链接').click()
    muse_field = page.get_by_role('textbox', name='Spaces 入口')
    muse_field.fill('https://muse.ai/redirect?next=https://example.org')
    page.get_by_role('button', name='保存链接').click()
    expect(muse_field).to_have_attribute('aria-invalid', 'true')
    muse_field.fill('https://muse.ai/spaces/example-space')
    page.get_by_role('button', name='保存链接').click()
    expect(page.locator('#muse-spaces-link')).to_have_attribute('href', 'https://muse.ai/spaces/example-space')

    select_tab(page, 'Memo')
    memo = page.get_by_role('textbox', name='备忘录正文')
    memo.fill('测试便签\nSecond line')
    expect(page.locator('#memo-status')).to_have_text('已保存')
    page.reload()
    expect(memo).to_have_value('测试便签\nSecond line')
    select_tab(page, 'Muse')
    expect(page.locator('#muse-spaces-link')).to_have_attribute('href', 'https://muse.ai/spaces/example-space')
    select_tab(page, 'Memo')
    page.get_by_role('button', name='复制', exact=True).click()
    expect(page.locator('#memo-action-status')).to_have_text('已复制全文')
    if args.browser == 'chromium':
        assert page.evaluate('navigator.clipboard.readText()') == '测试便签\nSecond line'
    with page.expect_download() as download:
        page.get_by_role('button', name='导出 TXT').click()
    assert download.value.suggested_filename == 'reading-desk-memo.txt'
    assert Path(download.value.path()).read_text() == '测试便签\nSecond line'

    second = context.new_page()
    second.goto(desk_url + '#memo')
    expect(second.locator('#memo-text')).to_have_value('测试便签\nSecond line')
    memo.fill('第一标签页版本')
    expect(page.locator('#memo-status')).to_have_text('已保存')
    second.locator('#memo-text').fill('保留第二标签页草稿')
    expect(second.locator('#memo-status')).to_have_text('未保存 · 版本冲突')
    expect(second.locator('#memo-text')).to_have_value('保留第二标签页草稿')
    second.once('dialog', lambda dialog: dialog.accept())
    second.get_by_role('button', name='载入已保存版本').click()
    expect(second.locator('#memo-text')).to_have_value('第一标签页版本')
    second.once('dialog', lambda dialog: dialog.dismiss())
    second.get_by_role('button', name='清空', exact=True).click()
    expect(second.locator('#memo-text')).to_have_value('第一标签页版本')
    second.once('dialog', lambda dialog: dialog.accept())
    second.get_by_role('button', name='清空', exact=True).click()
    expect(second.locator('#memo-status')).to_have_text('已保存')
    second.reload()
    expect(second.locator('#memo-text')).to_have_value('')

    for width, height in [(744, 1133), (1133, 744), (375, 667), (320, 568), (1440, 900)]:
        page.set_viewport_size({'width': width, 'height': height})
        for name in ['RSS Orbit', 'ChatGPT', 'Muse', 'Memo']:
            select_tab(page, name)
            assert width_fits(page), (width, height, name)
            panel = page.get_by_role('tabpanel')
            assert panel.evaluate('(el) => el.scrollWidth <= el.clientWidth'), (width, height, name)
        select_tab(page, 'RSS Orbit')
        for name in ['今日热点', '常用']:
            page.get_by_role('button', name=name, exact=True).click()
            assert rss.locator('.workspace').evaluate('(el) => el.scrollWidth <= el.clientWidth'), (width, height, name)
    assert not errors, errors

    standalone = context.new_page()
    standalone.set_viewport_size({'width': 1200, 'height': 900})
    standalone.goto(rss_url)
    expect(standalone.locator('.sidebar')).to_be_visible()
    expect(standalone.locator('#resultCount')).to_have_text('48')
    standalone.locator('[data-view="saved"]').click()
    expect(standalone.get_by_role('link', name='热点样本 ↗')).to_be_visible()
    standalone.locator('[data-view="all"]').click()
    expect(standalone.locator('#resultCount')).to_have_text('48')
    standalone.goto(rss_url + '?tab=hot-topics')
    expect(standalone.get_by_role('link', name='热点样本 ↗')).to_be_visible()
    standalone.goto(rss_url + '?reader=1&view=hot')
    expect(standalone.get_by_role('link', name='热点样本 ↗')).to_be_visible()
    expect(standalone.locator('.sidebar')).to_be_hidden()

    failing = browser.new_context()
    failing.route('**/*', route_request)
    failing.add_init_script("Object.defineProperty(IDBObjectStore.prototype, 'put', {value() { throw new Error('test write failure'); }});")
    failed_page = failing.new_page()
    failed_page.goto(desk_url + '#memo')
    failed_page.locator('#memo-text').fill('保留失败草稿')
    expect(failed_page.locator('#memo-status')).to_have_text('保存失败 · 可复制或导出')
    with failed_page.expect_download() as failed_download:
        failed_page.get_by_role('button', name='导出 TXT').click()
    assert Path(failed_download.value.path()).read_text() == '保留失败草稿'
    browser.close()

print(f'PASS ({args.browser}): homepage, RSS views and isolation, external link settings, Memo, five viewport sizes')
