"""Real Chromium keyboard/touch checks for task forms; no DOM-only save calls."""
from functools import partial
from http.server import ThreadingHTTPServer
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Thread
import json
import shutil

from playwright.sync_api import sync_playwright, expect
from browser_smoke import ROOT, KEY, QuietHandler
from browser_interactions import load

TEXT = 'Alışveriş yapılacak\nSüt\nEkmek\nYumurta'


def check_forms(browser, url, mobile):
    context, page = load(browser, url, mobile=mobile)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    # Count only durable task writes. Every successful action must write once.
    page.evaluate('''(key) => {
      window.writes=0; window.originalSet=Storage.prototype.setItem;
      Storage.prototype.setItem=function(k,v){if(k===key)writes++;return originalSet.call(this,k,v);};
    }''', KEY)
    def stored(): return page.evaluate('(key)=>JSON.parse(localStorage.getItem(key))', KEY)
    def activate(selector):
        target = page.locator(selector)
        target.tap() if mobile else target.click()
    def add():
        activate('.today .add')
        return page.locator('.editor textarea')
    def edit(id):
        activate(f'.today [data-task-id="{id}"] + .task-more')
        activate('.task-edit-action')
        return page.locator('.task-edit textarea')
    def leave():
        # A non-focusable part of the page, including Safari's null relatedTarget case.
        activate('.week-range')
    before=stored()
    field=add()
    field.fill('Alışveriş yapılacak')
    for line in ['Süt','Ekmek','Yumurta']:
        field.press('Enter');field.press('End');field.type(line)
    expect(field).to_have_value(TEXT)
    assert stored()==before and page.evaluate('writes')==0
    for width in [320,375,390,412]:
        page.set_viewport_size({'width':width,'height':844})
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        assert field.evaluate('(n)=>getComputedStyle(n).fontSize')=='16px'
        assert 80 < field.bounding_box()['height'] <= 220
        if width==390: page.locator('.editor').screenshot(path='/tmp/haftalik-multiline-add.png')
    activate('.editor .edit-save')
    assert len(stored())==len(before)+1 and page.evaluate('writes')==1
    new=stored()[-1]
    assert new['text']==TEXT and set(new)=={'id','text','date','completed'}
    label=page.locator(f'.today [data-task-id="{new["id"]}"] .task-text')
    expect(label).to_have_text(TEXT)
    assert label.evaluate('(n)=>getComputedStyle(n).whiteSpace')=='pre-wrap'
    # Keyboard Tab can reach Cancel; moving within the form never saves.
    for mode in ['pointer','keyboard','escape']:
        field=add();field.fill('İptal edilecek\ntaslak')
        if mode=='keyboard':
            field.press('Tab');expect(page.locator('.editor .edit-list')).to_be_focused()
            page.keyboard.press('Tab');expect(page.locator('.editor .edit-cancel')).to_be_focused()
            assert page.evaluate('writes')==1
            page.keyboard.press('Enter')
        elif mode=='escape': field.press('Escape')
        else: activate('.editor .edit-cancel')
        assert stored()[-1]==new and len(stored())==len(before)+1 and page.evaluate('writes')==1
    # Textarea caps its growth, but all text remains available to scroll/copy.
    field=add();field.fill(('Çok uzun Türkçe görev ğüşiöç\n')*80)
    assert field.bounding_box()['height']<=220
    assert field.evaluate('(n)=>n.scrollHeight>n.clientHeight')
    activate('.editor .edit-cancel')
    # Outside focus/click and keyboard Tab leaving the whole form save once.
    field=add();field.fill('Dışarıda\nkaydedilir');leave()
    expect(page.locator('.editor')).to_have_count(0)
    assert stored()[-1]['text']=='Dışarıda\nkaydedilir' and page.evaluate('writes')==2
    field=add();field.fill('Tab ile kayıt')
    field.press('Tab');expect(page.locator('.editor .edit-list')).to_be_focused()
    page.keyboard.press('Tab');page.keyboard.press('Tab')
    assert page.evaluate('writes')==2
    page.keyboard.press('Tab')
    expect(page.locator('.editor')).to_have_count(0)
    assert stored()[-1]['text']=='Tab ile kayıt' and page.evaluate('writes')==3
    # Edit uses the same newline and cancellation semantics.
    field=edit(new['id']);field.press('End');field.press('Enter');field.type('Peynir')
    expect(field).to_have_value(TEXT+'\nPeynir');assert stored()[len(before)]==new
    page.locator('.task-edit').screenshot(path='/tmp/haftalik-multiline-edit.png')
    field.press('Tab');expect(page.locator('.task-edit .edit-list')).to_be_focused()
    page.keyboard.press('Tab');expect(page.locator('.task-edit .edit-cancel')).to_be_focused()
    page.keyboard.press('Enter');assert stored()[len(before)]==new
    field=edit(new['id']);field.fill(TEXT+'\nPeynir');leave()
    expect(page.locator('.task-edit')).to_have_count(0)
    changed={**new,'text':TEXT+'\nPeynir'}
    assert stored()[len(before)]==changed and page.evaluate('writes')==4
    # Quota errors retain the same draft on outside autosave and explicit Save.
    for kind in ['add','edit']:
        field=add() if kind=='add' else edit(new['id'])
        field.fill('Kota hatası\nkorunan taslak')
        snapshot=stored()
        page.evaluate('() => {Storage.prototype.setItem=function(){throw new DOMException("quota","QuotaExceededError");};}')
        leave();expect(field).to_be_focused()
        expect(field).to_have_value('Kota hatası\nkorunan taslak')
        activate('.edit-save');expect(field).to_have_value('Kota hatası\nkorunan taslak')
        assert stored()==snapshot
        activate('.edit-cancel');assert stored()==snapshot
        page.evaluate('() => {Storage.prototype.setItem=window.originalSet;}')
    field=edit(new['id']);field.fill('Parmak veya fareyle\niptal')
    activate('.edit-cancel');assert stored()==snapshot
    # IME Enter must not commit; composition-aware leave/save is covered in unit tests.
    field=add();field.fill('IME\nTürkçe')
    field.dispatch_event('compositionstart')
    activate('.edit-save');expect(field).to_be_visible()
    assert stored()==snapshot
    field.dispatch_event('compositionend');activate('.edit-cancel')
    # Settings keeps the draft; existing update protection must remain in charge.
    field=add();field.fill('Ayarlar sırasında\nkorunan taslak')
    # A slow mouse gesture must also preserve the draft before click opens Settings.
    if not mobile:
        page.locator('.settings-button').scroll_into_view_if_needed()
        box=page.locator('.settings-button').bounding_box()
        page.mouse.move(box['x']+22,box['y']+22);page.mouse.down();page.wait_for_timeout(150);page.mouse.up()
    else: activate('.settings-button')
    expect(field).to_have_value('Ayarlar sırasında\nkorunan taslak')
    assert stored()==snapshot
    activate('.sheet-close');field.focus();field.press('Escape')
    # Reload, toggling and local backup/restore preserve exact multiline text.
    page.reload();page.evaluate('navigator.serviceWorker.ready')
    label=page.locator(f'.today [data-task-id="{new["id"]}"] .task-text')
    expect(label).to_have_text(changed['text'])
    activate(f'.today [data-task-id="{new["id"]}"]');activate(f'.today [data-task-id="{new["id"]}"]')
    assert next(t for t in stored() if t['id']==new['id'])==changed
    # Date changes keep the same multiline record; move it back for the backup.
    for date in ['2026-11-13','2026-11-12']:
        activate(f'[data-task-id="{new["id"]}"] + .task-more')
        activate('.task-date-action');page.locator('.task-date-input').fill(date);activate('.task-date-save')
        assert next(t for t in stored() if t['id']==new['id'])=={**changed,'date':date}
    activate('.settings-button')
    with page.expect_download() as event: activate('.export-backup')
    backup=json.loads(Path(event.value.path()).read_text())
    assert backup['tasks']==stored()
    page.locator('.backup-file').set_input_files({'name':'multiline.json','mimeType':'application/json','buffer':json.dumps(backup).encode()})
    activate('.restore-apply');assert stored()==backup['tasks']
    activate('.sheet-close')
    context.set_offline(True);page.reload()
    expect(page.locator(f'.today [data-task-id="{new["id"]}"] .task-text')).to_have_text(changed['text'])
    field=add();field.fill('Çevrimdışı\nçok satırlı');activate('.edit-save')
    assert stored()[-1]['text']=='Çevrimdışı\nçok satırlı'
    assert not errors,errors
    context.close()
    print('PASS: multiline forms, Enter, same-form Tab, outside autosave, cancel, one write, quota/IME/settings drafts, bounded growth, 4 widths, reload/backup/offline ('+('touch' if mobile else 'mouse')+')',flush=True)


def check_lists(browser,url,mobile):
    context,page=load(browser,url,mobile=mobile)
    errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
    page.evaluate('''(key)=>{
      window.writes=0;window.originalSet=Storage.prototype.setItem;
      Storage.prototype.setItem=function(k,v){if(k===key)writes++;return originalSet.call(this,k,v);};
    }''',KEY)
    def stored(): return page.evaluate('(key)=>JSON.parse(localStorage.getItem(key))',KEY)
    def activate(selector):
        target=page.locator(selector)
        target.tap() if mobile else target.click()
    def open_form(kind):
        if kind=='editor': activate('.today .add')
        else:
            activate('.today [data-task-id="A"] + .task-more');activate('.task-edit-action')
        return page.locator(f'.{kind} textarea')
    baseline=stored()
    for kind in ['editor','task-edit']:
        field=open_form(kind);field.fill('Alışveriş\n')
        expect(page.locator('.edit-list')).to_have_text('• Liste')
        activate('.edit-list');expect(field).to_be_focused();expect(field).to_have_value('Alışveriş\n• ')
        expect(page.locator('.edit-list')).to_have_attribute('aria-pressed','true')
        for item in ['Süt','Ekmek','Yumurta']:
            field.type(item);field.press('Enter')
        expect(field).to_have_value('Alışveriş\n• Süt\n• Ekmek\n• Yumurta\n• ')
        assert page.evaluate('writes')==0 and stored()==baseline
        for width in [320,375,390,412]:
            page.set_viewport_size({'width':width,'height':844})
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
            boxes=[page.locator(selector).bounding_box() for selector in ['.edit-list','.edit-cancel','.edit-save']]
            assert all(box['height']>=44 and box['width']>=44 for box in boxes)
            assert boxes[0]['x']<boxes[1]['x']<boxes[2]['x'] and len({b['y'] for b in boxes})==1
            assert field.evaluate('(n)=>getComputedStyle(n).fontSize')=='16px'
            if width==390: page.locator(f'.{kind}').screenshot(path=f'/tmp/haftalik-bullet-{kind}.png')
        # Empty Backspace exits without a spare line; next Enter stays plain.
        field.press('Backspace');expect(field).to_have_value('Alışveriş\n• Süt\n• Ekmek\n• Yumurta')
        expect(page.locator('.edit-list')).to_have_attribute('aria-pressed','false')
        field.press('Enter');expect(field).to_have_value('Alışveriş\n• Süt\n• Ekmek\n• Yumurta\n')
        activate('.edit-cancel');assert stored()==baseline and page.evaluate('writes')==0
        # Pointer taps retain the pre-tap caret, including a split mid-line.
        field=open_form(kind);field.fill('Başlık\nSütEkmek');field.press('Home')
        for _ in range(3): field.press('ArrowRight')
        activate('.edit-list');expect(field).to_be_focused()
        assert field.evaluate('(n)=>n.selectionStart')==12
        field.press('Enter');expect(field).to_have_value('Başlık\n• Süt\n• Ekmek')
        activate('.edit-list');expect(field).to_have_value('Başlık\n• Süt\nEkmek')
        field.press('ArrowUp');field.press('End')
        expect(page.locator('.edit-list')).to_have_attribute('aria-pressed','false')
        field.press('Enter');expect(field).to_have_value('Başlık\n• Süt\n\nEkmek')
        activate('.edit-cancel');assert stored()==baseline
        # Keyboard activation of List is safe inside the same form.
        field=open_form(kind);field.fill('Süt');field.press('Tab')
        expect(page.locator('.edit-list')).to_be_focused();page.keyboard.press('Space')
        expect(field).to_be_focused();expect(field).to_have_value('• Süt')
        # Real keyboard deletion of a selected marker ends the session mode.
        field.press('Home');field.press('Shift+ArrowRight');field.press('Shift+ArrowRight');field.press('Delete')
        expect(field).to_have_value('Süt');expect(page.locator('.edit-list')).to_have_attribute('aria-pressed','false')
        field.press('End');field.press('Enter');expect(field).to_have_value('Süt\n')
        activate('.edit-cancel');assert stored()==baseline
        # No usable keydown is emitted by some soft keyboards: beforeinput alone.
        field=open_form(kind);field.fill('');activate('.edit-list');field.type('Süt')
        field.evaluate('(n)=>n.dispatchEvent(new InputEvent("beforeinput",{inputType:"insertLineBreak",bubbles:true,cancelable:true}))')
        expect(field).to_have_value('• Süt\n• ')
        # IME Enter remains a native newline, never a doubled list item.
        field.type('日本');field.dispatch_event('compositionstart');field.press('Enter')
        expect(field).to_have_value('• Süt\n• 日本\n')
        field.dispatch_event('compositionend')
        activate('.edit-cancel');assert stored()==baseline
        # Native OS-like multiline insertion preserves pasted text without
        # inventing bullets or silently ending a still-active list.
        field=open_form(kind);field.fill('');activate('.edit-list')
        client=context.new_cdp_session(page)
        client.send('Input.insertText',{'text':'Süt\nEkmek'})
        expect(field).to_have_value('• Süt\nEkmek')
        field.press('Enter');expect(field).to_have_value('• Süt\nEkmek\n• ')
        for index in range(15): field.type(f'Uzun görev {index}');field.press('Enter')
        metrics=field.evaluate('(n)=>({height:n.clientHeight,scroll:n.scrollTop,total:n.scrollHeight})')
        assert metrics['height']<=220 and metrics['scroll']>0,metrics
        assert metrics['scroll']+metrics['height']>=metrics['total']-22,metrics
        field.press('ControlOrMeta+Home');field.press('ArrowDown');field.press('ArrowDown');field.press('End')
        caret=field.evaluate('(n)=>n.selectionStart');field.press('Enter')
        assert field.evaluate('(n)=>n.selectionStart')==caret+3
        assert field.evaluate('(n)=>n.scrollTop')<=44  # Do not jump to the list's end.
        activate('.edit-cancel');assert stored()==baseline
    # Bullets stay ordinary text through safe Save, quota failure and autosave.
    field=open_form('editor');field.fill('Alışveriş\n');activate('.edit-list')
    field.type('Süt');field.press('Enter');field.type('<b>Ekmek</b>')
    text='Alışveriş\n• Süt\n• <b>Ekmek</b>'
    page.evaluate('() => {Storage.prototype.setItem=function(){throw new DOMException("quota","QuotaExceededError");};}')
    activate('.edit-save');expect(field).to_have_value(text);assert stored()==baseline
    expect(page.locator('.edit-list')).to_have_attribute('aria-pressed','true')
    page.evaluate('() => {Storage.prototype.setItem=function(k,v){writes++;return originalSet.call(this,k,v);};}')
    activate('.edit-save');assert page.evaluate('writes')==1
    new=stored()[-1];assert new['text']==text and set(new)=={'id','date','text','completed'}
    assert stored()[:-1]==baseline
    expect(page.locator('.today .task-text').filter(has_text=text)).to_have_text(text)
    assert page.locator('.task-text b').count()==0
    # Reopening a bulleted task allows continuation without duplicating a prefix.
    activate(f'.today [data-task-id="{new["id"]}"] + .task-more');activate('.task-edit-action')
    field=page.locator('.task-edit textarea');field.press('ControlOrMeta+End')
    expect(page.locator('.edit-list')).to_have_attribute('aria-pressed','true')
    field.press('Enter');field.type('Yumurta');activate('.week-range')
    text+='\n• Yumurta';expect(field).to_have_count(0)
    assert stored()[-1]=={**new,'text':text} and page.evaluate('writes')==2
    # A second pointer List tap ends a filled item, keeping previous items intact.
    field=open_form('editor');field.fill('Başlık\n');activate('.edit-list');field.type('Süt')
    activate('.edit-list');expect(field).to_have_value('Başlık\nSüt')
    activate('.edit-cancel');assert page.evaluate('writes')==2
    # Backup/import uses the existing plain-text format, including literal HTML.
    activate('.settings-button')
    with page.expect_download() as event: activate('.export-backup')
    backup=json.loads(Path(event.value.path()).read_text());assert backup['tasks']==stored()
    page.locator('.backup-file').set_input_files({'name':'bullets.json','mimeType':'application/json','buffer':json.dumps(backup).encode()})
    page.locator('.restore-mode').select_option('replace');activate('.restore-apply');activate('.danger-confirm')
    assert stored()==backup['tasks'];activate('.sheet-close')
    context.set_offline(True);page.reload()
    expect(page.locator(f'.today [data-task-id="{new["id"]}"] .task-text')).to_have_text(text)
    field=open_form('editor');activate('.edit-list');field.type('Çevrimdışı');field.press('Enter');field.type('Görev')
    activate('.week-range');expect(field).to_have_count(0)
    assert stored()[-1]['text']=='• Çevrimdışı\n• Görev',stored()[-1]
    assert not errors,errors
    context.close()
    print('PASS: smart List in both forms, native Return/selection/delete, pointer focus/caret, keyboard, soft beforeinput, IME, 4 widths, single save/quota/autosave, literal text, backup/restore/reload/offline ('+('touch' if mobile else 'desktop')+')',flush=True)


if __name__=='__main__':
    with TemporaryDirectory(prefix='haftalik-multiline-') as directory:
        shutil.copytree(ROOT,Path(directory)/'haftalik-gorevler',ignore=shutil.ignore_patterns('.git','__pycache__'))
        server=ThreadingHTTPServer(('127.0.0.1',0),partial(QuietHandler,directory=directory))
        Thread(target=server.serve_forever,daemon=True).start()
        try:
            with sync_playwright() as p:
                browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
                url=f'http://127.0.0.1:{server.server_port}/haftalik-gorevler/'
                for mobile in [False,True]:
                    check_forms(browser,url,mobile)
                    check_lists(browser,url,mobile)
                browser.close()
        finally: server.shutdown();server.server_close()
