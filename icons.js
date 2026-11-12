// Local, decorative SVGs. No external assets or user-provided markup.
const paths = {
  'list-checks': ['m3 6 2 2 4-4', 'M12 6h9', 'm3 13 2 2 4-4', 'M12 13h9', 'M12 20h9'],
  settings: ['M4 6h16', 'M4 18h16', 'M8 3v6', 'M16 15v6', 'M4 12h16', 'M14 9v6'],
  'chevron-left': ['m14 6-6 6 6 6'], 'chevron-right': ['m10 6 6 6-6 6'],
  'chevron-down': ['m6 9 6 6 6-6'], 'chevron-up': ['m6 15 6-6 6 6'],
  check: ['m6 12 4 4 8-8'], circle: ['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20'],
  ellipsis: ['M5 12h.01', 'M12 12h.01', 'M19 12h.01'],
  pencil: ['m16 3 5 5-12 12-6 1 1-6Z', 'm14 5 5 5'],
  calendar: ['M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2Z', 'M7 2v4', 'M17 2v4', 'M3 9h18', 'M7 13h2', 'M13 13h2', 'M7 17h2'],
  trash: ['M3 6h18', 'm5 6 1 15h12l1-15', 'M9 6V3h6v3', 'M10 10v7', 'M14 10v7'],
  plus: ['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20', 'M8 12h8', 'M12 8v8'],
  history: ['M3 11a9 9 0 1 1 2 7', 'M3 4v7h7', 'M12 7v5l3 2'],
  database: ['M3 5c0-4 18-4 18 0s-18 4-18 0Z', 'M3 5v14c0 4 18 4 18 0V5', 'M3 12c0 4 18 4 18 0'],
  download: ['M12 3v12', 'm7 10 5 5 5-5', 'M4 16v5h16v-5'],
  upload: ['M12 16V4', 'm7 9 5-5 5 5', 'M4 16v5h16v-5'],
  refresh: ['M20 7a9 9 0 0 0-15-2L3 8', 'M3 3v5h5', 'M4 17a9 9 0 0 0 15 2l2-3', 'M21 21v-5h-5'],
  info: ['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20', 'M12 11v6', 'M12 7h.01'],
  x: ['m6 6 12 12', 'M6 18 18 6']
};
export function icon(name, doc = document) {
  const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', name === 'ellipsis' ? '3' : '1.7');
  svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', `icon icon-${name}`);
  for (const d of paths[name] ?? []) {
    const path = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d); svg.append(path);
  }
  return svg;
}
