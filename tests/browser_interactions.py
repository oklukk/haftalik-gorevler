"""Focused regression: unchanged normal UI, input modality and consumed holds."""
from datetime import datetime
from functools import partial
from http.server import ThreadingHTTPServer
from tempfile import TemporaryDirectory
from pathlib import Path
from threading import Thread
from zoneinfo import ZoneInfo
import io
import json
import shutil
import subprocess
import tarfile
from playwright.sync_api import sync_playwright, expect
from browser_smoke import ROOT, QuietHandler

BASELINE = '9558a078a6b146d83d3284311ec19c2e720677fa'
SEED = [dict(id=id,date='2026-11-12',text=f'Görev {id}',completed=id in ['B','D']) for id in ['A','B','C','D','E']]
SEED += [dict(id='past',date='2026-11-09',text='Devreden görev',completed=False)]


def load(browser,url,width=390):
    context=browser.new_context(viewport={'width':width,'height':844},is_mobile=True,has_touch=True,locale='tr-TR',timezone_id='Europe/Istanbul')
    page=context.new_page();page.set_default_timeout(10000)
    page.clock.install(time=datetime(2026,11,12,12,tzinfo=ZoneInfo('Europe/Istanbul')))
    page.add_init_script('if(!localStorage.getItem("haftalik-gorevler:v1:"+location.pathname))localStorage.setItem("haftalik-gorevler:v1:"+location.pathname,'+json.dumps(json.dumps(SEED))+');')
    page.goto(url);page.evaluate('navigator.serviceWorker.ready')
    page.wait_for_function('navigator.serviceWorker.controller !== null')
    return context,page


def compare_normal(browser,before,after):
    for width in [320,375,390,412]:
        pictures=[];panels=[]
        for name,url in [('before',before),('after',after)]:
            context,page=load(browser,url,width)
            page.evaluate('scrollTo(0,0)');page.wait_for_timeout(80)
            pictures.append(page.screenshot(path=f'/tmp/haftalik-normal-{name}-{width}.png'))
            page.locator('.settings-button').tap()
            # Only the required application version text differs in Settings.
            panels.append(page.screenshot(mask=[page.locator('.app-version')]))
            context.close()
        assert pictures[0]==pictures[1],f'Normal görünüm değişti: {width}'
        assert panels[0]==panels[1],f'Ayarlar yerleşimi değişti: {width}'
    print('PASS: exact before/after normal screenshot equality at 320/375/390/412 px; settings equal apart from masked version')


def interactions(browser,url):
    context,page=load(browser,url)
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    key='haftalik-gorevler:v1:'+page.evaluate('location.pathname')
    page.evaluate('(key)=>{window.writes=0;const set=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k===key)writes++;return set.call(this,k,v);}}',key)
    def stored():return page.evaluate('(k)=>localStorage.getItem(k)',key)
    def writes():return page.evaluate('writes')
    def control(id):return page.locator(f'.today .daily-tasks [data-task-id="{id}"]')
    def row(id):return control(id).locator('..')
    def point(target):
        rect=target.bounding_box();return {'x':rect['x']+min(60,rect['width']/2),'y':rect['y']+rect['height']/2,'id':1}
    def align():
        page.locator('.today').evaluate('(n)=>n.scrollIntoView({block:"start",behavior:"instant"})');page.wait_for_timeout(80)
    client=context.new_cdp_session(page)
    for mode in ['touch','mouse']:
        for id in ['A','D']:
            for hold in [450,600]:
                align();source=point(control(id));before=stored();count=writes()
                if mode=='touch':client.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[source]})
                else:page.mouse.move(source['x'],source['y']);page.mouse.down()
                page.wait_for_timeout(hold)
                expect(row(id)).to_have_class('task-row is-dragging')
                control(id).dispatch_event('click',{'detail':0})
                assert stored()==before and writes()==count
                if mode=='touch':client.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
                else:page.mouse.up()
                # Legacy MouseEvents and mismatched IDs/detail=0 all belong to the
                # consumed gesture, and repeated compatibility events stay blocked.
                control(id).evaluate('(n)=>{n.dispatchEvent(new MouseEvent("click",{bubbles:true,detail:0}));n.dispatchEvent(new PointerEvent("click",{bubbles:true,pointerId:999,detail:1}));n.dispatchEvent(new MouseEvent("click",{bubbles:true,detail:1}));}')
                assert stored()==before and writes()==count,(mode,id,hold)
                expect(page.locator('.is-dragging,.drag-peer')).to_have_count(0)
                assert row(id).evaluate('(n)=>n.style.transform')==''
                expected=not next(t['completed'] for t in json.loads(before) if t['id']==id)
                if mode=='touch':control(id).tap()
                else:control(id).click()
                assert next(t['completed'] for t in json.loads(stored()) if t['id']==id)==expected
                if mode=='touch':control(id).tap()
                else:control(id).click()
                assert json.loads(stored())==json.loads(before)
    # Cancellation before the hold threshold must also reject trailing clicks.
    align();source=point(control('A'));before=stored();count=writes()
    client.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[source]});page.wait_for_timeout(40)
    client.send('Input.dispatchTouchEvent',{'type':'touchCancel','touchPoints':[]})
    control('A').dispatch_event('click',{'detail':0})
    assert stored()==before and writes()==count
    # Simulate a main-thread-delayed hold timer: elapsed input timestamps still
    # classify the release as a long hold, without relying on the timer flag.
    page.evaluate('() => {window.nativeTimeout=window.setTimeout;window.setTimeout=(fn,ms,...args)=>nativeTimeout(fn,ms===400?1000:ms,...args);}')
    align();source=point(control('A'));before=stored();count=writes()
    page.mouse.move(source['x'],source['y']);page.mouse.down();page.wait_for_timeout(500);page.mouse.up()
    assert stored()==before and writes()==count
    page.evaluate('() => {window.setTimeout=window.nativeTimeout;}')
    # Explicit keyboard activation remains valid even after a consumed hold.
    align();source=point(control('A'))
    page.mouse.move(source['x'],source['y']);page.mouse.down();page.wait_for_timeout(450);page.mouse.up()
    control('A').press('Enter');expect(control('A')).to_have_attribute('aria-pressed','true')
    control('A').press('Space');expect(control('A')).to_have_attribute('aria-pressed','false')
    # Pointer focus never carries the previous keyboard outline to replacements.
    for target in [control('A'),page.locator('.today .day-title')]:
        target.tap();assert target.evaluate('(n)=>getComputedStyle(n).outlineStyle')=='none'
    page.locator('.today .day-title').tap()
    control('A').tap()  # Restore the completion changed by the pointer-focus check.
    expect(control('A')).to_have_attribute('aria-pressed','false')
    control('A').locator('..').locator('.task-more').tap()
    assert page.locator('.task-sheet-close').evaluate('(n)=>getComputedStyle(n).outlineStyle')=='none'
    page.locator('.task-sheet-close').tap()
    for selector in ['.next-week','.previous-week','.settings-button','.sheet-close']:
        target=page.locator(selector);target.tap()
        assert target.evaluate('(n)=>getComputedStyle(n).outlineStyle')=='none',selector
    page.keyboard.press('Tab')
    assert page.evaluate('document.activeElement.matches(":focus-visible") && getComputedStyle(document.activeElement).outlineStyle !== "none"')
    page.locator('.today .add').tap()
    value=page.locator('.editor input').evaluate('(n)=>({outline:getComputedStyle(n).outlineStyle,shadow:getComputedStyle(n).boxShadow,font:getComputedStyle(n).fontSize})')
    assert value=={'outline':'none','shadow':'none','font':'16px'},value
    page.locator('.editor input').fill('Yeni taslak');page.locator('.editor input').press('Enter')
    assert page.locator('.today .add').evaluate('(n)=>getComputedStyle(n).outlineStyle')=='none'
    # Moving preview: source follows the pointer; peers fill space, not a line.
    align();source=point(control('E'));target=point(control('A'));target['y']-=12
    normal_width=row('E').bounding_box()['width']
    client.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[source]});page.wait_for_timeout(450)
    initial=row('E').bounding_box()
    assert abs(initial['width']-normal_width-2)<.7
    client.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[target]});page.wait_for_timeout(180)
    moving=row('E').bounding_box()
    assert abs(moving['y']-initial['y']-(target['y']-source['y']))<3
    assert abs(moving['width']/initial['width']-1)<.001 # Both measurements include the 1.006 scale.
    assert control('A').locator('..').evaluate('(n)=>getComputedStyle(n).transform')!='none'
    assert page.locator('.drop-before,.drop-after').count()==0
    assert row('E').evaluate('(n)=>getComputedStyle(n,"::before").content')=='none'
    assert row('E').evaluate('(n)=>getComputedStyle(n).boxShadow')!='none'
    page.screenshot(path='/tmp/haftalik-interaction-drag.png')
    before=stored();client.send('Input.dispatchTouchEvent',{'type':'touchCancel','touchPoints':[]})
    assert stored()==before and row('E').evaluate('(n)=>n.style.transform')==''
    page.emulate_media(reduced_motion='reduce')
    align();source=point(control('E'));client.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[source]});page.wait_for_timeout(450)
    assert page.locator('.drag-peer').first.evaluate('(n)=>getComputedStyle(n).transitionDuration')=='0s'
    client.send('Input.dispatchTouchEvent',{'type':'touchCancel','touchPoints':[]})
    assert not errors,errors
    context.close()
    print('PASS: 450/600 ms no-move holds on pending/completed tasks, native touch+mouse, compatibility clicks, next tap, keyboard, focus, moving preview and reduced motion')


if __name__=='__main__':
    with TemporaryDirectory(prefix='haftalik-interactions-') as directory:
        before=Path(directory)/'baseline';before.mkdir()
        archive=subprocess.check_output(['git','archive',BASELINE],cwd=ROOT)
        with tarfile.open(fileobj=io.BytesIO(archive)) as tar:tar.extractall(before,filter='data')
        shutil.copytree(ROOT,Path(directory)/'current',ignore=shutil.ignore_patterns('.git','__pycache__'))
        server=ThreadingHTTPServer(('127.0.0.1',0),partial(QuietHandler,directory=directory))
        Thread(target=server.serve_forever,daemon=True).start()
        try:
            with sync_playwright() as p:
                browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
                origin=f'http://127.0.0.1:{server.server_port}'
                compare_normal(browser,origin+'/baseline/',origin+'/current/')
                interactions(browser,origin+'/current/')
                browser.close()
        finally:server.shutdown();server.server_close()
