// Pointer Events handle selection/capture; a non-passive touchmove prevents native
// panning only AFTER the hold activates (including iOS's touch scrolling path).
export function setupTaskDrag({ root, getTasks, canStart, drop }) {
  let gesture = null, blockedClick = null, frame = 0;
  const live = document.createElement('p');
  live.className = 'sr-only'; live.setAttribute('role', 'status');
  document.body.append(live);
  const announce = text => { live.textContent = text; };
  const controlAt = target => target instanceof Element ? target.closest('.daily-tasks .task') : null;
  function clearMarker(state) {
    state.targetRow?.classList.remove('drop-before', 'drop-after');
    state.targetRow = null; state.target = null;
  }
  function finish(commit = false) {
    const state = gesture;
    if (!state) return;
    gesture = null;
    clearTimeout(state.timer); cancelAnimationFrame(frame); frame = 0;
    state.row.classList.remove('is-dragging');
    document.documentElement.classList.remove('task-drag-active');
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', cancel);
    state.control.removeEventListener('lostpointercapture', cancel);
    if (state.control.hasPointerCapture?.(state.pointerId)) state.control.releasePointerCapture(state.pointerId);
    if (state.active || state.held) blockedClick = { pointerId: state.pointerId };
    const target = state.target;
    clearMarker(state);
    if (!state.active) return;
    if (commit && target && state.snapshot === getTasks()) {
      const result = drop(state.id, target.id, target.after);
      announce(result === false ? 'Sıralama kaydedilemedi. Önceki sıra korundu.' : 'Görev sırası korundu veya güncellendi.');
    } else announce('Sıralama iptal edildi. Önceki sıra korundu.');
  }
  function cancel() { finish(false); }
  function locate(state) {
    clearMarker(state);
    const hit = document.elementFromPoint(state.x, state.y);
    const row = hit?.closest('.task-row');
    if (!row || row.parentElement !== state.list) return;
    const control = row.querySelector('.task');
    const id = control?.getAttribute('data-task-id');
    const task = getTasks().find(value => value.id === id);
    if (!task || task.date !== state.date || task.completed !== state.completed) return;
    const rect = row.getBoundingClientRect();
    state.target = { id, after: state.y > rect.top + rect.height / 2 };
    state.targetRow = row;
    if (id !== state.id) row.classList.add(state.target.after ? 'drop-after' : 'drop-before');
  }
  function scroll() {
    const state = gesture;
    if (!state?.active) return;
    const viewport = window.visualViewport;
    const top = Math.max(root.querySelector('.page-header').getBoundingClientRect().bottom, viewport?.offsetTop ?? 0) + 24;
    const bottom = (viewport ? viewport.offsetTop + viewport.height : window.innerHeight) - 48;
    const speed = state.y < top ? -Math.min(8, (top - state.y) / 5) : state.y > bottom ? Math.min(8, (state.y - bottom) / 5) : 0;
    if (speed) { window.scrollBy(0, speed); locate(state); }
    frame = requestAnimationFrame(scroll);
  }
  function move(event) {
    const state = gesture;
    if (!state || event.pointerId !== state.pointerId) return;
    state.x = event.clientX; state.y = event.clientY;
    if (!state.active) {
      if (Math.hypot(state.x - state.startX, state.y - state.startY) > 9) {
        blockedClick = { pointerId: state.pointerId }; cancel();
      }
      return;
    }
    if (event.cancelable) event.preventDefault();
    locate(state);
  }
  function up(event) {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    if (gesture.active) {
      gesture.x = event.clientX; gesture.y = event.clientY; locate(gesture);
      if (event.cancelable) event.preventDefault();
    }
    finish(true);
  }
  root.addEventListener('pointerdown', event => {
    blockedClick = null;
    if (gesture) { cancel(); return; } // A second finger cancels the first gesture.
    const control = controlAt(event.target);
    if (!control || event.button !== 0 || event.isPrimary === false) return;
    const task = getTasks().find(value => value.id === control.getAttribute('data-task-id'));
    if (!task) return;
    const state = {
      id: task.id, date: task.date, completed: task.completed, pointerId: event.pointerId,
      row: control.closest('.task-row'), list: control.closest('.daily-tasks'), control,
      snapshot: getTasks(), startX: event.clientX, startY: event.clientY,
      x: event.clientX, y: event.clientY, active: false, eligible: canStart()
    };
    gesture = state;
    state.timer = setTimeout(() => {
      if (!state.eligible && gesture === state) { state.held = true; return; }
      if (gesture !== state || !canStart() || state.snapshot !== getTasks() || !control.isConnected) { cancel(); return; }
      state.active = true;
      state.control.focus({ preventScroll: true });
      state.row.classList.add('is-dragging');
      document.documentElement.classList.add('task-drag-active');
      try { control.setPointerCapture(event.pointerId); } catch { cancel(); return; }
      locate(state); announce('Sürükleme başladı. Aynı grubun içinde taşıyın; iptal için Escape.');
      frame = requestAnimationFrame(scroll);
    }, 400);
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up, { passive: false });
    window.addEventListener('pointercancel', cancel);
    control.addEventListener('lostpointercapture', cancel);
  });
  root.addEventListener('click', event => {
    if (blockedClick && event.detail !== 0 && (event.pointerId === undefined || event.pointerId === blockedClick.pointerId)) {
      event.preventDefault(); event.stopImmediatePropagation(); blockedClick = null;
    }
  }, true);
  root.addEventListener('touchmove', event => {
    if (gesture?.active && event.cancelable) event.preventDefault();
  }, { passive: false });
  root.addEventListener('contextmenu', event => { if (controlAt(event.target)) event.preventDefault(); });
  root.addEventListener('keydown', event => {
    if (event.key === 'Escape' && gesture) { event.preventDefault(); cancel(); return; }
    const control = controlAt(event.target);
    if (!control || !event.altKey || !['ArrowUp', 'ArrowDown'].includes(event.key) || !canStart()) return;
    event.preventDefault(); cancel();
    const tasks = getTasks(), source = tasks.find(task => task.id === control.getAttribute('data-task-id'));
    if (!source) return;
    const group = tasks.filter(task => task.date === source.date && task.completed === source.completed);
    const target = group[group.findIndex(task => task.id === source.id) + (event.key === 'ArrowUp' ? -1 : 1)];
    if (target) announce(drop(source.id, target.id, event.key === 'ArrowDown') === false ? 'Sıralama kaydedilemedi.' : 'Görev sırası güncellendi.');
  });
  window.addEventListener('blur', cancel);
  window.addEventListener('scroll', () => { if (gesture && !gesture.active) cancel(); }, { passive: true });
  document.addEventListener('visibilitychange', () => { if (document.hidden) cancel(); });
  return { cancel };
}
