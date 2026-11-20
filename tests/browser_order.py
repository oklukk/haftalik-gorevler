"""Real Chromium touch/pointer ordering, persistence and compact input checks."""
from datetime import datetime
from functools import partial
from http.server import ThreadingHTTPServer
from tempfile import TemporaryDirectory
from pathlib import Path
from threading import Thread
from zoneinfo import ZoneInfo
import json
import shutil
from playwright.sync_api import sync_playwright, expect
from browser_smoke import ROOT, KEY, QuietHandler


def check_order(browser, url):
    context = browser.new_context(viewport={'width':390,'height':844}, is_mobile=True, has_touch=True, locale='tr-TR', timezone_id='Europe/Istanbul', accept_downloads=True)
    page = context.new_page(); page.set_default_timeout(10000)
    page.clock.install(time=datetime(2026,11,12,12,tzinfo=ZoneInfo('Europe/Istanbul')))
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    seed=[dict(id=id,date='2026-11-12',text=f'Görev {id}',completed=id in ['B','D']) for id in ['A','B','C','D','E']]
    seed += [dict(id='past',date='2026-11-09',text='Devreden görev',completed=False),dict(id='friday',date='2026-11-13',text='Başka gün',completed=False)]
    page.add_init_script(f'if(!localStorage.getItem({json.dumps(KEY)}))localStorage.setItem({json.dumps(KEY)},{json.dumps(json.dumps(seed))});')
    page.goto(url);page.evaluate('navigator.serviceWorker.ready');page.wait_for_function('navigator.serviceWorker.controller !== null')
    def stored(): return page.evaluate(f'JSON.parse(localStorage.getItem({json.dumps(KEY)}))')
    def ids(): return [t['id'] for t in stored()]
    def visible(): return page.locator('.today .daily-tasks .task').evaluate_all('(nodes)=>nodes.map(n=>n.getAttribute("data-task-id"))')
    def task(id): return page.locator(f'.daily-tasks [data-task-id="{id}"]')
    def writes(): return page.evaluate('orderWrites')
    page.evaluate('(key)=>{window.orderWrites=0;window.savedSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k===key)orderWrites++;return savedSetItem.call(this,k,v)}}',KEY)
    client=context.new_cdp_session(page)
    def point(control, fraction=.5):
        box=control.bounding_box();assert box
        return {'x':box['x']+min(60,box['width']/2),'y':box['y']+box['height']*fraction,'id':1,'radiusX':2,'radiusY':2,'force':1}
    def start(control, hold=True):
        page.locator('.today').evaluate('(n)=>n.scrollIntoView({block:"start",behavior:"instant"})')
        page.wait_for_timeout(80)
        control.scroll_into_view_if_needed()
        client.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[point(control)]})
        if hold:
            page.wait_for_timeout(450)
            expect(page.locator('.is-dragging')).to_have_count(1)
    def move(control, fraction=.2):
        client.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[point(control,fraction)]})
        page.wait_for_timeout(40)
    def end(cancel=False):
        client.send('Input.dispatchTouchEvent',{'type':'touchCancel' if cancel else 'touchEnd','touchPoints':[]})
        page.wait_for_timeout(60)
    assert visible()==['A','C','E','B','D'] and ids()==['A','B','C','D','E','past','friday']
    # Actual touchscreen long hold then move; only one atomic write on release.
    start(task('E'));assert writes()==0
    move(task('A'));assert writes()==0
    page.screenshot(path='/tmp/haftalik-order-drag.png')
    end()
    assert ids()==['E','B','A','D','C','past','friday'],ids()
    assert visible()==['E','A','C','B','D'] and writes()==1
    assert all(not t['completed'] for t in stored() if t['id'] in ['A','C','E'])
    start(task('D'));move(task('B'));end()
    assert ids()==['E','D','A','B','C','past','friday'] and writes()==2
    # A short real tap toggles without rewriting the manual order; undo restores it.
    task('C').tap();assert visible()==['E','A','D','B','C']
    task('C').tap();assert visible()==['E','A','C','D','B']
    assert ids()==['E','D','A','B','C','past','friday']
    before=stored();count=writes()
    # Invalid cross-group and cross-date drops do not write, toggle, or duplicate.
    start(task('E'));move(task('D'));end();assert stored()==before and writes()==count
    start(task('E'));move(task('friday'));end();assert stored()==before and writes()==count
    # Native touch cancellation rolls back the preview.
    start(task('C'));move(task('E'));end(cancel=True);assert stored()==before and writes()==count
    start(task('C'));page.keyboard.press('Escape');end();assert stored()==before and writes()==count
    start(task('A'));end();assert stored()==before and writes()==count
    start(task('C'));move(task('E'));page.evaluate('dispatchEvent(new Event("blur"))');end();assert stored()==before and writes()==count
    expect(page.locator('.today .day-count')).to_have_text('2/5 tamamlandı')
    expect(page.locator('.day-progress')).to_have_attribute('aria-valuenow','40')
    # A normal touch scroll cancels the pending hold before 400 ms and pans the page.
    page.evaluate('scrollTo(0,0)');page.wait_for_timeout(100)
    initial_y=page.evaluate('scrollY'); source=point(task('A'))
    client.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[source]})
    page.wait_for_timeout(40)
    for distance in [15,40,80,120]:
        client.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{**source,'y':source['y']-distance}]})
        page.wait_for_timeout(20)
    end();page.wait_for_timeout(180)
    expect(page.locator('.is-dragging')).to_have_count(0)
    assert stored()==before and page.evaluate('scrollY')>initial_y
    # Carryover and ellipsis retain their own interactions, with no drag binding.
    carry=page.locator('.carry-tasks .task').first
    carry.scroll_into_view_if_needed();client.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[point(carry)]});page.wait_for_timeout(450)
    expect(page.locator('.is-dragging')).to_have_count(0);end(cancel=True)
    more=task('A').locator('..').locator('.task-more')
    more.scroll_into_view_if_needed();client.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[point(more)]});page.wait_for_timeout(450)
    expect(page.locator('.is-dragging')).to_have_count(0);end(cancel=True)
    more.tap()
    expect(page.locator('.task-sheet')).to_be_visible();page.locator('.task-sheet-close').tap()
    assert stored()==before
    # Failed storage retains the original order, and an error is visible.
    page.evaluate('() => {Storage.prototype.setItem=function(){throw new DOMException("quota","QuotaExceededError")}}')
    start(task('C'));move(task('E'));end();assert stored()==before
    expect(page.locator('#notice')).to_contain_text('Önceki görev sırası korundu')
    page.evaluate('(key)=>{Storage.prototype.setItem=function(k,v){if(k===key)orderWrites++;return savedSetItem.call(this,k,v)}}',KEY)
    # Compact add/edit controls are measured at four widths with 16 px text.
    for width in [320,375,390,412]:
        page.set_viewport_size({'width':width,'height':844})
        page.locator('.today .add').tap()
        size=page.locator('.editor').evaluate('(n)=>({h:n.getBoundingClientRect().height,font:getComputedStyle(n.querySelector("input")).fontSize})')
        assert size=={'h':44,'font':'16px'},size
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        if width==390:page.locator('.today').screenshot(path='/tmp/haftalik-order-add-input.png')
        page.locator('.editor input').press('Escape')
        task('A').locator('..').locator('.task-more').tap();page.locator('.task-edit-action').tap()
        edit=page.locator('.task-edit input')
        size=edit.evaluate('(n)=>({h:n.getBoundingClientRect().height,font:getComputedStyle(n).fontSize})')
        assert 42<=size['h']<=46 and size['font']=='16px',size
        assert page.locator('.edit-save').evaluate('(n)=>n.getBoundingClientRect().height')>=44
        edit.fill('Korunan düzenleme taslağı')
        client.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[point(edit)]});page.wait_for_timeout(450)
        expect(page.locator('.is-dragging')).to_have_count(0);end(cancel=True)
        expect(edit).to_have_value('Korunan düzenleme taslağı')
        if width==390:
            start(task('C'),hold=False);page.wait_for_timeout(450)
            expect(page.locator('.is-dragging')).to_have_count(0);end()
            expect(edit).to_have_value('Korunan düzenleme taslağı')
            assert stored()==before
        if width==390:page.locator('.task-edit').screenshot(path='/tmp/haftalik-order-edit-input.png')
        page.locator('.edit-cancel').tap()
    # Keyboard alternative stays invisible in the normal UI and persists as well.
    task('C').focus();page.keyboard.press('Alt+ArrowUp')
    assert visible()==['E','C','A','D','B']
    # Actual mouse Pointer Events support the same hold/drop interaction.
    page.locator('.today').evaluate('(n)=>n.scrollIntoView({block:"start",behavior:"instant"})');page.wait_for_timeout(80)
    source=point(task('A'));target=point(task('E'),.2)
    page.mouse.move(source['x'],source['y']);page.mouse.down();page.wait_for_timeout(450)
    expect(page.locator('.is-dragging')).to_have_count(1)
    page.mouse.move(target['x'],target['y'],steps=5);page.mouse.up()
    assert visible()==['A','E','C','D','B']
    final=stored()
    context.set_offline(True);page.reload()
    assert stored()==final and visible()==['A','E','C','D','B']
    # Backup and confirmed replacement preserve the exact stored sequence.
    page.locator('.settings-button').tap()
    with page.expect_download() as event:page.locator('.export-backup').tap()
    backup=json.loads(Path(event.value.path()).read_text());assert backup['tasks']==final
    page.locator('.backup-file').set_input_files({'name':'order.json','mimeType':'application/json','buffer':json.dumps(backup).encode()})
    expect(page.locator('.restore-preview')).to_be_visible()
    page.locator('.restore-mode').select_option('replace');page.locator('.restore-apply').tap();page.locator('.danger-confirm').tap()
    assert stored()==final
    page.locator('.sheet-close').tap();page.reload();assert visible()==['A','E','C','D','B']
    assert not errors,errors
    context.close()
    print('PASS: real Chromium touch drag, taps, scrolling/cancel/bounds, one-write persistence/quota, compact inputs, keyboard, offline and backup order')


if __name__ == '__main__':
    with TemporaryDirectory(prefix='haftalik-order-') as directory:
        shutil.copytree(ROOT,Path(directory)/'haftalik-gorevler',ignore=shutil.ignore_patterns('.git','__pycache__'))
        server=ThreadingHTTPServer(('127.0.0.1',0),partial(QuietHandler,directory=directory))
        Thread(target=server.serve_forever,daemon=True).start()
        try:
            with sync_playwright() as p:
                browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
                check_order(browser,f'http://127.0.0.1:{server.server_port}/haftalik-gorevler/')
                browser.close()
        finally:
            server.shutdown();server.server_close()
