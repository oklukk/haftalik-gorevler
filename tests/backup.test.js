import test from 'node:test';
import assert from 'node:assert/strict';
import { createBackup, parseBackup, previewMerge, MAX_BACKUP_BYTES } from '../backup.js';

const records = [
  { id: 'past', date: '2026-10-30', text: 'Geçmiş', completed: false },
  { id: 'today', date: '2026-11-12', text: '<img src=x onerror=alert(1)>', completed: true },
  { id: 'future', date: '2027-01-01', text: 'Gelecek', completed: false }
];
const file = tasks => JSON.stringify({ format: 'haftalik-gorevler', version: 1, createdAt: '2026-11-12T10:00:00.000Z', tasks });

test('Yerel yedek bütün kayıtları alanları değiştirmeden içerir ve geri okunur', () => {
  const snapshot=JSON.stringify(records);
  const exported=createBackup(records,new Date('2026-11-12T10:00:00Z'));
  assert.deepEqual(parseBackup(exported),records);
  assert.equal(JSON.stringify(records),snapshot);
  const info=JSON.parse(exported);
  assert.equal(info.version,1);
  assert.equal(info.createdAt,'2026-11-12T10:00:00.000Z');
  assert.deepEqual(parseBackup(createBackup([])),[]);
});

test('Birleştirme aynı kaydı çoğaltmaz, bütün çakışmalarda mevcut yerel veriyi korur', () => {
  const local=[...records];
  for (const change of [{text:'Başka'},{date:'2026-11-13'},{completed:true}]) {
    const incoming=[{...records[0],...change}, records[1], {id:'new',date:'2026-12-01',text:'Yeni',completed:false}];
    const result=previewMerge(local,parseBackup(file(incoming)));
    assert.deepEqual([result.total,result.current,result.added,result.identical,result.conflicts],[3,3,1,1,1]);
    assert.deepEqual(result.tasks,[...local,incoming[2]]);
  }
  assert.deepEqual(previewMerge(local,parseBackup(file(local))).tasks,local);
  assert.equal(previewMerge(local,parseBackup(file(local))).added,0);
});

test('Bozuk, beklenmeyen, yinelenen ve uyumsuz yedekler reddedilir', () => {
  for (const text of ['broken','null','[]','{}', file(records).replace('"version":1','"version":2'),
    file(records).replace('2026-11-12T10:00:00.000Z','2026-02-30T10:00:00.000Z'),
    file(records).replace('"format":"haftalik-gorevler"','"format":"other"'),
    file([...records,records[0]])]) assert.throws(()=>parseBackup(text));
  for (const altered of [{date:'2026-02-30'},{date:'2026-13-01'},{date:'2026-2-01'},
    {id:''},{id:99},{text:'   '},{text:{}},{completed:'false'},{extra:true}]) {
    assert.throws(()=>parseBackup(file([{...records[0],...altered}])));
  }
  assert.throws(()=>parseBackup(' '.repeat(MAX_BACKUP_BYTES+1)));
  assert.throws(()=>createBackup([{...records[0],text:'a'.repeat(20001)}]));
  assert.throws(()=>parseBackup(file(Array(20001).fill(records[0]))));
});
