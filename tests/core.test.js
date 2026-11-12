import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { dateKey, parseDate, weekDays, fullDate, weekLabel } from '../dates.js';
import { readTasks, saveTasks, makeTask, storageKey } from '../storage.js';

test('Pazartesi–pazar: hafta, ay, yıl ve artık gün geçişleri', () => {
  for (const [today, monday, sunday] of [
    ['2026-11-12','2026-11-09','2026-11-15'],
    ['2026-11-09','2026-11-09','2026-11-15'],
    ['2026-11-15','2026-11-09','2026-11-15'],
    ['2027-01-01','2026-12-28','2027-01-03'],
    ['2024-02-29','2024-02-26','2024-03-03']
  ]) {
    const days = weekDays(parseDate(today));
    assert.equal(days.length, 7);
    assert.equal(dateKey(days[0]), monday);
    assert.equal(dateKey(days[6]), sunday);
    assert.deepEqual(days.map(day => day.getDay()), [1,2,3,4,5,6,0]);
  }
  assert.equal(fullDate(parseDate('2026-11-16')), 'Pazartesi, 16 Kasım');
  assert.equal(weekLabel(weekDays(parseDate('2027-01-01'))), '28 Aralık 2026 – 3 Ocak 2027');
  assert.equal(parseDate('2026-02-30'), null);
});

test('Yerel tarihler saat dilimine bağlı olarak gün değiştirmez', () => {
  const previous = process.env.TZ;
  try {
    for (const zone of ['Europe/Istanbul', 'America/Los_Angeles', 'Pacific/Auckland']) {
      process.env.TZ = zone;
      assert.equal(dateKey(new Date(2026, 10, 12, 0, 5)), '2026-11-12');
      assert.equal(dateKey(weekDays(new Date(2026, 10, 15, 23, 59))[0]), '2026-11-09');
    }
  } finally { if (previous) process.env.TZ = previous; else delete process.env.TZ; }
});

test('Boş görevler reddedilir; Türkçe metin, kimlik ve tamamlanma kalıcıdır', () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const key = storageKey('/haftalik/');
  assert.deepEqual(readTasks(storage,key), []);
  assert.equal(makeTask('2026-11-12','   ','empty'), null);
  const task = makeTask('2026-11-12','  Çözümleri gözden geçir  ','one');
  assert.deepEqual(task, { id:'one',date:'2026-11-12',text:'Çözümleri gözden geçir',completed:false });
  const past = makeTask('2026-11-01','Geçmiş görev','past');
  saveTasks(storage,key,[past,{...task,completed:true}]);
  const restored = readTasks(storage,key);
  assert.equal(restored[1].completed,true);
  assert.equal(restored[0].date,'2026-11-01');
  assert.deepEqual(readTasks(storage,storageKey('/baska/')),[]);
  storage.setItem(key,'broken');
  assert.throws(() => readTasks(storage,key));
  assert.equal(storage.getItem(key),'broken');
});

test('PWA dosyaları ve göreli yollar eksiksizdir', () => {
  const base = new URL('../', import.meta.url);
  const manifest = JSON.parse(fs.readFileSync(new URL('manifest.webmanifest',base)));
  assert.equal(manifest.start_url,'./');
  assert.equal(manifest.scope,'./');
  assert.equal(manifest.display,'standalone');
  for (const icon of manifest.icons) {
    assert(icon.src.startsWith('./'));
    assert(fs.existsSync(new URL(icon.src,base)));
  }
  const html=fs.readFileSync(new URL('index.html',base),'utf8');
  assert(html.includes('lang="tr"'));
  for (const [,path] of html.matchAll(/(?:href|src)="(\.[^"]+)"/g)) assert(fs.existsSync(new URL(path,base)),path);
});

test('Service worker: alt dizin, ilk önbellek, çevrimdışı açılış ve güvenli temizlik', async () => {
  const handlers = {};
  const scope = 'https://example.test/haftalik/';
  const entries = new Map();
  const deleted = [];
  const cache = {
    async addAll(paths) {
      for (const path of paths) {
        assert(fs.existsSync(new URL(path === './' ? '../index.html' : `../${path}`,import.meta.url)),path);
        entries.set(new URL(path,scope).href, { file:path });
      }
    },
    async match(request) { return entries.get(typeof request === 'string' ? request : request.url); }
  };
  const prefix = `haftalik-gorevler:${scope}:`;
  vm.runInNewContext(fs.readFileSync(new URL('../sw.js',import.meta.url),'utf8'), {
    URL,
    self: { registration:{scope}, clients:{ async claim() {} }, addEventListener:(name,fn) => { handlers[name]=fn; } },
    caches:{ async open(){ return cache; }, async keys(){ return [`${prefix}v0`,`${prefix}v1`,'another-app']; }, async delete(key){deleted.push(key);} },
    fetch:async () => {throw new Error('Çevrimdışı');}
  });
  let pending;
  handlers.install({waitUntil:promise=>{pending=promise;}});
  await pending;
  assert(entries.has(`${scope}app.js`));
  handlers.activate({waitUntil:promise=>{pending=promise;}});
  await pending;
  assert.deepEqual(deleted,[`${prefix}v0`]);
  for (const [path,mode,expected] of [['','navigate','./'],['app.js','cors','./app.js'],['?acilis=1','navigate','./index.html']]) {
    handlers.fetch({ request:{url:scope+path,method:'GET',mode}, respondWith:promise=>{pending=promise;} });
    assert.equal((await pending).file, expected);
  }
  let intercepted=false;
  handlers.fetch({request:{url:'https://example.test/other/',method:'GET'},respondWith:()=>{intercepted=true;}});
  assert.equal(intercepted,false);
});
