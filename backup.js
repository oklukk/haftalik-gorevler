import { parseDate } from './dates.js';

export const BACKUP_VERSION = 1;
export const MAX_BACKUP_BYTES = 5 * 1024 * 1024;
const MAX_TASKS = 20000;
const fields = ['id', 'date', 'text', 'completed'];

function validateTasks(tasks) {
  if (!Array.isArray(tasks) || tasks.length > MAX_TASKS) throw new Error('Yedek görev listesi geçersiz veya çok büyük.');
  const ids = new Set();
  return tasks.map(task => {
    if (!task || typeof task !== 'object' || Object.keys(task).length !== fields.length ||
        !fields.every(field => Object.hasOwn(task, field)) ||
        typeof task.id !== 'string' || !task.id.trim() || task.id.length > 200 ||
        typeof task.date !== 'string' || !parseDate(task.date) ||
        typeof task.text !== 'string' || !task.text.trim() || task.text.length > 20000 ||
        typeof task.completed !== 'boolean') throw new Error('Yedekte geçersiz görev alanı veya takvim tarihi var.');
    if (ids.has(task.id)) throw new Error('Yedekte yinelenen görev kimliği var. Hiçbir kayıt değiştirilmedi.');
    ids.add(task.id);
    return { id: task.id, date: task.date, text: task.text, completed: task.completed };
  });
}
export function parseBackup(text) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > MAX_BACKUP_BYTES) throw new Error('Yedek en fazla 5 MB olabilir.');
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('Dosya geçerli JSON değil.'); }
  if (!data || data.format !== 'haftalik-gorevler' || data.version !== BACKUP_VERSION ||
      Object.keys(data).sort().join(',') !== 'createdAt,format,tasks,version' ||
      typeof data.createdAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(data.createdAt) ||
      !Number.isFinite(Date.parse(data.createdAt)) || new Date(data.createdAt).toISOString() !== data.createdAt) {
    throw new Error('Yedek biçimi, sürümü veya oluşturulma tarihi desteklenmiyor.');
  }
  return validateTasks(data.tasks);
}
export function createBackup(tasks, now = new Date()) {
  const text = JSON.stringify({ format: 'haftalik-gorevler', version: BACKUP_VERSION, createdAt: now.toISOString(), tasks: validateTasks(tasks) }, null, 2);
  if (new TextEncoder().encode(text).length > MAX_BACKUP_BYTES) throw new Error('Görevler 5 MB yedek sınırını aşıyor.');
  return text;
}
export function previewMerge(current, incoming) {
  const known = new Map(current.map(task => [task.id, task]));
  let identical = 0, conflicts = 0;
  const added = [];
  for (const task of incoming) {
    const local = known.get(task.id);
    if (!local) added.push(task);
    else if (fields.every(field => local[field] === task[field])) identical++;
    else conflicts++;
  }
  return { total: incoming.length, current: current.length, added: added.length, identical, conflicts, tasks: [...current, ...added] };
}
