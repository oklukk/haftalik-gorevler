import { icon } from './icons.js';
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
let taskDialog, menuOpener, menuScroll = 0, menuLocked = false;

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
  const arrow = element('span', 'chevron');
  arrow.append(icon(open ? 'chevron-up' : 'chevron-down', document));
  arrow.setAttribute('aria-hidden', 'true');
  control.append(arrow);
}
function taskRow(task, carry = false) {
  const item = element('li', 'task-row');
  const control = button('task', undefined, `${task.text} — ${task.completed ? 'Tamamlanmayı geri al' : 'Tamamla'}`);
  control.setAttribute('aria-pressed', String(task.completed));
  control.setAttribute('data-task-id', task.id);
  control.disabled = !canWrite;
  const mark = element('span', 'task-mark');
  mark.setAttribute('aria-hidden', 'true');
  mark.append(icon('circle', document), icon('check', document));
  const text = element('span', 'task-content');
  text.append(element('span', 'task-text', task.text));
  if (carry) {
    const date = parseDate(task.date);
    text.append(element('small', 'task-date', date ? `${shortDate(date)} ${date.getFullYear()}` : task.date));
  }
  control.append(mark, text);
  control.addEventListener('click', () => {
    if (!finishEditor()) return;
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
  const more = button('task-more', undefined, `${task.text} — Görev işlemleri`);
  more.disabled = !canWrite;
  more.setAttribute('aria-haspopup', 'dialog');
  more.append(icon('ellipsis', document));
  more.addEventListener('pointerdown', preserveTaskDraft);
  more.addEventListener('click', () => {
    if (!finishEditor()) return;
    openTaskMenu(task.id, more, carry);
  });
  item.append(control, more);
  return item;
}
function finishEditor() {
  if (!editor) return true;
  if (editor.input.composing) return false;
  const ok = editor.finish();
  if (!ok) editor.input.focus({ preventScroll: true });
  return ok;
}
function preserveTaskDraft() {
  holdEditor = true;
  setTimeout(() => { if (!taskDialog?.open && !settings?.isOpen()) holdEditor = false; }, 0);
}
function beginEdit(id, row, carry) {
  const task = tasks.find(value => value.id === id);
  if (!task) return;
  const form = element('form', 'task-edit');
  const input = element('input');
  input.type = 'text'; input.value = task.text;
  input.setAttribute('aria-label', 'Görev metni');
  input.setAttribute('enterkeyhint', 'done');
  const actions = element('div', 'edit-actions');
  const cancel = button('edit-cancel', 'İptal');
  const save = button('edit-save', 'Kaydet');
  const error = element('p', 'edit-error'); error.setAttribute('role', 'status');
  actions.append(cancel, save); form.append(input, actions, error);
  row.replaceChildren(form);
  const finish = (discard = false) => {
    if (!discard) {
      const text = input.value.trim();
      if (!text) { error.textContent = 'Görev metni boş olamaz.'; return false; }
      const current = tasks.find(value => value.id === id);
      if (!current) { error.textContent = 'Görev artık bulunamıyor. Taslağı kopyalayabilir veya iptal edebilirsiniz.'; return false; }
      if (!persist(tasks.map(value => value.id === id ? { ...value, text } : value))) {
        error.textContent = 'Kaydedilemedi. Taslağınız burada korunuyor.'; return false;
      }
    }
    editor = null; refreshTasks();
    const source = carry ? carryHost : dayLists.get(task.date);
    source?.querySelector(`[data-task-id="${CSS.escape(id)}"]`)?.focus({ preventScroll: true });
    return true;
  };
  editor = { input, finish, dayKey: task.date, taskId: id, kind: 'edit' };
  cancel.addEventListener('click', () => finish(true));
  save.addEventListener('click', () => finishEditor());
  form.addEventListener('submit', event => { event.preventDefault(); if (!event.isComposing) finishEditor(); });
  input.addEventListener('compositionstart', () => { input.composing = true; });
  input.addEventListener('compositionend', () => { input.composing = false; });
  input.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); finish(true); } });
  input.focus();
}
function releaseTaskMenu(restoreFocus = true) {
  if (!menuLocked) return;
  menuLocked = false;
  document.body.style.position = ''; document.body.style.top = ''; document.body.style.width = '';
  window.scrollTo({ top: menuScroll, behavior: 'instant' });
  holdEditor = false;
  if (restoreFocus) {
    if (menuOpener?.isConnected) menuOpener.focus({ preventScroll: true });
    else app.focus({ preventScroll: true });
  }
}
function closeTaskMenu(restoreFocus = true) {
  taskDialog.close(); releaseTaskMenu(restoreFocus);
}
function openTaskMenu(id, source, carry) {
  if (!taskDialog) {
    taskDialog = element('dialog', 'task-sheet');
    taskDialog.setAttribute('aria-labelledby', 'task-sheet-title');
    document.body.append(taskDialog);
    taskDialog.addEventListener('close', () => releaseTaskMenu());
    taskDialog.addEventListener('click', event => {
      if (event.target !== taskDialog) return;
      const rect = taskDialog.getBoundingClientRect();
      if (event.clientY < rect.top || event.clientY > rect.bottom || event.clientX < rect.left || event.clientX > rect.right) closeTaskMenu();
    });
  }
  const task = tasks.find(value => value.id === id);
  if (!task) return;
  menuOpener = source; menuScroll = window.scrollY; menuLocked = true; holdEditor = true;
  document.body.style.position = 'fixed'; document.body.style.top = `-${menuScroll}px`; document.body.style.width = '100%';
  function render(mode = 'menu') {
    taskDialog.replaceChildren();
    const title = element('h2', '', mode === 'delete' ? 'Görev silinsin mi?' : mode === 'date' ? 'Tarihini Değiştir' : 'Görev işlemleri');
    title.id = 'task-sheet-title';
    const close = button('task-sheet-close', undefined, 'Görev işlemlerini kapat');
    close.append(icon('x', document)); close.addEventListener('click', () => closeTaskMenu());
    const heading = element('div', 'sheet-heading'); heading.append(title, close);
    const description = element('p', 'selected-task', task.text);
    taskDialog.append(heading, description);
    const status = element('p', 'task-menu-status'); status.setAttribute('role', 'status');
    if (mode === 'menu') {
      for (const [name, label, cls, run] of [
        ['pencil', 'Görevi Düzenle', 'task-edit-action', () => {
          closeTaskMenu(false);
          // The opener may have been replaced when a prior draft was saved.
          const host = carry ? carryHost : dayLists.get(task.date);
          const control = host?.querySelector(`[data-task-id="${CSS.escape(id)}"]`);
          if (control) beginEdit(id, control.parentElement, carry);
        }],
        ['calendar', 'Tarihini Değiştir', 'task-date-action', () => render('date')],
        ['trash', 'Görevi Sil', 'task-delete-action', () => render('delete')]
      ]) {
        const action = button(`task-menu-action ${cls}`);
        action.append(icon(name, document), element('span', '', label));
        action.addEventListener('click', run); taskDialog.append(action);
      }
    } else if (mode === 'date') {
      const label = element('label', 'date-label', 'Yeni tarih'); label.htmlFor = 'task-new-date';
      const input = element('input', 'task-date-input'); input.type = 'date'; input.value = task.date; input.id = 'task-new-date';
      const apply = button('task-date-save', 'Kaydet');
      apply.addEventListener('click', () => {
        if (!parseDate(input.value)) { status.textContent = 'Geçerli bir takvim tarihi seçin.'; return; }
        if (!persist(tasks.map(value => value.id === id ? { ...value, date: input.value } : value))) { status.textContent = 'Kaydedilemedi. Görevin önceki tarihi korundu.'; return; }
        if (input.value >= visibleToday) retainedCompleted.delete(id);
        refreshTasks(); closeTaskMenu();
      });
      const cancel = button('task-date-cancel', 'İptal'); cancel.addEventListener('click', () => closeTaskMenu());
      const controls = element('div', 'dialog-actions'); controls.append(cancel, apply);
      taskDialog.append(label, input, controls);
    } else {
      taskDialog.append(element('p', 'delete-warning', 'Bu görev kalıcı olarak silinecek.'));
      const cancel = button('task-delete-cancel', 'Vazgeç'); cancel.addEventListener('click', () => closeTaskMenu());
      const remove = button('task-delete-confirm', 'Görevi Sil');
      remove.addEventListener('click', () => {
        if (!persist(tasks.filter(value => value.id !== id))) { status.textContent = 'Silinemedi. Görev kaydınız korundu.'; return; }
        retainedCompleted.delete(id); refreshTasks(); closeTaskMenu();
      });
      const controls = element('div', 'dialog-actions'); controls.append(cancel, remove); taskDialog.append(controls);
    }
    taskDialog.append(status);
    if (taskDialog.open) close.focus({ preventScroll: true });
  }
  render(); taskDialog.showModal();
}
function listFor(date) {
  const container = element('div');
  const list = element('ul', 'tasks');
  list.setAttribute('aria-label', `${fullDate(date)} görevleri`);
  const dayKey = dateKey(date);
  dayLists.set(dayKey, list);
  const add = element('button', 'add');
  add.append(icon('plus', document), element('span', '', 'Görev ekle'));
  add.type = 'button';
  add.disabled = !canWrite;
  add.setAttribute('aria-label', `${fullDate(date)} için görev ekle`);
  add.addEventListener('click', () => {
    // Keep focus synchronous with the touch gesture so iOS opens its keyboard.
    if (!finishEditor()) return;
    const form = element('form', 'editor');
    const mark = element('span', 'task-mark');
    mark.setAttribute('aria-hidden', 'true');
    mark.append(icon('circle', document));
    const input = element('input');
    input.type = 'text';
    input.placeholder = 'Yeni görev';
    input.setAttribute('aria-label', `${fullDate(date)} için yeni görev`);
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
    editor = { input, finish, dayKey, kind: 'add' };
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
  const toggle = button('carry-title');
  toggle.append(icon('history', document), element('span', '', `Devreden Görevler (${past.filter(task => !task.completed).length})`));
  toggle.setAttribute('aria-controls', 'carry-content');
  disclosure(toggle, carryOpen);
  toggle.addEventListener('click', () => {
    if (editor?.kind === 'edit' && !finishEditor()) return;
    carryOpen = !carryOpen;
    renderCarryover();
    carryHost.querySelector('.carry-title')?.focus({ preventScroll: true });
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
      if (editor?.kind === 'edit' && !finishEditor()) return;
      completedOpen = !completedOpen;
      renderCarryover();
      carryHost.querySelector('.completed-toggle')?.focus({ preventScroll: true });
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
    const progress = daySections.get(date).querySelector('.day-progress');
    if (progress) {
      const percent = daily.length ? daily.filter(task => task.completed).length / daily.length * 100 : 0;
      progress.hidden = !daily.length;
      progress.setAttribute('aria-valuenow', String(percent));
      progress.querySelector('.progress-fill').style.width = `${percent}%`;
    }
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
  control.querySelector('.chevron').replaceChildren(icon(open ? 'chevron-up' : 'chevron-down', document));
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
  const gear = button('settings-button', undefined, 'Ayarlar');
  gear.append(icon('settings', document));
  gear.setAttribute('aria-haspopup', 'dialog');
  gear.addEventListener('pointerdown', () => settings.preserveDraft());
  gear.addEventListener('click', () => settings.open(gear));
  const brand = element('div', 'app-brand');
  const badge = element('span', 'brand-icon'); badge.append(icon('list-checks', document));
  brand.append(badge, element('p', 'app-title', 'Haftalık Görevler'));
  identity.append(brand, gear);
  app.append(identity);
  header = element('header', 'page-header');
  const navigation = element('nav', 'week-nav');
  navigation.setAttribute('aria-label', 'Hafta seçimi');
  const previous = button('week-arrow previous-week', undefined, 'Önceki hafta');
  previous.append(icon('chevron-left', document));
  const next = button('week-arrow next-week', undefined, 'Sonraki hafta');
  next.append(icon('chevron-right', document));
  previous.addEventListener('click', () => navigateWeek(-1));
  next.addEventListener('click', () => navigateWeek(1));
  const heading = element('h1', '', weekTitle(selectedWeek, parseDate(visibleToday)));
  const summary = element('div', 'week-summary');
  const range = element('p', 'week-range', weekLabel(days));
  range.setAttribute('aria-live', 'polite');
  summary.append(heading, range);
  navigation.append(previous, summary, next);
  header.append(navigation);
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
    const dayText = element('span', 'day-heading-text');
    dayText.append(element('span', 'day-label', fullDate(date)));
    toggle.append(dayText);
    if (today) {
      toggle.setAttribute('aria-current', 'date');
      dayText.append(element('span', 'today-label', 'Bugün'));
    }
    toggle.append(element('span', 'day-count', 'Görev yok'));
    toggle.setAttribute('aria-controls', `body-${dayKey}`);
    disclosure(toggle, open);
    toggle.addEventListener('click', () => {
      if (editor?.dayKey === dayKey && !finishEditor()) return;
      setDayOpen(dayKey, !expandedDays.get(dayKey));
    });
    heading.append(toggle);
    const body = element('div', 'day-body');
    body.id = `body-${dayKey}`;
    body.hidden = !open;
    if (today) {
      const progress = element('div', 'day-progress');
      progress.setAttribute('role', 'progressbar');
      progress.setAttribute('aria-label', 'Bugünün görevleri');
      progress.setAttribute('aria-valuemin', '0'); progress.setAttribute('aria-valuemax', '100');
      progress.append(element('span', 'progress-fill'));
      body.append(progress);
    }
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
  if (!finishEditor()) return;
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
  if (!finishEditor()) return;
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
  if (!finishEditor()) return true;
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
  if (nextToday === visibleToday || !finishEditor()) return;
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
  prepareUpdate: finishEditor
});
if (!handleLegacyLink()) { renderWeek(); scrollDay(visibleToday); }
