// Pointer capture drives the gesture. Native touch scrolling is blocked only
// after the 400 ms hold; all preview transforms are temporary, never stored.
export function setupTaskDrag({ root, getTasks, canStart, drop }) {
  let gesture = null, consumed = null, keyboardClick = null, frame = 0;
  const live = document.createElement('p');
  live.className = 'sr-only'; live.setAttribute('role', 'status');
  document.body.append(live);
  const announce = text => { live.textContent = text; };
  const buttonAt = target => target instanceof Element ? target.closest('button') : null;
  const controlAt = target => target instanceof Element ? target.closest('.daily-tasks .task') : null;
  function consume(state) {
    // Compatibility clicks can have no pointerId, a different pointerId, or
    // detail === 0. A fresh physical press or explicit keyboard activation,
    // rather than these unreliable click fields, establishes the next intent.
    consumed = { until: performance.now() + 1400 };
    keyboardClick = null;
    state.held = true;
  }
  function finish(commit = false) {
    const state = gesture;
    if (!state) return;
    gesture = null;
    clearTimeout(state.timer); cancelAnimationFrame(frame); frame = 0;
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', cancel);
    state.control.removeEventListener('lostpointercapture', cancel);
    if (state.control.hasPointerCapture?.(state.pointerId)) state.control.releasePointerCapture(state.pointerId);
    if (state.held) consume(state);
    document.documentElement.classList.remove('task-drag-active');
    for (const entry of state.rows ?? []) {
      entry.row.classList.remove('is-dragging', 'drag-peer');
      entry.row.style.transform = entry.transform;
      entry.row.style.backgroundColor = entry.background;
    }
    if (!state.active) return;
    if (commit && state.target && state.snapshot === getTasks()) {
      const result = drop(state.id, state.target.id, state.target.after);
      announce(result === false ? 'Sıralama kaydedilemedi. Önceki sıra korundu.' : 'Görev sırası korundu veya güncellendi.');
    } else announce('Sıralama iptal edildi. Önceki sıra korundu.');
  }
  function cancel() { if (gesture) consume(gesture); finish(false); }
  function preview(state) {
    const y = state.y + window.scrollY;
    const top = state.y + window.scrollY - state.grabY;
    state.row.style.transform = `translate3d(0, ${top - state.source.top}px, 0) scale(1.006)`;
    const headerBottom = root.querySelector('.page-header').getBoundingClientRect().bottom;
    const valid = state.x >= state.left && state.x <= state.right && state.y >= headerBottom &&
      y >= state.rows[0].top && y <= state.rows.at(-1).top + state.rows.at(-1).height;
    state.target = null;
    const others = state.rows.filter(entry => entry !== state.source);
    const destination = valid ? others.filter(entry => top + state.source.height / 2 > entry.top + entry.height / 2).length : state.index;
    const sequence = [...others]; sequence.splice(destination, 0, state.source);
    let cursor = state.rows[0].top;
    for (const entry of sequence) {
      if (entry !== state.source) entry.row.style.transform = `translate3d(0, ${cursor - entry.top}px, 0)`;
      cursor += entry.height;
    }
    if (valid) {
      state.target = destination === state.index || !others.length ? { id: state.id, after: false } :
        destination < others.length ? { id: others[destination].id, after: false } : { id: others.at(-1).id, after: true };
    }
    state.dirty = false;
  }
  function paint() {
    const state = gesture;
    if (!state?.active) return;
    const viewport = window.visualViewport;
    const top = Math.max(root.querySelector('.page-header').getBoundingClientRect().bottom, viewport?.offsetTop ?? 0) + 24;
    const bottom = (viewport ? viewport.offsetTop + viewport.height : window.innerHeight) - 48;
    const speed = state.y < top ? -Math.min(8, (top - state.y) / 5) : state.y > bottom ? Math.min(8, (state.y - bottom) / 5) : 0;
    if (speed) { window.scrollBy(0, speed); state.dirty = true; }
    if (state.dirty) preview(state);
    frame = requestAnimationFrame(paint);
  }
  function move(event) {
    const state = gesture;
    if (!state || event.pointerId !== state.pointerId) return;
    state.x = event.clientX; state.y = event.clientY;
    if (!state.active) {
      if (Math.hypot(state.x - state.startX, state.y - state.startY) > 9) { consume(state); cancel(); }
      return;
    }
    if (event.cancelable) event.preventDefault();
    state.dirty = true;
  }
  function up(event) {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    // Timer tasks can be delayed behind input events on a busy main thread.
    if (!gesture.held && Math.max(performance.now() - gesture.startedAt, event.timeStamp - gesture.downStamp) >= 400) consume(gesture);
    if (gesture.active) {
      gesture.x = event.clientX; gesture.y = event.clientY; preview(gesture);
      if (event.cancelable) event.preventDefault();
    }
    finish(true);
  }
  // Capture at document level so an unrelated next press also clears a consumed
  // gesture; synthetic mouse/click events alone do not establish a new press.
  document.addEventListener('pointerdown', () => { consumed = null; keyboardClick = null; }, true);
  root.addEventListener('pointerdown', event => {
    if (gesture) { consume(gesture); cancel(); return; }
    const control = controlAt(event.target);
    if (!control || event.button !== 0 || event.isPrimary === false) return;
    const task = getTasks().find(value => value.id === control.getAttribute('data-task-id'));
    if (!task) return;
    const state = {
      id: task.id, date: task.date, completed: task.completed, pointerId: event.pointerId,
      row: control.closest('.task-row'), list: control.closest('.daily-tasks'), control,
      snapshot: getTasks(), startedAt: performance.now(), downStamp: event.timeStamp, startX: event.clientX, startY: event.clientY,
      x: event.clientX, y: event.clientY, active: false, eligible: canStart()
    };
    gesture = state;
    state.timer = setTimeout(() => {
      if (gesture !== state) return;
      consume(state); // The threshold itself consumes the tap, even with no move.
      if (!state.eligible) return;
      if (!canStart() || state.snapshot !== getTasks() || !control.isConnected) { cancel(); return; }
      state.active = true;
      state.rows = [...state.list.children].flatMap(row => {
        const item = row.querySelector('.task');
        if (!item || item.getAttribute('aria-pressed') !== String(task.completed)) return [];
        const rect = row.getBoundingClientRect();
        return [{ row, id: item.getAttribute('data-task-id'), top: rect.top + window.scrollY, height: rect.height,
          transform: row.style.transform, background: row.style.backgroundColor }];
      });
      state.source = state.rows.find(entry => entry.id === state.id);
      state.index = state.rows.indexOf(state.source);
      const rect = state.row.getBoundingClientRect();
      state.grabY = state.startY - rect.top; state.left = rect.left; state.right = rect.right;
      let surface = state.row;
      while (surface && ['transparent', 'rgba(0, 0, 0, 0)'].includes(getComputedStyle(surface).backgroundColor)) surface = surface.parentElement;
      const background = surface ? getComputedStyle(surface).backgroundColor : '';
      try { control.setPointerCapture(event.pointerId); } catch { cancel(); return; }
      control.focus({ preventScroll: true });
      for (const entry of state.rows) entry.row.classList.add(entry === state.source ? 'is-dragging' : 'drag-peer');
      state.row.style.backgroundColor = background;
      document.documentElement.classList.add('task-drag-active');
      preview(state); announce('Sürükleme başladı. Aynı grubun içinde taşıyın; iptal için Escape.');
      frame = requestAnimationFrame(paint);
    }, 400);
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up, { passive: false });
    window.addEventListener('pointercancel', cancel);
    control.addEventListener('lostpointercapture', cancel);
  });
  root.addEventListener('click', event => {
    if (gesture && !gesture.held && performance.now() - gesture.startedAt >= 400) consume(gesture);
    const keyboard = keyboardClick && keyboardClick.button === buttonAt(event.target) && performance.now() < keyboardClick.until;
    keyboardClick = null;
    if (!keyboard && (gesture?.held || (consumed && performance.now() < consumed.until))) {
      event.preventDefault(); event.stopImmediatePropagation();
    }
  }, true);
  root.addEventListener('touchmove', event => { if (gesture?.active && event.cancelable) event.preventDefault(); }, { passive: false });
  root.addEventListener('contextmenu', event => { if (controlAt(event.target)) event.preventDefault(); });
  root.addEventListener('keydown', event => {
    if (['Enter', ' '].includes(event.key) && !gesture) keyboardClick = { button: buttonAt(event.target), until: performance.now() + 1400 };
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
