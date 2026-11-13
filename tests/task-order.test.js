import test from 'node:test';
import assert from 'node:assert/strict';
import { dailyOrder, moveInGroup } from '../task-order.js';
import { createBackup, parseBackup, previewMerge } from '../backup.js';
const task = (id, completed = false, date = '2026-11-13') => ({ id, date, text:id, completed });
const ids = tasks => tasks.map(task => task.id);

test('Kararlı görüntü gruplaması kalıcı manuel sırayı değiştirmez, geri almada eski konuma döner',()=>{
  const tasks=[task('A'),task('B',true),task('C'),task('D',true)];
  assert.deepEqual(ids(dailyOrder(tasks)),['A','C','B','D']);
  assert.deepEqual(ids(tasks),['A','B','C','D']);
  const undone=tasks.map(t=>t.id==='B'?{...t,completed:false}:t);
  assert.deepEqual(ids(dailyOrder(undone)),['A','B','C','D']);
  assert.deepEqual(dailyOrder([]),[]);
});

test('Sürükleme yalnız seçilen tarih/grubun slotlarını doldurur; bütün diğer kayıtlar korunur',()=>{
  const tasks=[task('A'),task('old',false,'2026-11-09'),task('B',true),task('C'),task('D',true),task('E'),task('future',false,'2027-01-01')];
  const snapshot=JSON.stringify(tasks);
  const reordered=moveInGroup(tasks,'E','A');
  assert.deepEqual(ids(reordered),['E','old','B','A','D','C','future']);
  assert.deepEqual(ids(dailyOrder(reordered.filter(t=>t.date==='2026-11-13'))),['E','A','C','B','D']);
  for(const index of [1,2,4,6])assert.equal(reordered[index],tasks[index]);
  assert.equal(JSON.stringify(tasks),snapshot);
  assert.deepEqual([...reordered].sort((a,b)=>a.id.localeCompare(b.id)),[...tasks].sort((a,b)=>a.id.localeCompare(b.id)));
  const done=moveInGroup(tasks,'D','B');
  assert.deepEqual(ids(done),['A','old','D','C','B','E','future']);
});

test('Gruplar/günler arası veya anlamsız bırakmalar eski diziyi döndürür; yeni görev son sırada görünür',()=>{
  const tasks=[task('A'),task('B',true),task('C'),task('old',false,'2026-11-09')];
  for(const args of [['A','B'],['A','old'],['A','A'],['missing','A'],['A','missing'],['A','C',false]])assert.equal(moveInGroup(tasks,...args),tasks);
  assert.deepEqual(ids(moveInGroup(tasks,'A','C',true)),['C','B','A','old']);
  assert.deepEqual(ids(dailyOrder([...tasks.slice(0,3),task('new')])),['A','C','new','B']);
});

test('Manuel sıra JSON yedeği, boş cihaza birleştirme ve geri yükleme boyunca aynen korunur',()=>{
  const tasks=moveInGroup([task('A'),task('B',true),task('C'),task('D',true)],'C','A');
  const imported=parseBackup(createBackup(tasks));
  assert.deepEqual(imported,tasks);
  assert.deepEqual(previewMerge([],imported).tasks,tasks);
  assert.deepEqual(previewMerge(tasks,imported).tasks,tasks);
  assert.deepEqual(dailyOrder(imported),dailyOrder(tasks));
});
