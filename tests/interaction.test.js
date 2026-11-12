// These tests exercise the real app handlers in a minimal DOM double.
// They do not replace real Safari/Chrome layout, keyboard or offline browser QA.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as dates from '../dates.js';
import * as storage from '../storage.js';
import * as icons from '../icons.js';

class Node {
  constructor(tag, document) { this.tagName=tag; this.document=document; this.children=[]; this.handlers={}; this.attributes={}; this.hidden=false; this.value=''; this.ownText=''; this.style={}; }
  set textContent(value) { this.ownText=value; this.children=[]; }
  get textContent() { return this.ownText + this.children.map(child=>child.textContent).join(''); }
  append(...nodes) { for (const node of nodes) { node.parent=this; this.children.push(node); } }
  replaceChildren(...nodes) { this.children=[]; this.append(...nodes); }
  remove() { if(this.parent) this.parent.children=this.parent.children.filter(child=>child!==this); }
  setAttribute(name,value) { this.attributes[name]=value; if(name==='class')this.className=value; }
  get parentElement() { return this.parent; }
  showModal() { this.open=true; }
  close() { this.open=false; this.fire('close'); }
  querySelector(selector) {
    const match = node => selector.startsWith('.') ? node.className?.split(' ').includes(selector.slice(1)) : node.attributes['data-task-id'] === selector.match(/data-task-id="(.*)"/)[1];
    for (const child of this.children) { if (match(child)) return child; const found=child.querySelector(selector); if(found) return found; }
    return null;
  }
  getBoundingClientRect() { return this.rect ?? (this.tagName === 'header' ? {top:0,bottom:100,height:100} : {top:120,bottom:220,height:100}); }
  scrollIntoView() { this.document.scrolledTo=this.id; }

  addEventListener(name,fn) { (this.handlers[name]??=[]).push(fn); }
  fire(name,extra={}) { for (const fn of this.handlers[name]??[]) fn({preventDefault(){},...extra}); }
  focus() {
    const old=this.document.activeElement;
    this.document.activeElement=this;
    if(old && old!==this) old.fire('blur');
  }
}

function boot(values=new Map(), hash='') {
  const document={hidden:false, documentElement:{style:{setProperty(){}}}, handlers:{}, addEventListener(name,fn){this.handlers[name]=fn;}};
  document.createElement=tag=>new Node(tag,document);
  document.createElementNS=(_,tag)=>new Node(tag,document);
  document.body=document.createElement('body');
  document.createTextNode=text=>{ const node=new Node('#text',document); node.textContent=text; return node; };
  const app=document.createElement('main'), notice=document.createElement('p');
  document.body.append(app,notice);
  document.querySelector=selector=>selector==='#app'?app:notice;
  const listeners={};
  const location={pathname:'/haftalik/',search:'',hash};
  const history={state:null,pushState(state,_,url){this.state=state;location.hash=url;},replaceState(state){this.state=state;location.hash='';},back(){location.hash='';this.state=null;listeners.popstate();}};
  const localStorage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
  let now=new Date(2026,10,12,12);
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } }
  const frames=[];
  const sandbox={setupSettings:()=>({isOpen:()=>false}),...dates,...storage,...icons,document,setTimeout(){},location,history,localStorage,URL,crypto,Date:Clock,Intl,CSS:{escape:value=>value},navigator:{},requestAnimationFrame:fn=>frames.push(fn),setInterval(fn){listeners.tick=fn;},window:{scrollY:80,innerHeight:844,scrollTo(value){this.scrollY=value.top;document.scrollCalls=(document.scrollCalls??0)+1;},addEventListener(name,fn){listeners[name]=fn;}}};
  const source=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8')
    .replace(/^import .*;\n/gm,'')
    .replace('import.meta.url',JSON.stringify('https://example.test/haftalik/app.js'));
  vm.runInNewContext(source,sandbox);
  const all=(predicate,node=document.body)=>[...(predicate(node)?[node]:[]),...node.children.flatMap(child=>all(predicate,child))];
  const byClass=name=>all(node=>node.className?.split(' ').includes(name));
  const add=(button,text)=>{button.fire('click'); const input=byClass('editor')[0].children[1]; assert.equal(document.activeElement,input); input.value=text; input.parent.fire('submit');};
  const flush=()=>{while(frames.length)frames.shift()();};
  flush();
  return {app,notice,location,history,values,byClass,add,document,listeners,flush,setNow(value){now=new Date(value);listeners.tick();flush();}};
}

const stored = tasks => new Map([[storage.storageKey('/haftalik/'),JSON.stringify(tasks)]]);
const task = (id,date,completed=false) => ({id,date,text:id,completed});
const saved = ui => JSON.parse(ui.values.get(storage.storageKey('/haftalik/')));
const rows = (ui,name) => ui.byClass(name)[0]?.children ?? [];
const clickTask = (ui,id,within='carry-tasks') => {
  const list=ui.byClass(within)[0];
  const control=list.querySelector(`[data-task-id="${id}"]`);
  assert(control, `Görev bulunamadı: ${id}`);
  control.fire('click');
};

test('Tek ekran: bağımsız günler, ilk durumlar, ekleme, boş girdi ve kalıcılık', () => {
  const ui=boot();
  assert.equal(ui.byClass('day').length,7);
  assert.deepEqual(ui.byClass('day-body').map(node=>node.hidden),[true,true,true,false,false,false,false]);
  assert.equal(ui.document.scrolledTo,'day-2026-11-12');
  const scrolls=ui.document.scrollCalls;
  ui.byClass('day-title')[0].fire('click');
  ui.byClass('day-title')[1].fire('click');
  assert.equal(ui.byClass('day-body')[0].hidden,false);
  assert.equal(ui.byClass('day-body')[1].hidden,false);
  assert.equal(ui.location.hash,'');
  ui.add(ui.byClass('add')[3],'   ');
  assert.equal(ui.byClass('task').length,0);
  ui.add(ui.byClass('add')[3],'  Çalışmayı gözden geçir  ');
  assert.equal(ui.byClass('task-text')[0].textContent,'Çalışmayı gözden geçir');
  ui.byClass('task')[0].fire('click');
  assert.equal(ui.byClass('task')[0].attributes['aria-pressed'],'true');
  assert.equal(boot(ui.values).byClass('task')[0].attributes['aria-pressed'],'true');
  ui.byClass('task')[0].fire('click');
  assert.equal(ui.byClass('task')[0].attributes['aria-pressed'],'false');
  ui.flush();
  assert.equal(ui.document.scrollCalls,scrolls);
  assert.equal(ui.byClass('day-body')[0].hidden,false);
  assert.equal(saved(ui).length,1);
});

test('Hafta gezinmesi, geçmiş/gelecek görevleri ve bugüne dönüş', () => {
  const ui=boot();
  ui.byClass('previous-week')[0].fire('click'); ui.flush();
  assert.equal(ui.byClass('week-range')[0].textContent,'2 – 8 Kasım 2026');
  assert(ui.byClass('day-body').every(node=>!node.hidden));
  assert.equal(ui.byClass('carryover').length,0);
  assert.equal(ui.byClass('today-button')[0].hidden,false);
  ui.add(ui.byClass('add')[0],'Geçmiş görev');
  assert.equal(saved(ui)[0].date,'2026-11-02');
  ui.byClass('next-week')[0].fire('click'); ui.flush();
  assert.equal(ui.document.scrolledTo,'day-2026-11-12');
  ui.byClass('next-week')[0].fire('click'); ui.flush();
  ui.add(ui.byClass('add')[6],'Gelecek görev');
  assert.equal(saved(ui)[1].date,'2026-11-22');
  assert(ui.byClass('day-body').every(node=>!node.hidden));
  ui.byClass('today-button')[0].fire('click'); ui.flush();
  assert.equal(ui.document.scrolledTo,'day-2026-11-12');
  assert.equal(ui.byClass('today').length,1);
  assert.equal(saved(ui).length,2);
});

test('Bugüne Dön görünürlüğü görünür alanı ve kapalı bugünü izler', () => {
  const ui=boot();
  assert.equal(ui.byClass('today-button')[0].hidden,true);
  ui.byClass('today')[0].rect={top:-300,bottom:80};
  ui.listeners.scroll();ui.flush();
  assert.equal(ui.byClass('today-button')[0].hidden,false);
  ui.byClass('today')[0].rect={top:120,bottom:220};
  ui.listeners.scroll();ui.flush();
  assert.equal(ui.byClass('today-button')[0].hidden,true);
  ui.byClass('day-title')[3].fire('click');ui.flush();
  assert.equal(ui.byClass('today-button')[0].hidden,false);
  ui.byClass('today-button')[0].fire('click');ui.flush();
  assert.equal(ui.byClass('day-body')[3].hidden,false);
  assert.equal(ui.byClass('today-button')[0].hidden,true);
});

test('Devredenler: tarih sırası, tek kayıt, geçici tamamlama ve geri alma', () => {
  const ui=boot(stored([task('same-week','2026-11-09'),task('old','2026-10-30'),task('done','2026-11-04',true),task('future','2026-11-20'),task('today','2026-11-12')]));
  assert.deepEqual(rows(ui,'carry-tasks').map(node=>node.children[0].attributes['data-task-id']),['old','same-week']);
  assert.match(ui.byClass('carry-title')[0].textContent,/Devreden Görevler \(2\)/);
  clickTask(ui,'old');
  assert.equal(saved(ui).find(t=>t.id==='old').completed,true);
  assert.equal(rows(ui,'carry-tasks').length,2);
  assert.match(ui.byClass('carry-title')[0].textContent,/Devreden Görevler \(1\)/);
  ui.add(ui.byClass('add')[3],'Yeni görev');
  ui.byClass('day-title')[1].fire('click');
  assert.equal(rows(ui,'carry-tasks').length,2);
  ui.byClass('carry-title')[0].fire('click');
  assert.equal(ui.byClass('carry-title')[0].attributes['aria-expanded'],'false');
  ui.byClass('carry-title')[0].fire('click');
  ui.byClass('completed-toggle')[0].fire('click');
  assert.deepEqual(rows(ui,'completed-tasks').map(node=>node.children[0].attributes['data-task-id']),['done']);
  clickTask(ui,'old');
  assert.equal(saved(ui).find(t=>t.id==='old').completed,false);
  clickTask(ui,'done','completed-tasks');
  assert.equal(rows(ui,'carry-tasks').length,3);
  assert.equal(rows(ui,'completed-tasks').length,0);
  clickTask(ui,'old');
  const reopened=boot(ui.values);
  assert.deepEqual(rows(reopened,'carry-tasks').map(node=>node.children[0].attributes['data-task-id']),['done','same-week']);
  assert.equal(saved(ui).length,6);
  assert.equal(saved(ui).find(t=>t.id==='old').date,'2026-10-30');
  assert.equal(new Set(saved(ui).map(t=>t.id)).size,6);
  // Completing from the original date also updates the same record/view.
  ui.byClass('tasks')[0].querySelector('[data-task-id="same-week"]').fire('click');
  assert(!rows(ui,'carry-tasks').some(node=>node.children[0].attributes['data-task-id']==='same-week'));
});

test('Yalnız tamamlanmış geçmiş görevler varsa geri alma kontrolü kalır', () => {
  const ui=boot(stored([task('done','2026-11-01',true)]));
  assert.equal(ui.byClass('carryover')[0].hidden,false);
  assert.equal(rows(ui,'carry-tasks').length,0);
  assert.equal(ui.byClass('completed-tasks')[0].hidden,true);
  ui.byClass('completed-toggle')[0].fire('click');
  clickTask(ui,'done','completed-tasks');
  assert.equal(rows(ui,'carry-tasks').length,1);
  assert.equal(saved(ui)[0].completed,false);
});

test('Eski gün bağlantısı ilgili haftayı açar; hatalı bağlantı uygulamayı bozmaz', () => {
  const ui=boot(new Map(),'#gun/2027-01-01');
  assert.equal(ui.byClass('day').length,7);
  assert.equal(ui.byClass('day')[4].id,'day-2027-01-01');
  assert.equal(ui.document.scrolledTo,'day-2027-01-01');
  assert.equal(ui.location.hash,'');
  assert.equal(boot(new Map(),'#gun/bozuk').byClass('today').length,1);
});

test('Gün/hafta değişimi tarihleri yeniler, incelenen başka haftayı değiştirmez', () => {
  const ui=boot();
  ui.byClass('day-title')[0].fire('click');
  ui.setNow('2026-11-13T12:00:00');
  assert.equal(ui.byClass('today')[0].id,'day-2026-11-13');
  assert.equal(ui.byClass('day-body')[0].hidden,false);
  ui.setNow('2026-11-16T12:00:00');
  assert.equal(ui.byClass('today')[0].id,'day-2026-11-16');
  ui.byClass('previous-week')[0].fire('click');
  const before=ui.byClass('week-range')[0].textContent;
  ui.setNow('2026-11-23T12:00:00');
  assert.equal(ui.byClass('week-range')[0].textContent,before);
});

test('Kaydetme hatasında taslak ve eski görevler kaybolmaz', () => {
  const values=new Map();
  const ui=boot(values);
  ui.add(ui.byClass('add')[3],'Önceki görev');
  values.set=()=>{throw new Error('QuotaExceededError');};
  ui.add(ui.byClass('add')[3],'Kaydedilemeyen taslak');
  assert.equal(ui.byClass('task').length,1);
  assert.equal(ui.byClass('editor')[0].children[1].value,'Kaydedilemeyen taslak');
  assert.equal(ui.notice.hidden,false);
});

test('Girdi metni HTML olarak yorumlanmaz', () => {
  const ui=boot();
  ui.add(ui.byClass('add')[3],'<img src=x onerror=alert(1)>');
  assert.equal(ui.byClass('task-text')[0].textContent,'<img src=x onerror=alert(1)>');
  assert.equal(ui.byClass('task-text')[0].children.length,0);
});

test('Bozuk veya okunamayan eski kayıtlar korunur; boş veri ile üzerlerine yazılmaz', () => {
  const key=storage.storageKey('/haftalik/');
  for (const raw of ['broken','{"tasks":[]}','[{"id":"missing-fields"}]']) {
    const values=new Map([[key,raw]]);
    const ui=boot(values);
    assert.equal(ui.notice.hidden,false);
    assert(ui.byClass('add').every(node=>node.disabled));
    assert.equal(values.get(key),raw);
  }
});

test('Başarısız tamamlama depodaki veriyi ve devreden sayacını değiştirmez', () => {
  const values=stored([task('old','2026-11-01')]);
  const ui=boot(values);
  const before=values.get(storage.storageKey('/haftalik/'));
  values.set=()=>{throw new Error('QuotaExceededError');};
  clickTask(ui,'old');
  assert.equal(values.get(storage.storageKey('/haftalik/')),before);
  assert.equal(rows(ui,'carry-tasks')[0].children[0].attributes['aria-pressed'],'false');
  assert.match(ui.byClass('carry-title')[0].textContent,/\(1\)/);
  assert.equal(ui.notice.hidden,false);
});

test('IME, Escape ve odak kaybı mevcut yerinde yazma davranışını korur', () => {
  const ui=boot();
  ui.byClass('add')[3].fire('click');
  let input=ui.byClass('editor')[0].children[1];
  input.value='Türkçe taslak';
  input.fire('compositionstart');
  input.parent.fire('submit');
  assert.equal(ui.byClass('editor').length,1);
  assert.equal(ui.values.size,0);
  input.fire('compositionend');
  input.fire('keydown',{key:'Escape'});
  assert.equal(ui.byClass('editor').length,0);
  assert.equal(ui.values.size,0);
  ui.byClass('add')[3].fire('click');
  input=ui.byClass('editor')[0].children[1];input.value='Odak kaybında kaydet';
  input.fire('blur');
  assert.equal(saved(ui).length,1);
  assert.equal(saved(ui)[0].text,'Odak kaybında kaydet');
});

test('Gün sayaçları asıl tarihe göre anında güncellenir, devredenler bugüne eklenmez', () => {
  const ui=boot(stored([task('old','2026-11-09'),task('today','2026-11-12')]));
  assert.equal(ui.byClass('day-count')[0].textContent,'0/1 tamamlandı');
  assert.equal(ui.byClass('day-count')[3].textContent,'0/1 tamamlandı');
  clickTask(ui,'old');
  assert.equal(ui.byClass('day-count')[0].textContent,'1/1 tamamlandı');
  assert.equal(ui.byClass('day-count')[3].textContent,'0/1 tamamlandı');
  assert.equal(ui.byClass('day-body')[0].hidden,true);
  ui.add(ui.byClass('add')[3],'Yeni');
  assert.equal(ui.byClass('day-count')[3].textContent,'0/2 tamamlandı');
  assert.equal(ui.byClass('day-count')[4].textContent,'Görev yok');
});

function openMenu(ui,id,within='tasks') {
  const control=ui.byClass(within).map(list=>list.querySelector(`[data-task-id="${id}"]`)).find(Boolean);
  assert(control);control.parentElement.children[1].fire('click');
}
function editTask(ui,id,text,within='tasks') {
  openMenu(ui,id,within);ui.byClass('task-edit-action')[0].fire('click');
  const input=ui.byClass('task-edit')[0].children[0];input.value=text;return input;
}

test('Üç nokta tamamlamaz; yerinde düzenleme kimlik, tarih ve tamamlanmayı korur',()=>{
  const ui=boot(stored([task('today','2026-11-12',true),task('other','2026-11-13')]));
  openMenu(ui,'today');assert.equal(saved(ui)[0].completed,true);
  ui.byClass('task-edit-action')[0].fire('click');
  const input=ui.byClass('task-edit')[0].children[0];input.value='  Güncellenmiş metin  ';
  ui.byClass('edit-save')[0].fire('click');
  assert.deepEqual(saved(ui)[0],{id:'today',date:'2026-11-12',text:'Güncellenmiş metin',completed:true});
  assert.equal(saved(ui).length,2);
  editTask(ui,'today','İptal edilecek');ui.byClass('edit-cancel')[0].fire('click');
  assert.equal(saved(ui)[0].text,'Güncellenmiş metin');
});

test('Boş veya kaydedilemeyen düzenleme taslağı korunur; gezinme taslağı sessizce kaybetmez',()=>{
  const values=stored([task('today','2026-11-12')]);const ui=boot(values);
  editTask(ui,'today','   ');ui.byClass('edit-save')[0].fire('click');
  assert.equal(ui.byClass('task-edit').length,1);assert.equal(saved(ui)[0].text,'today');
  ui.byClass('previous-week')[0].fire('click');assert.equal(ui.byClass('today').length,1);
  ui.byClass('task-edit')[0].children[0].value='Kaydedilemeyen metin';
  values.set=()=>{throw Error('quota');};
  ui.byClass('edit-save')[0].fire('click');
  assert.equal(ui.byClass('task-edit')[0].children[0].value,'Kaydedilemeyen metin');
  assert.equal(saved(ui)[0].text,'today');
});

test('Tarih taşıma tek kaydı günceller, devredenleri ve sayaçları yeniden hesaplar',()=>{
  const ui=boot(stored([task('old','2026-11-09'),task('done','2026-10-01',true)]));
  openMenu(ui,'old','carry-tasks');ui.byClass('task-date-action')[0].fire('click');
  ui.byClass('task-date-input')[0].value='2026-11-12';ui.byClass('task-date-save')[0].fire('click');
  assert.deepEqual(saved(ui)[0],task('old','2026-11-12'));
  assert.equal(ui.byClass('day-count')[0].textContent,'Görev yok');
  assert.equal(ui.byClass('day-count')[3].textContent,'0/1 tamamlandı');
  assert.equal(rows(ui,'carry-tasks').length,0);
  openMenu(ui,'old');ui.byClass('task-date-action')[0].fire('click');
  ui.byClass('task-date-input')[0].value='2026-10-30';ui.byClass('task-date-save')[0].fire('click');
  assert.equal(rows(ui,'carry-tasks').length,1);assert.equal(saved(ui).length,2);
  openMenu(ui,'old','carry-tasks');ui.byClass('task-date-action')[0].fire('click');
  ui.byClass('task-date-input')[0].value='2026-02-30';ui.byClass('task-date-save')[0].fire('click');
  assert.equal(saved(ui)[0].date,'2026-10-30');
  ui.byClass('task-date-cancel')[0].fire('click');
  assert.equal(saved(ui)[1].completed,true);
});

test('Silme açık onay ister; iptal ve kaydetme hatası verileri korur',()=>{
  const values=stored([task('old','2026-11-09'),task('keep','2026-11-12')]);const ui=boot(values);
  openMenu(ui,'old','carry-tasks');ui.byClass('task-delete-action')[0].fire('click');
  assert.equal(saved(ui).length,2);ui.byClass('task-delete-cancel')[0].fire('click');
  assert.equal(saved(ui).length,2);
  openMenu(ui,'old','carry-tasks');ui.byClass('task-delete-action')[0].fire('click');
  const original=values.set.bind(values);values.set=()=>{throw Error('quota');};
  ui.byClass('task-delete-confirm')[0].fire('click');assert.equal(saved(ui).length,2);
  values.set=original;ui.byClass('task-delete-confirm')[0].fire('click');
  assert.deepEqual(saved(ui),[task('keep','2026-11-12')]);assert.equal(rows(ui,'carry-tasks').length,0);
});

test('Bugün ilerlemesi yalnız kendi kayıtlarını sayar; boş veya kapalı gün çubuğu göstermez',()=>{
  const ui=boot(stored([task('a','2026-11-12',true),task('b','2026-11-12',true),...['c','d','e'].map(id=>task(id,'2026-11-12')),task('old','2026-11-09')]));
  assert.equal(ui.byClass('day-progress').length,1);
  assert.equal(ui.byClass('progress-fill')[0].style.width,'40%');
  ui.byClass('day-title')[3].fire('click');assert.equal(ui.byClass('day-body')[3].hidden,true);
  assert.equal(boot().byClass('day-progress')[0].hidden,true);
  assert.equal(ui.byClass('day-count')[3].textContent,'2/5 tamamlandı');
  ui.byClass('day-title')[3].fire('click');
  openMenu(ui,'a');ui.byClass('task-delete-action')[0].fire('click');ui.byClass('task-delete-confirm')[0].fire('click');
  assert.equal(ui.byClass('progress-fill')[0].style.width,'25%');
  assert.equal(ui.byClass('day-count')[3].textContent,'1/4 tamamlandı');
});

test('Devreden görev düzenlemesini kaydedip bölümü kapatmak açık/kapalı durumunu doğru uygular',()=>{
  const ui=boot(stored([task('old','2026-11-09')]));
  editTask(ui,'old','Yeni metin','carry-tasks');
  ui.byClass('carry-title')[0].fire('click');
  assert.equal(saved(ui)[0].text,'Yeni metin');
  assert.equal(ui.byClass('carry-title')[0].attributes['aria-expanded'],'false');
  assert.equal(ui.byClass('carry-tasks')[0].parent.hidden,true);
});
