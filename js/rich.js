/* Texto rico (editável como um Word) + imagens da página.
   O HTML do editor SEMPRE passa por sanitizeHTML() antes de ser salvo ou exibido (lista branca). */

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* ───────── Sanitizador (lista branca) ───────── */
const R_BLOCKS = new Set(['p', 'div', 'h2', 'h3', 'ul', 'ol', 'li', 'blockquote']);
const R_INLINES = new Set(['b', 'strong', 'i', 'em', 'u', 's', 'sub', 'sup', 'br', 'span', 'a']);
const R_DROP = new Set(['script', 'style', 'iframe', 'object', 'embed', 'noscript', 'template', 'svg', 'math', 'link', 'meta',
  'form', 'input', 'button', 'textarea', 'select', 'img', 'video', 'audio', 'canvas', 'head', 'title']);
const R_CLASSES = new Set(['fs-sm', 'fs-lg', 'fs-xl', 'ff-serif', 'ff-sans', 'ff-mono', 'st-lead', 'st-legenda', 'st-destaque']);
const R_COLOR = /^(#[0-9a-f]{3,8}|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*[\d.]+\s*)?\)|[a-z]{3,20})$/i;

function classeTamanho(px) { return px <= 12 ? 'fs-sm' : px >= 22 ? 'fs-xl' : px >= 17 ? 'fs-lg' : ''; }
function classeFonte(face) {
  const f = String(face).toLowerCase();
  if (/mono|courier|consolas/.test(f)) return 'ff-mono';
  if (/fraunces|serif(?!.*sans)|georgia|times|garamond|cambria/.test(f) && !/sans/.test(f)) return 'ff-serif';
  if (/inter|sans|arial|helvetica|calibri|segoe/.test(f)) return 'ff-sans';
  return '';
}

function sanitizeHTML(html) {
  const src = new DOMParser().parseFromString(String(html ?? ''), 'text/html').body;
  const dst = document.createElement('div');
  (function walk(from, to) {
    for (const n of from.childNodes) {
      if (n.nodeType === 3) { to.append(document.createTextNode(n.nodeValue)); continue; }
      if (n.nodeType !== 1) continue;
      let t = n.tagName.toLowerCase();
      if (R_DROP.has(t)) continue;
      if (t === 'strike' || t === 'del') t = 's';
      else if (t === 'h1') t = 'h2';
      else if (/^h[4-6]$/.test(t)) t = 'h3';
      else if (t === 'font') t = 'span';
      if (!R_BLOCKS.has(t) && !R_INLINES.has(t)) { walk(n, to); continue; }
      if (t === 'a' && !/^(https?:|mailto:)/i.test(n.getAttribute('href') || '')) { walk(n, to); continue; }

      const el = document.createElement(t), classes = new Set(), css = [], wrap = [];
      n.classList.forEach(c => { if (R_CLASSES.has(c)) classes.add(c); });
      if (n.tagName === 'FONT') {                       // saída do execCommand (foreColor/fontSize/fontName)
        const col = n.getAttribute('color'); if (col && R_COLOR.test(col)) css.push('color:' + col);
        const sz = Number(n.getAttribute('size')); if (sz) { const c = sz <= 2 ? 'fs-sm' : sz >= 6 ? 'fs-xl' : sz >= 4 ? 'fs-lg' : ''; if (c) classes.add(c); }
        const ff = classeFonte(n.getAttribute('face') || ''); if (ff) classes.add(ff);
      }
      const st = n.style;
      if (st) {
        if (st.color && R_COLOR.test(st.color)) css.push('color:' + st.color);
        if (R_BLOCKS.has(t) && ['left', 'center', 'right', 'justify'].includes(st.textAlign)) css.push('text-align:' + st.textAlign);
        if (st.fontSize) { const px = parseFloat(st.fontSize); const kw = { 'x-small': 'fs-sm', small: 'fs-sm', large: 'fs-lg', 'x-large': 'fs-xl', 'xx-large': 'fs-xl' }[st.fontSize];
          const c = kw ?? (st.fontSize.endsWith('pt') ? classeTamanho(px * 1.333) : st.fontSize.endsWith('px') ? classeTamanho(px) : ''); if (c) classes.add(c); }
        if (st.fontFamily) { const ff = classeFonte(st.fontFamily); if (ff) classes.add(ff); }
        if (t === 'span') {
          if (st.fontWeight === 'bold' || parseInt(st.fontWeight) >= 600) wrap.push('b');
          if (st.fontStyle === 'italic') wrap.push('i');
          if ((st.textDecorationLine || st.textDecoration || '').includes('underline')) wrap.push('u');
        }
      }
      if (t === 'a') { el.setAttribute('href', n.getAttribute('href')); el.setAttribute('target', '_blank'); el.setAttribute('rel', 'noopener noreferrer'); }
      if (classes.size) el.className = [...classes].join(' ');
      if (css.length) el.setAttribute('style', css.join(';'));
      to.append(el);
      let target = el;
      for (const w of wrap) { const x = document.createElement(w); target.append(x); target = x; }
      walk(n, target);
    }
  })(src, dst);
  // remove vazios deixados pelo execCommand (ex.: <p></p> ao redor de listas); <br> mantém linhas em branco
  dst.querySelectorAll('p,div,span,b,i,u,s').forEach(e => { if (!e.textContent.trim() && !e.querySelector('br,li')) e.remove(); });
  return dst.innerHTML;
}

/* Conteúdo da página: usa o HTML novo; páginas antigas (texto simples) são convertidas */
function conteudo(p) {
  if (typeof p.html === 'string') return p.html;
  const linhas = String(p.texto || '').split('\n').map(t => t.trim()).filter(Boolean).map(esc);
  return p.tpl === 'lista' ? '<ol>' + linhas.map(t => `<li>${t}</li>`).join('') + '</ol>' : linhas.map(t => `<p>${t}</p>`).join('');
}

/* Imagens: [{src,pos,tam,forma,legenda}]. Páginas antigas tinham só `img` (1 imagem de fundo/topo) */
function imagensDe(p) {
  if (Array.isArray(p.imgs)) return p.imgs;
  if (!p.img) return [];
  return [{ src: p.img, pos: ['materia', 'lista'].includes(p.tpl) ? 'topo' : 'fundo', tam: 'g', forma: 'ret', legenda: '' }];
}
/* Objetos da página: imagens {tipo:'img', pos, ...} e caixas de texto {tipo:'texto', html, x,y,w,h, rot, atras, fundo} */
function objetosDe(p) {
  if (Array.isArray(p.objs)) return p.objs;
  return imagensDe(p).map(i => ({ tipo: 'img', ...i }));
}
const IMG_POS = [['fundo', 'Fundo da página'], ['topo', 'Topo (largura total)'], ['acima', 'Acima do texto'],
  ['esquerda', 'À esquerda (texto contorna)'], ['direita', 'À direita (texto contorna)'], ['abaixo', 'Abaixo do texto']];
const IMG_TAM = [['p', 'Pequena'], ['m', 'Média'], ['g', 'Grande']];
const IMG_FORMA = [['ret', 'Retângulo'], ['arred', 'Arredondada'], ['circ', 'Círculo']];

const IMG_SET = { pos: new Set(['livre', ...IMG_POS.map(x => x[0])]), tam: new Set(['p', 'm', 'g']), forma: new Set(['ret', 'arred', 'circ']) };
const srcDe = o => (typeof o.src === 'string' && o.src.startsWith('img:') ? (Store.get().midia?.[o.src.slice(4)] || '') : o.src);
const cropStyle = o => (o.fx != null || o.cz ? `object-position:${Number(o.fx ?? 50) || 0}% ${Number(o.fy ?? 50) || 0}%;transform-origin:${Number(o.fx ?? 50) || 0}% ${Number(o.fy ?? 50) || 0}%;transform:scale(${Number(o.cz) || 1})` : null);
function figEl(im, i) {
  const pos = IMG_SET.pos.has(im.pos) ? im.pos : 'abaixo', tam = IMG_SET.tam.has(im.tam) ? im.tam : 'm', forma = IMG_SET.forma.has(im.forma) ? im.forma : 'ret';
  const n = v => Math.round((Number(v) || 0) * 100) / 100;
  const style = pos === 'livre' ? `left:${n(im.x)}%;top:${n(im.y)}%;width:${n(im.w)}%;height:${n(im.h)}%;transform:rotate(${n(im.rot)}deg);z-index:${im.atras ? 1 : 4}` : null;
  return h('figure', { class: `fig fig-${pos} t-${tam} f-${forma}`, 'data-i': i, style },
    h('img', { src: srcDe(im), alt: im.alt || im.legenda || '', style: cropStyle(im) }), im.legenda && h('figcaption', {}, im.legenda));
}

const FUNDOS = { branco: '#fffdf8', preto: '#1c1c1a', sec: 'var(--sec, #4D7C0F)', amarelo: '#fde68a' };
/* Caixa de texto livre (absoluta). Em modo edição o texto fica editável (o overlay do editor decide quando recebe toque). */
function textoEl(o, i, edit) {
  const n = v => Math.round((Number(v) || 0) * 100) / 100;
  const bg = FUNDOS[o.fundo];
  const style = `left:${n(o.x)}%;top:${n(o.y)}%;width:${n(o.w)}%;min-height:${n(o.h)}%;transform:rotate(${n(o.rot)}deg);z-index:${o.atras ? 1 : 4}` + (bg ? `;background:${bg}` : '');
  const rich = h('div', { class: 'rich', ...(edit ? { contenteditable: 'true', 'data-edit': 'caixa', 'data-ph': 'Digite aqui…', spellcheck: 'true', role: 'textbox', 'aria-multiline': 'true', 'aria-label': 'Caixa de texto' } : {}) });
  rich.innerHTML = sanitizeHTML(o.html || '');
  return h('div', { class: 'tbox' + (bg ? ' bg-' + o.fundo : ''), 'data-i': i, style }, rich);
}

/* ───────── Texto rico em qualquer área editável (corpo da página, caixas de texto) ───────── */
const Rte = { onSel: null };
function trackRte(area, onInput) {
  area._rte = true;
  area.addEventListener('focus', () => document.execCommand('defaultParagraphSeparator', false, 'p'));
  area.addEventListener('input', onInput);
  area.addEventListener('paste', e => {              // cola só HTML permitido (ou texto puro)
    e.preventDefault();
    const d = e.clipboardData, h5 = d.getData('text/html');
    document.execCommand('insertHTML', false, h5 ? sanitizeHTML(h5) : esc(d.getData('text/plain')).replace(/\n/g, '<br>'));
  });
  area.addEventListener('drop', e => e.preventDefault());
}
document.addEventListener('selectionchange', () => {
  const a = document.activeElement;
  if (a && a._rte) {
    const sel = getSelection();
    if (sel.rangeCount && a.contains(sel.anchorNode)) a._sel = sel.getRangeAt(0).cloneRange();
    Rte.onSel?.();
  }
});
function rteExec(area, cmd, val) {
  area.focus();
  if (area._sel) { const sel = getSelection(); sel.removeAllRanges(); sel.addRange(area._sel); }
  document.execCommand(cmd, false, val ?? null);
  const sel = getSelection();
  if (sel.rangeCount && area.contains(sel.anchorNode)) area._sel = sel.getRangeAt(0).cloneRange();
  Rte.onSel?.();
}
