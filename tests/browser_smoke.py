"""Optional browser regression checks: Python Playwright + system Chromium.
Run from the repository root: python3 tests/browser_smoke.py
The temporary HTTP server is confined to the cloud test environment.
"""
from datetime import datetime
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Thread
from zoneinfo import ZoneInfo
import json
import shutil
import subprocess

from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
KEY = 'haftalik-gorevler:v1:/haftalik-gorevler/'
# Pin the original GitHub main snapshot so the upgrade test remains reproducible after merge.
LEGACY_COMMIT = '5c8da0e71bc5575dc9c94d921cb852aa658a4def'
SEED = [
    dict(id='old', date='2026-10-30', text='Eski görev', completed=False),
    dict(id='week', date='2026-11-09', text='Haftadan kalan', completed=False),
    dict(id='done', date='2026-11-04', text='Tamamlanmış görev', completed=True),
    dict(id='today', date='2026-11-12', text='Bugünün görevi', completed=False),
    dict(id='future', date='2026-11-20', text='Gelecek görev', completed=False),
]


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


def check(browser, url):
    context = browser.new_context(viewport={'width': 390, 'height': 844},
                                  timezone_id='Europe/Istanbul', is_mobile=True, has_touch=True)
    page = context.new_page()
    page.set_default_timeout(10000)
    page.clock.install(time=datetime(2026, 11, 12, 12, tzinfo=ZoneInfo('Europe/Istanbul')))
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.add_init_script(f"if (!localStorage.getItem({json.dumps(KEY)})) localStorage.setItem({json.dumps(KEY)}, {json.dumps(json.dumps(SEED))});")
    page.goto(url)
    expect(page.locator('.day')).to_have_count(7)
    assert page.locator('.day-title').evaluate_all('(nodes) => nodes.map(n => n.getAttribute("aria-expanded"))') == ['false'] * 3 + ['true'] * 4
    page.wait_for_function('document.querySelector(".today").getBoundingClientRect().top >= document.querySelector(".page-header").getBoundingClientRect().bottom')
    expect(page.locator('.today-button')).to_be_hidden()
    expect(page.locator('.carry-tasks .task')).to_have_count(2)
    expect(page.locator('.carry-tasks .task-date').first).to_have_text('30 Ekim 2026')
    page.locator('.carry-tasks [data-task-id="old"]').click()
    expect(page.locator('.carry-tasks [data-task-id="old"]')).to_have_attribute('aria-pressed', 'true')
    expect(page.locator('.carry-title')).to_contain_text('(1)')
    page.locator('.completed-toggle').click()
    expect(page.locator('.completed-tasks .task')).to_have_count(1)
    page.locator('.completed-tasks [data-task-id="done"]').click()
    expect(page.locator('.carry-tasks [data-task-id="done"]')).to_have_attribute('aria-pressed', 'false')
    page.locator('.today .add').click()
    expect(page.locator('.editor input')).to_be_focused()
    page.locator('.editor input').fill('Uzun Türkçe görev ' + 'ğ' * 160)
    page.locator('.editor input').press('Enter')
    expect(page.locator('.carry-tasks [data-task-id="old"]')).to_have_count(1)
    page.locator('.day-title').nth(4).click()
    expect(page.locator('.day-title').nth(4)).to_have_attribute('aria-expanded', 'false')
    expect(page.locator('.carry-tasks [data-task-id="old"]')).to_have_count(1)
    for width in [320, 375, 390, 412]:
        page.set_viewport_size({'width': width, 'height': 844})
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), width
    page.screenshot(path='/tmp/haftalik-weekly-mobile.png', full_page=True)
    # Scroll independently of week selection; return control follows visibility.
    page.locator('.day-title').first.click()
    page.locator('.day-body').first.evaluate('(node) => node.style.minHeight = "1200px"')
    page.evaluate('scrollTo(0, 0)')
    page.wait_for_function('!document.querySelector(".today-button").hidden')
    page.locator('.today-button').click()
    page.wait_for_function('document.querySelector(".today-button").hidden')
    page.locator('.today .day-title').click()
    expect(page.locator('.today-button')).to_be_visible()
    page.locator('.today-button').click()
    expect(page.locator('.today .day-title')).to_have_attribute('aria-expanded', 'true')
    page.locator('.previous-week').click()
    expect(page.locator('h1')).to_have_text('Önceki Hafta')
    expect(page.locator('.carryover')).to_have_count(0)
    assert all(v == 'true' for v in page.locator('.day-title').evaluate_all('(nodes) => nodes.map(n => n.getAttribute("aria-expanded"))'))
    page.locator('.add').first.click()
    page.locator('.editor input').fill('Önceki haftaya ekle')
    page.locator('.editor input').press('Enter')
    page.locator('.next-week').click()
    page.locator('.next-week').click()
    expect(page.locator('h1')).to_have_text('Gelecek Hafta')
    page.locator('.add').last.click()
    page.locator('.editor input').fill('Sonraki haftaya ekle')
    page.locator('.editor input').press('Enter')
    page.locator('.today-button').click()
    expect(page.locator('h1')).to_have_text('Bu Hafta')
    records = page.evaluate(f'JSON.parse(localStorage.getItem({json.dumps(KEY)}))')
    assert len(records) == 8 and len({t['id'] for t in records}) == 8
    assert next(t for t in records if t['id'] == 'old')['date'] == '2026-10-30'
    assert next(t for t in records if t['text'] == 'Önceki haftaya ekle')['date'] == '2026-11-02'
    assert next(t for t in records if t['text'] == 'Sonraki haftaya ekle')['date'] == '2026-11-22'
    page.reload()
    expect(page.locator('.carry-tasks [data-task-id="old"]')).to_have_count(0)
    page.locator('.completed-toggle').click()
    page.locator('.completed-tasks [data-task-id="old"]').click()
    expect(page.locator('.carry-tasks [data-task-id="old"]')).to_have_count(1)
    # Legacy hashes select the relevant week without a separate detail screen.
    page.goto(url + '#gun/2027-01-01')
    expect(page.locator('.day')).to_have_count(7)
    expect(page.locator('.week-range')).to_have_text('28 Aralık 2026 – 3 Ocak 2027')
    assert page.url == url
    page.locator('.today-button').click()
    page.evaluate('navigator.serviceWorker.ready')
    page.wait_for_function('navigator.serviceWorker.controller !== null')
    context.set_offline(True)
    page.reload()
    expect(page.locator('.day')).to_have_count(7)
    expect(page.locator('.carry-tasks [data-task-id="old"]')).to_have_count(1)
    page.locator('.today .add').click()
    page.locator('.editor input').fill('Çevrimdışı görev')
    page.locator('.editor input').press('Enter')
    page.reload()
    expect(page.locator('.today .tasks').first).to_contain_text('Çevrimdışı görev')
    assert not errors, errors
    context.close()
    print('PASS: mobile UI, collapse, weeks, scrolling, carryover/undo, legacy links, subdirectory, offline persistence')


def upgrade_check(browser, url, target, commit=LEGACY_COMMIT, previous="v1"):
    # Install the published main service worker first, then serve the new shell.
    for name in ['index.html', 'app.js', 'dates.js', 'styles.css', 'sw.js', 'storage.js']:
        content = subprocess.check_output(['git', 'show', f'{commit}:{name}'], cwd=ROOT)
        (target / name).write_bytes(content)
    context = browser.new_context()
    page = context.new_page()
    upgrade_errors=[]
    page.on('pageerror',lambda error:upgrade_errors.append(str(error)))
    page.set_default_timeout(10000)
    page.goto(url)
    page.evaluate('navigator.serviceWorker.ready')
    page.wait_for_function('navigator.serviceWorker.controller !== null')
    page.evaluate(f'localStorage.setItem({json.dumps(KEY)}, {json.dumps(json.dumps(SEED))})')
    page.evaluate('navigator.serviceWorker.ready')
    page.wait_for_function('navigator.serviceWorker.controller !== null')
    before = page.evaluate('caches.keys()')
    assert any(name.endswith(':'+previous) for name in before), before
    for name in ['index.html', 'app.js', 'dates.js', 'styles.css', 'sw.js', 'storage.js']:
        shutil.copyfile(ROOT / name, target / name)
    page.evaluate('navigator.serviceWorker.getRegistration().then(r => r.update())')
    page.wait_for_function('navigator.serviceWorker.getRegistration().then(r => !!r.waiting)')
    # Wait for actual activation with all old clients closed before reopening.
    waiting_worker = next(worker for worker in context.service_workers if worker.evaluate('VERSION') == 'v3')
    page.close()
    waiting_worker.evaluate('() => new Promise(resolve => { const poll = () => { if (self.registration.active?.state === "activated" && !self.registration.waiting) resolve(); else setTimeout(poll, 20); }; poll(); })')
    page = context.new_page()
    upgrade_errors=[]
    page.on('pageerror',lambda error:upgrade_errors.append(str(error)))
    page.set_default_timeout(10000)
    page.goto(url)
    page.wait_for_function('navigator.serviceWorker.getRegistration().then(r => !r.waiting && r.active?.state === "activated" && r.active === navigator.serviceWorker.controller)')
    page.wait_for_function('caches.keys().then(keys => keys.some(k => k.endsWith(":v3")) && !keys.some(k => k.endsWith(":v1")) && !keys.some(k => k.endsWith(":v2")))')
    page.reload()
    expect(page.locator('.week-nav')).to_have_count(1)
    assert page.evaluate(f'JSON.parse(localStorage.getItem({json.dumps(KEY)}))') == SEED
    page.wait_for_function('caches.keys().then(keys => keys.some(k => k.endsWith(":v3")) && !keys.some(k => k.endsWith(":v1")) && !keys.some(k => k.endsWith(":v2")))')
    context.set_offline(True)
    page.reload()
    expect(page.locator('.week-nav')).to_have_count(1)
    assert page.evaluate(f'JSON.parse(localStorage.getItem({json.dumps(KEY)}))') == SEED
    assert not upgrade_errors,upgrade_errors
    context.close()
    print(f'PASS: {previous} → v3 PWA upgrade, old cache removal, unchanged existing records, offline updated shell')


def settings_check(browser, url):
    context = browser.new_context(viewport={'width':390,'height':844}, timezone_id='Europe/Istanbul', accept_downloads=True)
    page = context.new_page()
    page.set_default_timeout(10000)
    errors=[]
    page.on('pageerror',lambda e: errors.append(str(e)))
    page.clock.install(time=datetime(2026,11,12,12,tzinfo=ZoneInfo('Europe/Istanbul')))
    page.goto(url)
    page.evaluate('navigator.serviceWorker.ready')
    page.wait_for_function('navigator.serviceWorker.controller !== null')
    page.evaluate(f'localStorage.setItem({json.dumps(KEY)}, {json.dumps(json.dumps(SEED))})')
    page.reload()
    page.evaluate('navigator.serviceWorker.ready')
    page.wait_for_function('navigator.serviceWorker.controller !== null')
    expect(page.locator('.today .day-count')).to_have_text('0/1 tamamlandı')
    page.locator('.today .task').first.click()
    expect(page.locator('.today .day-count')).to_have_text('1/1 tamamlandı')
    page.locator('.today .task').first.click()
    for width in [320,375,390,412]:
        page.set_viewport_size({'width':width,'height':844})
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        sizes=page.evaluate('({day:parseFloat(getComputedStyle(document.querySelector("h2")).fontSize),task:parseFloat(getComputedStyle(document.querySelector(".task")).fontSize),header:document.querySelector(".page-header").offsetHeight})')
        assert sizes['task'] < sizes['day'] and sizes['header'] <= 80, sizes
    page.locator('html').evaluate('(n)=>n.style.fontSize="125%"')
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.locator('html').evaluate('(n)=>n.style.fontSize=""')
    page.locator('.today .add').click()
    page.locator('.editor input').fill('Panel açılırken korunan taslak')
    page.locator('.settings-button').scroll_into_view_if_needed()
    y=page.evaluate('scrollY')
    page.locator('.settings-button').click()
    expect(page.locator('.settings-sheet')).to_be_visible()
    expect(page.locator('.sheet-close')).to_be_focused()
    page.locator('.sheet-close').click()
    assert abs(page.evaluate('scrollY')-y) <= 1
    expect(page.locator('.editor input')).to_have_value('Panel açılırken korunan taslak')
    page.locator('.settings-button').click()
    expect(page.locator('.app-version')).to_have_text('Sürüm 1.2.0')
    # Downloads contain all stored records, and export/import make no network requests.
    requests=[]
    page.on('request',lambda request: requests.append(request.url))
    with page.expect_download() as event:
        page.locator('.export-backup').click()
    download=event.value
    assert download.suggested_filename=='haftalik-gorevler-2026-11-12.json'
    exported=json.loads(Path(download.path()).read_text())
    assert exported['tasks']==SEED
    expect(page.locator('.settings-status')).to_contain_text('kaydedildiğini kontrol')
    # Cancel the draft deliberately before restore so it is not merged implicitly.
    page.locator('.sheet-close').click()
    page.locator('.editor input').focus()
    page.locator('.editor input').press('Escape')
    page.locator('.settings-button').click()
    def upload(data):
        page.locator('.backup-file').set_input_files({'name':'yedek.json','mimeType':'application/json','buffer':json.dumps(data).encode()})
    def stored(): return page.evaluate(f'JSON.parse(localStorage.getItem({json.dumps(KEY)}))')
    incoming={**exported,'tasks':[SEED[0],{**SEED[1],'completed':True},{'id':'new','date':'2026-12-01','text':'Yeni kayıt','completed':False}]}
    upload(incoming)
    expect(page.locator('.restore-summary')).to_contain_text('Yeni: 1 · Aynı: 1 · Çakışan: 1')
    assert stored()==SEED
    page.locator('.restore-apply').click()
    assert stored()==SEED+[incoming['tasks'][2]]
    # Identical restore is idempotent.
    upload(incoming);page.locator('.restore-apply').click()
    assert len(stored())==6
    # Replacement needs both explicit actions; cancellation must preserve records.
    upload(exported);page.locator('.restore-mode').select_option('replace')
    page.locator('.restore-apply').click()
    expect(page.locator('.replace-confirmation')).to_be_visible()
    assert len(stored())==6
    page.locator('.restore-cancel').click();assert len(stored())==6
    upload(exported);page.locator('.restore-mode').select_option('replace');page.locator('.restore-apply').click()
    page.locator('.danger-confirm').click();assert stored()==SEED
    # Reject invalid files and retain all data on a failed atomic write.
    for invalid in [{**exported,'version':999},{**exported,'tasks':[SEED[0],SEED[0]]},{**exported,'tasks':[{**SEED[0],'date':'2026-02-30'}]}]:
        upload(invalid);expect(page.locator('.restore-preview')).to_be_hidden();assert stored()==SEED
    upload(incoming)
    page.evaluate('() => {window.savedSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw new DOMException("quota","QuotaExceededError")};}')
    page.locator('.restore-apply').click()
    expect(page.locator('.settings-status')).to_contain_text('Önceki görevler korundu')
    assert stored()==SEED
    page.evaluate('() => {Storage.prototype.setItem=window.savedSetItem;}')
    assert not requests,requests
    page.locator('.sheet-close').click()
    page.locator('.settings-button').click()
    page.mouse.click(5,5)
    expect(page.locator('.settings-sheet')).not_to_be_visible()
    page.screenshot(path='/tmp/haftalik-modern-mobile.png',full_page=True)
    assert not errors,errors
    context.close()
    print('PASS: compact typography/counters, settings focus/scroll/draft, local backup, preview/merge/conflict, two-step replacement, validation/quota, no data network requests')


def live_update_check(browser,url,target):
    context=browser.new_context(viewport={'width':390,'height':844})
    page=context.new_page();page.set_default_timeout(10000)
    errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
    page.goto(url)
    page.evaluate('navigator.serviceWorker.ready')
    page.wait_for_function('navigator.serviceWorker.controller !== null')
    page.evaluate(f'localStorage.setItem({json.dumps(KEY)}, {json.dumps(json.dumps(SEED))})')
    page.reload();page.evaluate('navigator.serviceWorker.ready')
    page.wait_for_function('navigator.serviceWorker.controller !== null')
    (target/'sw.js').write_text((ROOT/'sw.js').read_text().replace("const VERSION = 'v3'","const VERSION = 'v4'"))
    (target/'version.js').write_text((ROOT/'version.js').read_text().replace('1.2.0','1.2.1'))
    page.locator('.settings-button').click();page.locator('.check-updates').click()
    expect(page.locator('.activate-update')).to_be_visible()
    expect(page.locator('.settings-status')).to_have_text('Güncelleme Hazır')
    page.locator('.sheet-close').click();page.locator('.update-later').click()
    expect(page.locator('.update-banner')).to_be_hidden()
    page.locator('.today .add').click();page.locator('.editor input').fill('Güncellemeden önce koru')
    page.locator('.settings-button').click();page.locator('.check-updates').click()
    expect(page.locator('.activate-update')).to_be_visible()
    # Failed draft save prevents activation and keeps the input intact.
    page.evaluate('() => {window.savedSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw new DOMException("quota","QuotaExceededError")};}')
    page.locator('.activate-update').click()
    expect(page.locator('.settings-status')).to_contain_text('Taslak kaydedilemedi')
    expect(page.locator('.editor input')).to_have_value('Güncellemeden önce koru')
    page.evaluate('() => {Storage.prototype.setItem=window.savedSetItem;}')
    other=context.new_page();other.goto(url)
    page.locator('.activate-update').click()
    expect(page.locator('.settings-status')).to_contain_text('Diğer uygulama')
    expect(page.locator('.app-version')).to_have_text('Sürüm 1.2.0')
    other.close()
    page.locator('.activate-update').click()
    page.wait_for_function('document.querySelector(".settings-sheet .app-version")?.textContent === "Sürüm 1.2.1"')
    records=page.evaluate(f'JSON.parse(localStorage.getItem({json.dumps(KEY)}))')
    assert len(records)==6 and records[:5]==SEED and records[-1]['text']=='Güncellemeden önce koru'
    context.set_offline(True)
    page.locator('.settings-button').click();page.locator('.check-updates').click()
    expect(page.locator('.settings-status')).to_contain_text('kontrol edilemedi')
    page.locator('.sheet-close').click();page.reload()
    expect(page.locator('.day')).to_have_count(7)
    assert not errors,errors
    context.close()
    shutil.copyfile(ROOT/'sw.js',target/'sw.js');shutil.copyfile(ROOT/'version.js',target/'version.js')
    print('PASS: real waiting worker, later, draft quota protection, multiple windows, consent activation/reload, preserved data, offline check')


with TemporaryDirectory(prefix='haftalik-browser-') as directory:
    target = Path(directory) / 'haftalik-gorevler'
    shutil.copytree(ROOT, target, ignore=shutil.ignore_patterns('.git'))
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=directory))
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
            url = f'http://127.0.0.1:{server.server_port}/haftalik-gorevler/'
            check(browser, url)
            settings_check(browser, url)
            upgrade_check(browser, url, target)
            upgrade_check(browser, url, target, '22be840e17311adb1b943a8f0e75b0b72133bac1', 'v2')
            live_update_check(browser,url,target)
            browser.close()
    finally:
        server.shutdown()
        server.server_close()
