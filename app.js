import { setupSettings } from './settings.js';
import { dateKey, parseDate, weekDays, shortDate, fullDate, weekLabel, shiftWeek, weekTitle } from './dates.js';
import { storageKey, readTasks, saveTasks, makeTask } from './storage.js';

const app = document.querySelector('#app');
const notice = document.querySelector('#notice');
const key = storageKey(new URL('./', import.meta.url).pathname);
let tasks = [];
let canWrite = true;
let visibleToday = dateKey(new Date());
let selectedWeek = weekDays()[0];
let editor = null;
const expandedDays = new Map();
const dayLists = new Map();
const daySections = new Map();
// View state only: no duplicate task records or changes to original dates.
const retainedCompleted = new Set();
let carryOpen = true;
let completedOpen = false;
let header, todayButton, carryHost;
let framePending = false;
let settings;
let holdEditor = false;

function showNotice(message) {
  notice.textContent = message;
  notice.hidden = false;
}
try {
  tasks = readTasks(localStorage, key);
} catch {
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
function button(className, text, label) {
  const node = element('button', className, text);
  node.type = 'button';
  if (label) node.setAttribute('aria-label', label);
  return node;
}
function disclosure(control, open) {
  control.setAttribute('aria-expanded', String(open));
  const arrow = element('span', 'chevron', open ? '⌃' : '⌄');
  arrow.setAttribute('aria-hidden', 'true');
  control.append(arrow);
}
function taskRow(task, carry = false) {
  const item = element('li');
  const control = button('task', undefined, `${task.text} — ${task.completed ? 'Tamamlanmayı geri al' : 'Tamamla'}`);
  control.setAttribute('aria-pressed', String(task.completed));
  control.setAttribute('data-task-id', task.id);
  control.disabled = !canWrite;
  const mark = element('span', 'task-mark');
  mark.setAttribute('aria-hidden', 'true');
  const text = element('span', 'task-content');
  text.append(element('span', 'task-text', task.text));
  if (carry) {
    const date = parseDate(task.date);
    text.append(element('small', 'task-date', date ? `${shortDate(date)} ${date.getFullYear()}` : task.date));
  }
  control.append(mark, text);
  control.addEventListener('click', () => {
    const current = tasks.find(value => value.id === task.id);
    if (!current) return;
    const updated = { ...current, completed: !current.completed };
    if (!persist(tasks.map(value => value.id === updated.id ? updated : value))) return;
    if (carry && updated.completed) retainedCompleted.add(updated.id);
    if (!updated.completed) retainedCompleted.delete(updated.id);
    refreshTasks();
    // Replacing rows keeps the data in sync in both original and carryover lists.
    // Restore keyboard focus without changing the user's scroll position.
    const replacement = (carry ? carryHost : dayLists.get(task.date))?.querySelector(`[data-task-id="${CSS.escape(task.id)}"]`);
    replacement?.focus({ preventScroll: true });
  });
  item.append(control);
  return item;
}
function listFor(date) {
  const container = element('div');
  const list = element('ul', 'tasks');
  list.setAttribute('aria-label', `${fullDate(date)} görevleri`);
  const dayKey = dateKey(date);
  dayLists.set(dayKey, list);
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
      if (task) refreshTasks();
      form.remove();
      add.hidden = false;
      return true;
    };
    editor = { input, finish, dayKey };
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
    input.addEventListener('blur', () => { if (!holdEditor && !settings?.isOpen()) finish(); });
    input.focus();
  });
  container.append(list, add);
  return container;
}

function renderCarryover() {
  if (!carryHost) return;
  carryHost.replaceChildren();
  const past = tasks.filter(task => task.date < visibleToday && parseDate(task.date))
    .sort((a, b) => a.date.localeCompare(b.date));
  const active = past.filter(task => !task.completed || retainedCompleted.has(task.id));
  const completed = past.filter(task => task.completed && !retainedCompleted.has(task.id));
  carryHost.hidden = past.length === 0;
  if (!past.length) return;
  const heading = element('h3');
  const toggle = button('carry-title', `Devreden Görevler (${past.filter(task => !task.completed).length})`);
  toggle.setAttribute('aria-controls', 'carry-content');
  disclosure(toggle, carryOpen);
  toggle.addEventListener('click', () => {
    carryOpen = !carryOpen;
    body.hidden = !carryOpen;
    toggle.setAttribute('aria-expanded', String(carryOpen));
    toggle.querySelector('.chevron').textContent = carryOpen ? '⌃' : '⌄';
    scheduleVisibility();
  });
  heading.append(toggle);
  const body = element('div');
  body.id = 'carry-content';
  body.hidden = !carryOpen;
  const list = element('ul', 'tasks carry-tasks');
  active.forEach(task => list.append(taskRow(task, true)));
  body.append(list);
  if (past.some(task => task.completed)) {
    const show = button('completed-toggle', completedOpen ? 'Tamamlananları gizle' : 'Tamamlananları göster');
    show.setAttribute('aria-expanded', String(completedOpen));
    show.setAttribute('aria-controls', 'completed-tasks');
    show.addEventListener('click', () => {
      completedOpen = !completedOpen;
      done.hidden = !completedOpen;
      show.textContent = completedOpen ? 'Tamamlananları gizle' : 'Tamamlananları göster';
      show.setAttribute('aria-expanded', String(completedOpen));
      scheduleVisibility();
    });
    const done = element('ul', 'tasks completed-tasks');
    done.id = 'completed-tasks';
    done.hidden = !completedOpen;
    completed.forEach(task => done.append(taskRow(task, true)));
    body.append(show, done);
  }
  carryHost.append(heading, body);
}
function refreshTasks() {
  for (const [date, list] of dayLists) {
    list.replaceChildren();
    const daily = tasks.filter(task => task.date === date);
    daily.forEach(task => list.append(taskRow(task)));
    daySections.get(date).querySelector('.day-count').textContent = daily.length ? `${daily.filter(task => task.completed).length}/${daily.length} tamamlandı` : 'Görev yok';
  }
  renderCarryover();
  scheduleVisibility();
}
function currentWeek() { return dateKey(selectedWeek) === dateKey(weekDays(parseDate(visibleToday))[0]); }
function setDayOpen(date, open) {
  expandedDays.set(date, open);
  const section = daySections.get(date);
  const control = section.querySelector('.day-title');
  section.querySelector('.day-body').hidden = !open;
  control.querySelector('.chevron').textContent = open ? '⌃' : '⌄';
  control.setAttribute('aria-expanded', String(open));
  scheduleVisibility();
}
function renderWeek() {
  app.replaceChildren();
  dayLists.clear();
  daySections.clear();
  carryHost = null;
  const days = weekDays(selectedWeek);
  document.title = `${weekTitle(selectedWeek, parseDate(visibleToday))} · Haftalık görevler`;
  const identity = element('div', 'app-heading');
  const gear = button('settings-button', '⚙︎', 'Ayarlar');
  gear.setAttribute('aria-haspopup', 'dialog');
  gear.addEventListener('pointerdown', () => settings.preserveDraft());
  gear.addEventListener('click', () => settings.open(gear));
  identity.append(element('p', 'app-title', 'Haftalık Görevler'), gear);
  app.append(identity);
  header = element('header', 'page-header');
  const navigation = element('nav', 'week-nav');
  navigation.setAttribute('aria-label', 'Hafta seçimi');
  const previous = button('week-arrow previous-week', '←', 'Önceki hafta');
  const next = button('week-arrow next-week', '→', 'Sonraki hafta');
  previous.addEventListener('click', () => navigateWeek(-1));
  next.addEventListener('click', () => navigateWeek(1));
  const heading = element('h1', '', weekTitle(selectedWeek, parseDate(visibleToday)));
  navigation.append(previous, heading, next);
  const range = element('p', 'week-range', weekLabel(days));
  range.setAttribute('aria-live', 'polite');
  header.append(navigation, range);
  app.append(header);
  days.forEach(date => {
    const dayKey = dateKey(date);
    const today = dayKey === visibleToday;
    if (!expandedDays.has(dayKey)) expandedDays.set(dayKey, !currentWeek() || dayKey >= visibleToday);
    const open = expandedDays.get(dayKey);
    const section = element('section', `day${today ? ' today' : ''}`);
    section.id = `day-${dayKey}`;
    daySections.set(dayKey, section);
    const heading = element('h2');
    const toggle = button('day-title');
    toggle.append(element('span', 'day-label', fullDate(date)));
    if (today) {
      toggle.setAttribute('aria-current', 'date');
      toggle.append(element('span', 'today-label', 'Bugün'));
    }
    toggle.append(element('span', 'day-count', 'Görev yok'));
    toggle.setAttribute('aria-controls', `body-${dayKey}`);
    disclosure(toggle, open);
    toggle.addEventListener('click', () => {
      if (editor?.dayKey === dayKey && !editor.finish()) return;
      setDayOpen(dayKey, !expandedDays.get(dayKey));
    });
    heading.append(toggle);
    const body = element('div', 'day-body');
    body.id = `body-${dayKey}`;
    body.hidden = !open;
    body.append(listFor(date));
    if (today && currentWeek()) {
      carryHost = element('section', 'carryover');
      body.append(carryHost);
    }
    section.append(heading, body);
    app.append(section);
  });
  todayButton = button('today-button', 'Bugüne Dön');
  todayButton.hidden = true;
  todayButton.addEventListener('click', goToday);
  app.append(todayButton);
  refreshTasks();
  measureHeader();
}
function measureHeader() {
  document.documentElement.style.setProperty('--header-height', `${header.getBoundingClientRect().height}px`);
  scheduleVisibility();
}
function scheduleVisibility() {
  if (framePending) return;
  framePending = true;
  requestAnimationFrame(() => {
    framePending = false;
    const section = daySections.get(visibleToday);
    const rect = section?.getBoundingClientRect();
    const viewport = window.visualViewport;
    const top = Math.max(header.getBoundingClientRect().bottom, viewport?.offsetTop ?? 0);
    const bottom = viewport ? viewport.offsetTop + viewport.height : window.innerHeight;
    const visible = rect && rect.bottom > top + 1 && rect.top < bottom - 1;
    todayButton.hidden = Boolean(currentWeek() && visible && expandedDays.get(visibleToday));
  });
}
function scrollDay(date) {
  requestAnimationFrame(() => {
    measureHeader();
    daySections.get(date)?.scrollIntoView({ block: 'start', behavior: 'instant' });
    scheduleVisibility();
  });
}
function navigateWeek(offset) {
  if (editor && !editor.finish()) return;
  selectedWeek = shiftWeek(selectedWeek, offset);
  retainedCompleted.clear();
  completedOpen = false;
  renderWeek();
  if (currentWeek()) {
    setDayOpen(visibleToday, true);
    scrollDay(visibleToday);
  } else {
    window.scrollTo({ top: 0, behavior: 'instant' });
    scheduleVisibility();
  }
}
function goToday() {
  if (editor && !editor.finish()) return;
  if (!currentWeek()) {
    selectedWeek = weekDays(parseDate(visibleToday))[0];
    retainedCompleted.clear();
    completedOpen = false;
    renderWeek();
  }
  setDayOpen(visibleToday, true);
  scrollDay(visibleToday);
}
function handleLegacyLink() {
  if (!location.hash.startsWith('#gun/')) return false;
  const date = parseDate(location.hash.slice(5));
  if (editor && !editor.finish()) return true;
  history.replaceState(null, '', location.pathname + location.search);
  if (!date) return false;
  selectedWeek = weekDays(date)[0];
  expandedDays.set(dateKey(date), true);
  retainedCompleted.clear();
  completedOpen = false;
  renderWeek();
  scrollDay(dateKey(date));
  return true;
}
function refreshDate() {
  const nextToday = dateKey(new Date());
  if (nextToday === visibleToday || (editor && !editor.finish())) return;
  const followingCurrent = currentWeek();
  visibleToday = nextToday;
  retainedCompleted.clear();
  if (followingCurrent) selectedWeek = weekDays(parseDate(visibleToday))[0];
  // A calendar change must not reset manually opened/closed days or scroll.
  const y = window.scrollY;
  renderWeek();
  window.scrollTo({ top: y, behavior: 'instant' });
}
window.addEventListener('hashchange', handleLegacyLink);
window.addEventListener('popstate', handleLegacyLink);
window.addEventListener('scroll', scheduleVisibility, { passive: true });
window.addEventListener('resize', measureHeader);
window.visualViewport?.addEventListener('resize', scheduleVisibility);
window.visualViewport?.addEventListener('scroll', scheduleVisibility);
if ('ResizeObserver' in window) new ResizeObserver(measureHeader).observe(app);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshDate(); });
window.addEventListener('pageshow', refreshDate);
setInterval(refreshDate, 30_000);
settings = setupSettings({
  getTasks: () => readTasks(localStorage, key),
  commitTasks: next => {
    if (!persist(next)) return false;
    retainedCompleted.clear();
    refreshTasks();
    return true;
  },
  beforeOpen: () => { holdEditor = true; },
  afterClose: () => { holdEditor = false; },
  prepareUpdate: () => !editor || (!editor.input.composing && editor.finish())
});
if (!handleLegacyLink()) { renderWeek(); scrollDay(visibleToday); }
