// Display grouping never rewrites the persistent manual sequence.
export function dailyOrder(tasks) {
  return [...tasks.filter(task => !task.completed), ...tasks.filter(task => task.completed)];
}

// Refill only this date/group's existing slots; every other record stays in place.
export function moveInGroup(tasks, sourceId, targetId, after = false) {
  const source = tasks.find(task => task.id === sourceId);
  const target = tasks.find(task => task.id === targetId);
  if (!source || !target || sourceId === targetId || source.date !== target.date || source.completed !== target.completed) return tasks;
  const matches = task => task.date === source.date && task.completed === source.completed;
  const group = tasks.filter(matches);
  group.splice(group.findIndex(task => task.id === sourceId), 1);
  group.splice(group.findIndex(task => task.id === targetId) + Number(after), 0, source);
  let index = 0;
  const next = tasks.map(task => matches(task) ? group[index++] : task);
  return next.every((task, slot) => task === tasks[slot]) ? tasks : next;
}
