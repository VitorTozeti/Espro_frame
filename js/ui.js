/* Helpers de interface: criação de elementos (sem innerHTML => sem XSS), ícones, sheet, toast. */
const $ = (s, r = document) => r.querySelector(s);

function h(tag, props, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'style') e.style.cssText = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(Infinity)) {
    if (c == null || c === false) continue;
    e.append(c.nodeType ? c : document.createTextNode(c));
  }
  return e;
}

const ICONS = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  kanban: 'M6 5v11M12 5v6M18 5v14',
  calendar: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
  book: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5v14zM6.5 17H20v4H6.5a2.5 2.5 0 0 1 0-4z',
  plus: 'M12 5v14M5 12h14',
  x: 'M18 6 6 18M6 6l12 12',
  left: 'm15 18-6-6 6-6',
  right: 'm9 18 6-6-6-6',
  arrow: 'M5 12h14m-6-6 6 6-6 6',
  up: 'm18 15-6-6-6 6',
  down: 'm6 9 6 6 6-6',
  print: 'M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z',
  grip: 'M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01',
  undo: 'M3 7v6h6M3 13a9 9 0 1 0 3-7',
  redo: 'M21 7v6h-6M21 13a9 9 0 1 1-3-7',
  ul: 'M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01',
  ol: 'M10 6h11M10 12h11M10 18h11M4 5l1-1v5M4 14h2l-2 3h2',
  alignL: 'M3 6h18M3 12h12M3 18h16',
  alignC: 'M3 6h18M7 12h10M5 18h14',
  alignR: 'M3 6h18M9 12h12M5 18h16',
  alignJ: 'M3 6h18M3 12h18M3 18h18',
  link: 'M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7',
  eraser: 'M20 20H9L4 15l9-9 7 7-5 5M13 6l7 7',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  type: 'M4 7V5h16v2M9 19h6M12 5v14',
  layers: 'm12 3 9 5-9 5-9-5 9-5zM3 13l9 5 9-5',
  copy: 'M8 8h12v12H8zM4 16V4h12',
  trash: 'M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6',
  sliders: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4',
  check: 'm5 12 5 5 9-10',
  zoomin: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-5-5M11 8v6M8 11h6',
  zoomout: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-5-5M8 11h6',
  fit: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  pencil: 'M4 20h4L19 9l-4-4L4 16v4zM13 7l4 4',
  move: 'M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3',
  multi: 'M4 4h10v10H4zM10 10h10v10H10z',
  grid: 'M3 3h18v18H3zM3 9h18M3 15h18M9 3v18M15 3v18',
  crop: 'M6 2v14a2 2 0 0 0 2 2h14M2 6h14a2 2 0 0 1 2 2v14',
  aL: 'M4 3v18M8 7h12M8 13h7',
  aC: 'M12 3v18M6 7h12M8 13h8',
  aR: 'M20 3v18M4 7h12M9 13h7',
  aT: 'M3 4h18M7 8v12M13 8v7',
  aM: 'M3 12h18M7 6v12M13 8v8',
  aB: 'M3 20h18M7 4v12M13 9v7',
  dH: 'M4 3v18M20 3v18M9 8h6v8H9z',
  dV: 'M3 4h18M3 20h18M8 9h8v6H8z',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-5-5',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  folder: 'M3 6h6l2 2h10v11H3z',
  pages: 'M7 3h10v14H7zM3 7v14h12',
  present: 'M3 4h18v12H3zM8 20h8M12 16v4',
  check2: 'M5 13l4 4L19 7',
  alert: 'M12 3 2 20h20zM12 10v4M12 17h.01',
  chat: 'M4 5h16v11H9l-5 4z',
  file: 'M6 3h9l4 4v14H6zM14 3v5h5',
  link2: 'M9 15l6-6M8 12l-2 2a3 3 0 0 0 4 4l2-2M16 12l2-2a3 3 0 0 0-4-4l-2 2',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2',
  image: 'M3 5h18v14H3zM3 16l5-5 4 4 3-3 6 6',
};
function icon(name, size = 22) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('width', size); s.setAttribute('height', size);
  s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor');
  s.setAttribute('stroke-width', '1.9'); s.setAttribute('stroke-linecap', 'round');
  s.setAttribute('stroke-linejoin', 'round'); s.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', ICONS[name]); s.append(p);
  return s;
}

/* Datas (sempre ISO local YYYY-MM-DD) */
const isoDate = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = () => isoDate(new Date());
const parseISO = s => new Date(s + 'T00:00');
const fmtShort = s => parseISO(s).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '');
const cap1 = s => s.charAt(0).toUpperCase() + s.slice(1);
const fmtLong = s => cap1(parseISO(s).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }));

/* Sheet (dialog): sobe de baixo no mobile, centralizado no desktop */
const sheetEl = () => $('#sheet');
function openSheet(title, body) {
  const d = sheetEl();
  d.replaceChildren(
    h('div', { class: 'grip' }),
    h('div', { class: 'sheet-head' }, h('h2', {}, title),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Fechar', onclick: closeSheet }, icon('x'))),
    h('div', { class: 'sheet-body' }, body));
  if (!d.open) d.showModal();
  d.scrollTop = 0;
}
function closeSheet() { const d = sheetEl(); if (d.open) d.close(); }
document.addEventListener('DOMContentLoaded', () => {
  sheetEl().addEventListener('click', e => { if (e.target === sheetEl()) closeSheet(); });
});

let toastTimer;
/* toast(msg) ou toast(msg, {label, fn}) — com ação (ex.: "Desfazer") fica mais tempo na tela */
function toast(msg, action) {
  const t = $('#toast');
  t.replaceChildren(...[msg, action && h('button', { class: 'toast-act', type: 'button', onclick: () => { t.classList.remove('show'); action.fn(); } }, action.label)].filter(Boolean));
  t.classList.toggle('has-act', !!action); t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), action ? 6000 : 2200);
}

/* Formulários */
const field = (label, control) => h('label', { class: 'field' }, h('span', {}, label), control);
const input = (name, val = '', extra = {}) => h('input', { class: 'input', name, value: val, autocomplete: 'off', ...extra });
const textarea = (name, val = '', rows = 3) => h('textarea', { class: 'input', name, rows }, val);
const selectEl = (name, opts, val) =>
  h('select', { class: 'input', name }, opts.map(([v, l]) => h('option', { value: v, selected: v === val }, l)));

/* Linha de ações. "Excluir" age na hora; quem chama mostra um toast com "Desfazer". */
function actionsRow(onDelete, saveLabel = 'Salvar') {
  return h('div', { class: 'actions' },
    onDelete && h('button', { type: 'button', class: 'btn danger', onclick: onDelete }, 'Excluir'),
    h('button', { type: 'submit', class: 'btn primary' }, saveLabel));
}

const corSetor = id => Store.get().setores.find(s => s.id === id)?.cor;
const nomeSetor = id => Store.get().setores.find(s => s.id === id)?.nome || 'Geral';

/* Redimensiona a imagem antes de guardar. Formatos com transparência viram WebP (não perdem o fundo). */
function resizeImage(file, max = 1600) {
  return new Promise((resolve, reject) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      const alpha = /png|gif|webp|svg/.test(file.type);
      resolve({ src: alpha ? c.toDataURL('image/webp', 0.9) : c.toDataURL('image/jpeg', 0.85), ar: img.width / img.height });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Imagem inválida')); };
    img.src = url;
  });
}
