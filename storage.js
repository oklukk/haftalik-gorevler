// The URL namespace keeps other apps on the same GitHub Pages origin separate.
export const storageKey = basePath => `haftalik-gorevler:v1:${basePath}`;

export function readTasks(storage, key) {
  const raw = storage.getItem(key);
  if (raw === null) return [];
  const tasks = JSON.parse(raw);
  if (!Array.isArray(tasks) || tasks.some(task =>
    !task || typeof task.id !== 'string' || typeof task.date !== 'string' ||
    typeof task.text !== 'string' || !task.text.trim() || typeof task.completed !== 'boolean'
  )) throw new Error('Geçersiz görev verisi');
  return tasks;
}

export function saveTasks(storage, key, tasks) {
  storage.setItem(key, JSON.stringify(tasks));
}

export function makeTask(date, text, id = crypto.randomUUID()) {
  const trimmed = text.trim();
  return trimmed ? { id, date, text: trimmed, completed: false } : null;
}
