// These tests exercise the real app handlers in a minimal DOM double.
// They do not replace real Safari/Chrome layout, keyboard or offline browser QA.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as dates from '../dates.js';
import * as storage from '../storage.js';

class Node {
  constructor(tag, document) { this.tagName=tag; this.document=document; this.children=[]; this.handlers={}; this.attributes={}; this.hidden=false; this.value=''; this.ownText=''; }
  set textContent(value) { this.ownText=value; this.children=[]; }
  get textContent() { return this.ownText + this.children.map(child=>child.textContent).join(''); }
  append(...nodes) { for (const node of nodes) { node.parent=this; this.children.push(node); } }
  replaceChildren(...nodes) { this.children=[]; this.append(...nodes); }
  remove() { if(this.parent) this.parent.children=this.parent.children.filter(child=>child!==this); }
  setAttribute(name,value) { this.attributes[name]=value; }
  addEventListener(name,fn) { (this.handlers[name]??=[]).push(fn); }
  fire(name,extra={}) { for (const fn of this.handlers[name]??[]) fn({preventDefault(){},...extra}); }
  focus() {
    const old=this.document.activeElement;
    this.document.activeElement=this;
    if(old && old!==this) old.fire('blur');
  }
}

function boot(values=new Map()) {
  const document={hidden:false, addEventListener(){}};
  document.createElement=tag=>new Node(tag,document);
  document.createTextNode=text=>{ const node=new Node('#text',document); node.textContent=text; return node; };
  const app=document.createElement('main'), notice=document.createElement('p');
  document.querySelector=selector=>selector==='#app'?app:notice;
  const listeners={};
  const location={pathname:'/haftalik/',search:'',hash:''};
  const history={state:null,pushState(state,_,url){this.state=state;location.hash=url;},replaceState(state){this.state=state;location.hash='';},back(){location.hash='';this.state=null;listeners.popstate();}};
  const localStorage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
  const sandbox={...dates,...storage,document,location,history,localStorage,URL,crypto,Date,Intl,navigator:{},setInterval(){},window:{scrollY:80,scrollTo(){},addEventListener(name,fn){listeners[name]=fn;}}};
  const source=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8')
    .replace(/^import .*;\n/gm,'')
    .replace('import.meta.url',JSON.stringify('https://example.test/haftalik/app.js'));
  vm.runInNewContext(source,sandbox);
  const all=(predicate,node=app)=>[...(predicate(node)?[node]:[]),...node.children.flatMap(child=>all(predicate,child))];
  const byClass=name=>all(node=>node.className?.split(' ').includes(name));
  const add=(button,text)=>{button.fire('click'); const input=byClass('editor')[0].children[1]; assert.equal(document.activeElement,input); input.value=text; input.parent.fire('submit');};
  return {app,notice,location,history,values,byClass,add,document};
}

test('Ana sayfa ve detay: ekleme, boş girdi, tamamlama, geri alma, geri navigasyon ve yeniden açılış', () => {
  const ui=boot();
  assert.equal(ui.byClass('day').length,7);
  assert.equal(ui.byClass('today').length,1);
  ui.add(ui.byClass('add')[0],'   ');
  assert.equal(ui.byClass('task').length,0);
  ui.add(ui.byClass('add')[0],'  Çalışmayı gözden geçir  ');
  assert.equal(ui.byClass('task-text')[0].textContent,'Çalışmayı gözden geçir');
  ui.byClass('day-title')[0].fire('click');
  assert(ui.location.hash.startsWith('#gun/'));
  assert.equal(ui.byClass('day').length,0);
  assert.equal(ui.byClass('task').length,1);
  ui.add(ui.byClass('add')[0],'İkinci görev');
  const task=ui.byClass('task')[0];
  task.fire('click');
  assert.equal(task.attributes['aria-pressed'],'true');
  assert.equal(ui.byClass('task').length,2);
  const reopened=boot(ui.values);
  assert.equal(reopened.byClass('task')[0].attributes['aria-pressed'],'true');
  task.fire('click');
  assert.equal(task.attributes['aria-pressed'],'false');
  ui.byClass('back')[0].fire('click');
  assert.equal(ui.byClass('day').length,7);
  assert.equal(ui.byClass('task').length,2);
  ui.byClass('day-title')[0].fire('click');
  ui.history.back();
  assert.equal(ui.byClass('day').length,7);
  const ids=JSON.parse([...ui.values.values()][0]).map(task=>task.id);
  assert.equal(new Set(ids).size,2);
});

test('Kaydetme hatasında taslak ve eski görevler kaybolmaz', () => {
  const values=new Map();
  const ui=boot(values);
  ui.add(ui.byClass('add')[0],'Önceki görev');
  values.set=()=>{throw new Error('QuotaExceededError');};
  ui.add(ui.byClass('add')[0],'Kaydedilemeyen taslak');
  assert.equal(ui.byClass('task').length,1);
  assert.equal(ui.byClass('editor')[0].children[1].value,'Kaydedilemeyen taslak');
  assert.equal(ui.notice.hidden,false);
});

test('Girdi metni HTML olarak yorumlanmaz', () => {
  const ui=boot();
  ui.add(ui.byClass('add')[0],'<img src=x onerror=alert(1)>');
  assert.equal(ui.byClass('task-text')[0].textContent,'<img src=x onerror=alert(1)>');
  assert.equal(ui.byClass('task-text')[0].children.length,0);
});
