// Bullets are plain text. This state belongs only to the open editing session.
export function setupBulletList(input, button, changed) {
  // Existing bullets follow the caret until the user explicitly ends the list.
  // Once off, moving to an older bullet must not switch the mode back on.
  let mode = 'auto';
  let composing = false;
  let pointerSelection = null;
  let before = null;
  let previousValue = input.value;
  let compositionValue = input.value;
  const prefix = text => text.startsWith('• ') ? 2 : text.startsWith('•') ? 1 : 0;
  const line = () => {
    const caret = input.selectionStart;
    const start = caret ? input.value.lastIndexOf('\n', caret - 1) + 1 : 0;
    const next = input.value.indexOf('\n', caret);
    const end = next < 0 ? input.value.length : next;
    return { start, end, text: input.value.slice(start, end) };
  };
  const active = () => mode === 'on' || (mode === 'auto' && !!prefix(line().text));
  const reflect = () => button.setAttribute('aria-pressed', String(active()));
  const replace = (start, end, text, from = start + text.length, to = from) => {
    const scroll = input.scrollTop, height = input.scrollHeight;
    input.setRangeText(text, start, end, 'preserve');
    input.setSelectionRange(from, to);
    previousValue = input.value;
    changed();
    // A cancelled native Return will not reveal its caret for us. Keep the
    // new item visible inside the capped textarea without scrolling the page.
    input.scrollTop = to === input.value.length ? input.scrollHeight : scroll + (text.includes('\n') ? input.scrollHeight - height : 0);
    reflect();
  };
  const removedMarker = (old, next) => {
    // Detect a real deletion/replacement, not a caret move or a multiline paste.
    let start = 0, end = old.length, tail = next.length;
    while (start < end && start < tail && old[start] === next[start]) start++;
    while (end > start && tail > start && old[end - 1] === next[tail - 1]) { end--; tail--; }
    for (let pos = old.indexOf('•', start); pos >= 0 && pos < end; pos = old.indexOf('•', pos + 1)) {
      if (!pos || old[pos - 1] === '\n') return true;
    }
    return false;
  };
  const removeEmpty = current => {
    // Remove the empty item itself, leaving adjacent non-empty lines separate.
    const start = current.start ? current.start - 1 : 0;
    const end = !current.start && current.end < input.value.length ? current.end + 1 : current.end;
    replace(start, end, '');
  };
  const edit = type => {
    if (!active() || composing || input.composing) return false;
    const current = line();
    const count = prefix(current.text);
    const from = input.selectionStart, to = input.selectionEnd;
    const empty = count && !current.text.slice(count).trim();
    if (type === 'insertLineBreak' || type === 'insertParagraph') {
      if (empty && from === to) { mode = 'off'; removeEmpty(current); }
      else if (count && from === to && from < current.start + count) replace(current.start + count, current.start + count, '\n• ');
      else replace(from, to, '\n• ');
      return true;
    }
    if (count && from === to && (
      (type === 'deleteContentBackward' && from > current.start && (empty || from <= current.start + count)) ||
      (type === 'deleteContentForward' && from === current.start)
    )) {
      mode = 'off';
      if (empty) removeEmpty(current);
      else replace(current.start, current.start + count, '', from - Math.min(count, from - current.start));
      return true;
    }
    return false;
  };

  button.setAttribute('aria-pressed', 'false');
  button.addEventListener('pointerdown', event => {
    if (event.button !== 0 || event.isPrimary === false) return;
    pointerSelection = [input.selectionStart, input.selectionEnd];
    // Keep the textarea focused (and the mobile keyboard open) on a pointer tap.
    event.preventDefault();
  });
  button.addEventListener('pointercancel', () => { pointerSelection = null; });
  button.addEventListener('keydown', () => { pointerSelection = null; });
  button.addEventListener('click', () => {
    const selection = pointerSelection;
    pointerSelection = null;
    input.focus({ preventScroll: true });
    if (selection) input.setSelectionRange(...selection);
    if (composing || input.composing) return;
    const current = line();
    const count = prefix(current.text);
    const from = input.selectionStart, to = input.selectionEnd;
    if (active()) {
      mode = 'off';
      if (count && !current.text.slice(count).trim()) removeEmpty(current);
      else if (count) replace(current.start, current.start + count, '', Math.max(current.start, from - count), Math.max(current.start, to - count));
    } else {
      mode = 'on';
      if (!count) replace(current.start, current.start, '• ', from + 2, to + 2);
      else if (count === 1) replace(current.start + 1, current.start + 1, ' ', Math.max(current.start + 2, from + 1), Math.max(current.start + 2, to + 1));
    }
    reflect();
  });
  // beforeinput covers physical keyboards and soft keyboards that emit no
  // useful keydown. Use just one Enter path, so one Return cannot add two items.
  input.addEventListener('beforeinput', event => {
    before = { text: line().text, value: input.value };
    if (!event.isComposing && event.cancelable && edit(event.inputType)) {
      event.preventDefault();
      before = null;
    }
  });
  if (!('onbeforeinput' in input)) input.addEventListener('keydown', event => {
    if (!event.isComposing && event.keyCode !== 229 && edit({ Enter: 'insertLineBreak', Backspace: 'deleteContentBackward', Delete: 'deleteContentForward' }[event.key])) event.preventDefault();
  });
  input.addEventListener('input', event => {
    if (!composing && !event.isComposing && mode !== 'off' && removedMarker(before?.value ?? previousValue, input.value)) {
      mode = 'off';
      if (before && /^•\s*$/.test(before.text) && !line().text.trim()) removeEmpty(line());
    }
    previousValue = input.value;
    before = null;
    reflect();
  });
  input.addEventListener('compositionstart', () => { composing = true; compositionValue = input.value; });
  input.addEventListener('compositionend', () => {
    composing = false;
    if (mode !== 'off' && removedMarker(compositionValue, input.value)) mode = 'off';
    previousValue = input.value; before = null; reflect();
  });
  for (const event of ['select', 'keyup', 'click']) input.addEventListener(event, reflect);
  reflect();
}
