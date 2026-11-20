import test from 'node:test';
import assert from 'node:assert/strict';
import { setupBulletList } from '../bullet-list.js';

class Field {
  constructor(value='') {
    this.value=value; this.selectionStart=this.selectionEnd=value.length;
    this.handlers={};this.attributes={};this.onbeforeinput=null;
  }
  addEventListener(type, fn) { (this.handlers[type]??=[]).push(fn); }
  setAttribute(name,value) { this.attributes[name]=value; }
  setSelectionRange(start,end=start) { this.selectionStart=start;this.selectionEnd=end; }
  setRangeText(text,start,end) { this.value=this.value.slice(0,start)+text+this.value.slice(end);this.setSelectionRange(start+text.length); }
  focus() { this.focused=true; }
  fire(type, extra={}) {
    const event={cancelable:true,defaultPrevented:false,preventDefault(){this.defaultPrevented=true;},...extra};
    for (const fn of this.handlers[type]??[]) fn(event);
    return event;
  }
  edit(inputType,data='',extra={}) {
    const event=this.fire('beforeinput',{inputType,...extra});
    if (event.defaultPrevented) return event;
    let start=this.selectionStart,end=this.selectionEnd;
    if (inputType==='deleteContentBackward' && start===end) start=Math.max(0,start-1);
    if (inputType==='deleteContentForward' && start===end) end=Math.min(this.value.length,end+1);
    const text=inputType==='insertLineBreak'?'\n':inputType.startsWith('delete')?'':data;
    this.setRangeText(text,start,end);this.fire('input',{inputType,...extra});
    return event;
  }
}
function session(text='') {
  const input=new Field(text),button=new Field();let resized=0;
  setupBulletList(input,button,()=>resized++);
  const click=()=>button.fire('click');
  const pressed=()=>button.attributes['aria-pressed']==='true';
  return {input,button,click,pressed,resized:()=>resized};
}

test('Liste satır başına tek işaret ekler; seçim/imleç ve diğer satırlar korunur', () => {
  const {input,click,pressed}=session('Başlık\nSüt\nSon');
  input.setSelectionRange(9,10);click();
  assert.equal(input.value,'Başlık\n• Süt\nSon');
  assert.deepEqual([input.selectionStart,input.selectionEnd],[11,12]);
  assert(pressed());assert(input.focused);
  click();assert.equal(input.value,'Başlık\nSüt\nSon');assert(!pressed());
  click();assert.equal(input.value,'Başlık\n• Süt\nSon');
});

test('Tek Enter tek madde oluşturur, satır ortasını böler ve seçimi değiştirir', () => {
  const {input,click}=session('Alışveriş\n');click();
  input.edit('insertText','Süt');input.edit('insertLineBreak');input.edit('insertText','Ekmek');
  input.edit('insertLineBreak');input.edit('insertText','Yumurta');
  assert.equal(input.value,'Alışveriş\n• Süt\n• Ekmek\n• Yumurta');
  input.setSelectionRange(input.value.indexOf('kmek'));
  input.edit('insertLineBreak');
  assert.equal(input.value,'Alışveriş\n• Süt\n• E\n• kmek\n• Yumurta');
  input.setSelectionRange(input.value.indexOf('kmek'),input.value.indexOf('kmek')+2);
  input.edit('insertLineBreak');assert(input.value.includes('• E\n• \n• ek'));
  for (const position of [0,1,2]) {
    const row=session('• Süt');row.input.setSelectionRange(position);row.input.edit('insertLineBreak');
    assert.equal(row.input.value,'• \n• Süt');assert.equal(row.input.selectionStart,5);
  }
});

test('Boş son madde Backspace, Delete, Enter veya butonla fazlalık bırakmadan kapanır', () => {
  for (const action of ['deleteContentBackward','deleteContentForward','insertLineBreak','button']) {
    const {input,click,pressed}=session('Başlık\n• Süt\n• ');
    if(action==='deleteContentForward')input.setSelectionRange(input.value.length-2);
    if(action==='button')click();else input.edit(action);
    assert.equal(input.value,'Başlık\n• Süt',action);assert(!pressed());
    input.edit('insertLineBreak');assert.equal(input.value,'Başlık\n• Süt\n');
  }
  const {input}=session('• \nSon');input.setSelectionRange(2);input.edit('deleteContentBackward');assert.equal(input.value,'Son');
});

test('Dolu maddede işareti kaldırmak yalnız o satırı etkiler; açıkça kapalı mod geri açılmaz', () => {
  const {input,click,pressed}=session('• Süt\n• Ekmek');
  click();assert.equal(input.value,'• Süt\nEkmek');assert(!pressed());
  input.setSelectionRange(5);input.fire('select');assert(!pressed());
  input.edit('insertLineBreak');assert.equal(input.value,'• Süt\n\nEkmek');
  click();assert(pressed());assert.equal(input.value,'• Süt\n• \nEkmek');
});

test('İşareti seçimle silmek/kesmek listeyi kapatır; diğer işaretler kalır', () => {
  for (const type of ['deleteContentBackward','deleteByCut']) {
    const {input,pressed}=session('• Süt\n• Ekmek');
    input.setSelectionRange(6,8);input.edit(type);
    assert.equal(input.value,'• Süt\nEkmek');assert(!pressed());
    input.setSelectionRange(5);input.fire('select');assert(!pressed());
  }
  const {input,pressed}=session('• Süt\n• ');
  input.setSelectionRange(5,8);input.edit('deleteByCut');
  assert.equal(input.value,'• Süt');assert(!pressed());
});

test('Yapıştırma metni aynen korur; işaret silinmeden normal satır yapıştırmak modu kapatmaz', () => {
  const {input,click,pressed}=session();click();
  input.edit('insertFromPaste','Süt\nEkmek <b>metin</b>');
  assert.equal(input.value,'• Süt\nEkmek <b>metin</b>');assert(pressed());
  input.edit('insertParagraph');assert.equal(input.value,'• Süt\nEkmek <b>metin</b>\n• ');
  input.edit('insertText','Peynir');
});

test('IME Enter veya iptal edilemeyen beforeinput metnine müdahale etmez', () => {
  const {input,click}=session();click();input.edit('insertText','Süt');
  input.fire('compositionstart');
  const event=input.edit('insertLineBreak','',{isComposing:true});
  assert(!event.defaultPrevented);assert.equal(input.value,'• Süt\n');
  click();assert.equal(input.value,'• Süt\n');
  input.fire('compositionend');
  input.edit('insertLineBreak','',{cancelable:false});assert.equal(input.value,'• Süt\n\n');
});

test('Dokunma öncesi seçim korunur; mevcut tek işaret yinelenmez; eski klavye yolu bir kez işler', () => {
  const {input,button,click}=session('Başlık\nMetin');
  input.setSelectionRange(8);
  assert(button.fire('pointerdown',{button:0,isPrimary:true}).defaultPrevented);
  input.setSelectionRange(input.value.length);click();
  assert.equal(input.value,'Başlık\n• Metin');assert.equal(input.selectionStart,10);
  const old=session('• Süt');old.click();old.input.value='• Süt';old.input.setSelectionRange(5);
  old.click();assert.equal(old.input.value,'• Süt');assert(old.pressed());
  const field=new Field(),control=new Field();delete field.onbeforeinput;
  setupBulletList(field,control,()=>{});control.fire('click');field.edit('insertText','Süt');
  assert(field.fire('keydown',{key:'Enter'}).defaultPrevented);
  assert.equal(field.value,'• Süt\n• ');
});
