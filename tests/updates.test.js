import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

class Events {
  handlers={};
  addEventListener(type,fn){(this.handlers[type]??=[]).push(fn);}
  emit(type){for(const fn of this.handlers[type]??[])fn();}
}
function boot({offline=false,waiting=false,prepare=true}={}) {
  const worker=new Events();worker.state='installed';
  const reg=new Events();reg.waiting=waiting?worker:null;reg.installing=null;
  let calls=0,failed=false,blocked=false,prepares=0,reloads=0;
  reg.update=async()=>{calls++;if(failed)throw Error('offline');};
  const sw=new Events();sw.controller={};sw.register=async()=>reg;
  worker.postMessage=(data,ports)=>{assert.equal(data.type,'ACTIVATE_UPDATE');if(blocked)ports[0].peer.onmessage({data:{type:'UPDATE_BLOCKED'}});};
  class Channel {constructor(){this.port1={close(){}};this.port2={peer:this.port1};}}
  const statuses=[],ready=[],timers=[];
  const context={navigator:{serviceWorker:sw,onLine:!offline},MessageChannel:Channel,setTimeout:fn=>timers.push(fn),location:{reload(){reloads++;}}};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(new URL('../updates.js',import.meta.url),'utf8').replace('export function','function')+'\nglobalThis.factory=setupUpdates;',context);
  const controller=context.factory({onStatus:text=>statuses.push(text),onReady:value=>ready.push(value),prepareUpdate:()=>{prepares++;return prepare;}});
  return {controller,reg,worker,sw,statuses,ready,timers,get calls(){return calls;},get prepares(){return prepares;},get reloads(){return reloads;},fail(){failed=true;},block(){blocked=true;},unblock(){blocked=false;}};
}

test('Başarılı kontrol gerçek registration.update çağrısına dayanır; çevrimdışı ve hata güncel sayılmaz',async()=>{
  const ui=boot();await ui.controller.check();
  assert.equal(ui.calls,1);assert.match(ui.statuses.at(-1),/yeni sürüm bulunamadı/);
  ui.fail();await ui.controller.check();assert.match(ui.statuses.at(-1),/kontrol edilemedi/);
  const offline=boot({offline:true});await offline.controller.check();
  assert.equal(offline.calls,0);assert.match(offline.statuses.at(-1),/kontrol edilemedi/);
});
test('İndirme ve hazır durumları gerçek worker yaşam döngüsünü izler; Daha Sonra yeniden yüklemez',async()=>{
  const ui=boot();await ui.controller.check();
  ui.reg.installing=ui.worker;ui.worker.state='installing';ui.reg.emit('updatefound');
  assert.match(ui.statuses.at(-1),/indiriliyor/);
  ui.reg.waiting=ui.worker;ui.worker.state='installed';ui.worker.emit('statechange');
  assert.equal(ui.ready.at(-1),true);
  ui.controller.later();assert.equal(ui.ready.at(-1),false);assert.equal(ui.reloads,0);
  await ui.controller.check();assert.equal(ui.ready.at(-1),true);
});
test('Taslak korunmadan güncelleme yok; etkinleştirmeden önce yenileme yok; diğer sekme değişimi onaysız yenilemez',async()=>{
  const no=boot({waiting:true,prepare:false});await no.controller.apply();no.sw.emit('controllerchange');
  assert.equal(no.prepares,1);assert.equal(no.reloads,0);assert.match(no.statuses.join(' '),/Taslak kaydedilemedi/);
  const yes=boot({waiting:true});await yes.controller.apply();assert.equal(yes.reloads,0);
  yes.sw.emit('controllerchange');assert.equal(yes.reloads,1);
  const other=boot();await other.controller.check();other.sw.emit('controllerchange');assert.equal(other.reloads,0);
});
test('Çoklu pencere engeli ve etkinleştirme zaman aşımı kullanıcıya doğru bildirilir',async()=>{
  const ui=boot({waiting:true});ui.block();await ui.controller.apply();
  assert.match(ui.statuses.at(-1),/Diğer uygulama/);ui.sw.emit('controllerchange');assert.equal(ui.reloads,0);
  const timeout=boot({waiting:true});await timeout.controller.apply();timeout.timers[0]();
  assert.match(timeout.statuses.at(-1),/tamamen kapatıp/);timeout.sw.emit('controllerchange');assert.equal(timeout.reloads,0);
});

test('Service worker yalnız tek ve isteği gönderen pencere için skipWaiting yapar',async()=>{
  for(const windows of [[],[{id:'a',url:'https://example.test/haftalik/'}],[{id:'a',url:'https://example.test/haftalik/'},{id:'b',url:'https://example.test/haftalik/'}]]){
    const handlers={};let skipped=0,blocked=0,pending;
    vm.runInNewContext(fs.readFileSync(new URL('../sw.js',import.meta.url),'utf8'),{URL,self:{registration:{scope:'https://example.test/haftalik/'},addEventListener:(n,f)=>handlers[n]=f,clients:{matchAll:async()=>windows},skipWaiting:async()=>{skipped++;}}});
    handlers.message({data:{type:'ACTIVATE_UPDATE'},source:{id:'a'},ports:[{postMessage(data){assert.equal(data.type,'UPDATE_BLOCKED');blocked++;}}],waitUntil:p=>pending=p});await pending;
    assert.equal(skipped,windows.length===1?1:0);assert.equal(blocked,windows.length===1?0:1);
  }
});

test('Önceki başarısız denemenin zaman aşımı yeni etkinleştirme onayını iptal etmez',async()=>{
  const ui=boot({waiting:true});ui.block();await ui.controller.apply();
  ui.unblock();await ui.controller.apply();
  // The first attempt's timer must not touch the second attempt.
  const statusCount=ui.statuses.length;ui.timers[0]();
  assert.equal(ui.statuses.length,statusCount);
  ui.sw.emit('controllerchange');assert.equal(ui.reloads,1);
});
