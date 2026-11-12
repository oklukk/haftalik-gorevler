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


def upgrade_check(browser, url, target):
    # Install the published main service worker first, then serve the new shell.
    for name in ['index.html', 'app.js', 'dates.js', 'styles.css', 'sw.js', 'storage.js']:
        content = subprocess.check_output(['git', 'show', f'{LEGACY_COMMIT}:{name}'], cwd=ROOT)
        (target / name).write_bytes(content)
    context = browser.new_context()
    page = context.new_page()
    page.set_default_timeout(10000)
    page.goto(url)
    page.evaluate(f'localStorage.setItem({json.dumps(KEY)}, {json.dumps(json.dumps(SEED))})')
    page.evaluate('navigator.serviceWorker.ready')
    page.wait_for_function('navigator.serviceWorker.controller !== null')
    before = page.evaluate('caches.keys()')
    assert any(name.endswith(':v1') for name in before), before
    for name in ['index.html', 'app.js', 'dates.js', 'styles.css', 'sw.js', 'storage.js']:
        shutil.copyfile(ROOT / name, target / name)
    page.evaluate('navigator.serviceWorker.getRegistration().then(r => r.update())')
    page.wait_for_function('navigator.serviceWorker.getRegistration().then(r => !!r.waiting)')
    # Existing windows keep the consistent old shell; reopening activates v2.
    page.close()
    page = context.new_page()
    page.set_default_timeout(10000)
    page.goto(url)
    page.wait_for_function('navigator.serviceWorker.getRegistration().then(r => !r.waiting && !!r.active)')
    page.reload()
    expect(page.locator('.week-nav')).to_have_count(1)
    assert page.evaluate(f'JSON.parse(localStorage.getItem({json.dumps(KEY)}))') == SEED
    page.wait_for_function('caches.keys().then(keys => keys.some(k => k.endsWith(":v2")) && !keys.some(k => k.endsWith(":v1")))')
    context.set_offline(True)
    page.reload()
    expect(page.locator('.week-nav')).to_have_count(1)
    assert page.evaluate(f'JSON.parse(localStorage.getItem({json.dumps(KEY)}))') == SEED
    context.close()
    print('PASS: v1 → v2 PWA upgrade, old cache removal, unchanged existing records, offline updated shell')


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
            upgrade_check(browser, url, target)
            browser.close()
    finally:
        server.shutdown()
        server.server_close()
