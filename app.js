import { dateKey, parseDate, weekDays, dayName, shortDate, fullDate, weekLabel } from './dates.js';
import { storageKey, readTasks, saveTasks, makeTask } from './storage.js';

const app = document.querySelector('#app');
const notice = document.querySelector('#notice');
const key = storageKey(new URL('./', import.meta.url).pathname);
let tasks = [];
let canWrite = true;
let visibleToday = dateKey(new Date());
let editor = null;
let weekScroll = 0;

function showNotice(message) {
  notice.textContent = message;
  notice.hidden = false;
}

try {
  tasks = readTasks(localStorage, key);
} catch {
  // Never overwrite unreadable data with an empty list.
  canWrite = false;
  showNotice('Bu cihazdaki görevler okunamadı. Tarayıcıda yerel depolamaya izin verip sayfayı yeniden açın.');
}

function persist(next) {
  if (!canWrite) return false;
  try {
    saveTasks(localStorage, key, next);
    tasks = next;
    notice.hidden = true;
    return true;
  } catch {
    showNotice('Görev kaydedilemedi. Cihazın boş alanını ve tarayıcının depolama iznini kontrol edip yeniden deneyin.');
    return false;
  }
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function selectedDay() {
  if (!location.hash.startsWith('#gun/')) return null;
  return parseDate(location.hash.slice(5));
}

function setTaskState(button, task) {
  button.setAttribute('aria-pressed', String(task.completed));
  button.setAttribute('aria-label', `${task.text} — ${task.completed ? 'Tamamlanmayı geri al' : 'Tamamla'}`);
}

function taskRow(task) {
  const item = element('li');
  const button = element('button', 'task');
  button.type = 'button';
  const mark = element('span', 'task-mark');
  mark.setAttribute('aria-hidden', 'true');
  button.append(mark, element('span', 'task-text', task.text));
  setTaskState(button, task);
  button.addEventListener('click', () => {
    const current = tasks.find(value => value.id === task.id);
    if (!current) return;
    const updated = { ...current, completed: !current.completed };
    if (persist(tasks.map(value => value.id === updated.id ? updated : value))) setTaskState(button, updated);
  });
  item.append(button);
  return item;
}

function listFor(date) {
  const container = element('div');
  const list = element('ul', 'tasks');
  list.setAttribute('aria-label', `${fullDate(date)} görevleri`);
  const dayKey = dateKey(date);
  tasks.filter(task => task.date === dayKey).forEach(task => list.append(taskRow(task)));
  const add = element('button', 'add', '+ Madde ekle');
  add.type = 'button';
  add.disabled = !canWrite;
  add.setAttribute('aria-label', `${fullDate(date)} için madde ekle`);
  add.addEventListener('click', () => {
    // Keep focus synchronous with the touch gesture so iOS opens its keyboard.
    if (editor && !editor.finish()) return;
    const form = element('form', 'editor');
    const mark = element('span', 'task-mark');
    mark.setAttribute('aria-hidden', 'true');
    const input = element('input');
    input.type = 'text';
    input.placeholder = 'Yeni madde';
    input.setAttribute('aria-label', `${fullDate(date)} için yeni madde`);
    input.setAttribute('enterkeyhint', 'done');
    input.autocomplete = 'off';
    form.append(mark, input);
    add.hidden = true;
    container.append(form);
    let finished = false;
    const finish = (cancel = false) => {
      if (finished) return true;
      const task = cancel ? null : makeTask(dayKey, input.value);
      if (task && !persist([...tasks, task])) return false;
      finished = true;
      editor = null;
      if (task) list.append(taskRow(task));
      form.remove();
      add.hidden = false;
      return true;
    };
    editor = { input, finish };
    form.addEventListener('submit', event => {
      event.preventDefault();
      if (event.isComposing || input.composing) return;
      if (finish()) add.focus({ preventScroll: true });
    });
    input.addEventListener('compositionstart', () => { input.composing = true; });
    input.addEventListener('compositionend', () => { input.composing = false; });
    input.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        finish(true);
        add.focus({ preventScroll: true });
      }
    });
    input.addEventListener('blur', () => finish());
    input.focus();
  });
  container.append(list, add);
  return container;
}

function render(focus = false) {
  if (editor && !editor.finish()) return;
  visibleToday = dateKey(new Date());
  const selected = selectedDay();
  app.replaceChildren();
  if (selected) {
    document.title = `${fullDate(selected)} · Bu hafta`;
    const header = element('header', 'detail-header');
    const back = element('button', 'back');
    back.type = 'button';
    const arrow = element('span', '', '←');
    arrow.setAttribute('aria-hidden', 'true');
    back.append(arrow, document.createTextNode('Bu hafta'));
    back.addEventListener('click', () => {
      if (editor && !editor.finish()) return;
      if (history.state?.dayView) history.back();
      else {
        history.replaceState(null, '', location.pathname + location.search);
        render(true);
      }
    });
    const heading = element('h1', '', dayName(selected));
    const date = element('p', 'detail-date', `${shortDate(selected)} ${selected.getFullYear()}`);
    header.append(back, heading, date);
    const content = element('section', 'detail-day');
    content.append(listFor(selected));
    app.append(header, content);
  } else {
    document.title = 'Bu hafta · Haftalık görevler';
    const days = weekDays();
    const header = element('header', 'page-header');
    header.append(element('p', 'eyebrow', 'HAFTALIK GÖREVLER'), element('h1', '', 'Bu hafta'), element('p', 'week-range', weekLabel(days)));
    app.append(header);
    days.forEach(date => {
      const today = dateKey(date) === visibleToday;
      const section = element('section', `day${today ? ' today' : ''}`);
      const heading = element('h2');
      const button = element('button', 'day-title');
      button.type = 'button';
      button.append(element('span', '', fullDate(date)));
      if (today) {
        button.setAttribute('aria-current', 'date');
        button.append(element('span', 'today-label', 'Bugün'));
      }
      button.addEventListener('click', () => {
        if (editor && !editor.finish()) return;
        weekScroll = window.scrollY;
        history.pushState({ dayView: true }, '', `#gun/${dateKey(date)}`);
        render(true);
      });
      heading.append(button);
      section.append(heading, listFor(date));
      app.append(section);
    });
  }
  if (focus) {
    app.focus({ preventScroll: true });
    window.scrollTo(0, selected ? 0 : weekScroll);
  }
}

window.addEventListener('popstate', () => render(true));
window.addEventListener('hashchange', () => {
  // popstate handles history navigation; this also supports pasted day links.
  if (!editor) render();
});
function refreshDate() {
  if (visibleToday !== dateKey(new Date())) render();
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshDate(); });
window.addEventListener('pageshow', refreshDate);
setInterval(refreshDate, 30_000);
render();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {
    showNotice('Çevrimdışı kullanım hazırlanamadı. İnternet bağlantınız varken sayfayı yeniden açın.');
  });
}
