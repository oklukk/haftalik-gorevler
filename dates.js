// Local calendar dates deliberately avoid UTC conversions (toISOString).
export function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function parseDate(key) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(year, month - 1, day, 12);
  return dateKey(date) === key ? date : null;
}

export function weekDays(now = new Date()) {
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7);
  return Array.from({ length: 7 }, (_, offset) => {
    const day = new Date(monday);
    day.setDate(monday.getDate() + offset);
    return day;
  });
}

export const dayName = date => new Intl.DateTimeFormat('tr-TR', { weekday: 'long' }).format(date);
export const shortDate = date => new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long' }).format(date);
export const fullDate = date => `${dayName(date)}, ${shortDate(date)}`;

export function weekLabel(days) {
  const first = days[0], last = days[6];
  if (first.getFullYear() !== last.getFullYear()) {
    return `${shortDate(first)} ${first.getFullYear()} – ${shortDate(last)} ${last.getFullYear()}`;
  }
  const start = first.getMonth() === last.getMonth() ? first.getDate() : shortDate(first);
  return `${start} – ${shortDate(last)} ${last.getFullYear()}`;
}

// Calendar arithmetic remains correct across daylight-saving changes.
export function shiftWeek(date, offset) {
  const monday = weekDays(date)[0];
  monday.setDate(monday.getDate() + offset * 7);
  return monday;
}

export function weekTitle(selected, today = new Date()) {
  const start = dateKey(weekDays(selected)[0]);
  if (start === dateKey(weekDays(today)[0])) return 'Bu Hafta';
  if (start === dateKey(shiftWeek(today, -1))) return 'Önceki Hafta';
  if (start === dateKey(shiftWeek(today, 1))) return 'Gelecek Hafta';
  return weekLabel(weekDays(selected));
}
