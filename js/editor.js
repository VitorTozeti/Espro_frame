/* Editor de páginas em tela cheia.
   • edição DIRETA na página (título, texto corrido e caixas de texto são editáveis ali mesmo)
   • objetos livres (imagens e caixas de texto): mover, redimensionar, girar, camadas, recorte
   • precisão: zoom por pinça, guias + encaixe, margens/grade, seleção múltipla, alinhar/distribuir, campos numéricos
   • salvamento automático, desfazer/refazer
   Posições livres ficam em % da folha (x, y, w, h) + rot (graus) + atras (atrás do texto).
   Índices de objeto: 0..n = d.objs[i]; -2 = quadro do texto corrido (d.quadro); -1 = nada. */

const PAGE_AR = 148 / 210;                       // largura / altura da folha A5
const MARGEM = 6;                                // margem de segurança (% da folha)
const SNAP_PX = 7;                               // distância (px) para "grudar" nas guias
const IMG_POS_ALL = [['livre', 'Livre (arrastar e redimensionar)'], ...IMG_POS];
const FUNDO_OPTS = [['', 'Sem fundo'], ['branco', 'Papel'], ['sec', 'Cor da seção'], ['preto', 'Preto'], ['amarelo', 'Destaque']];
const HANDLES = { nw: [-1, -1], n: [0, -1], ne: [1, -1], e: [1, 0], se: [1, 1], s: [0, 1], sw: [-1, 1], w: [-1, 0] };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const clone = o => JSON.parse(JSON.stringify(o));
const r2 = v => Math.round(v * 100) / 100;

/* Página nova/aberta pela lista */
function abrirPagina(p) { location.hash = '#/editor/' + p.id; }
function novaPagina(defaults = {}) {
  const p = { id: Store.uid(), tpl: 'materia', titulo: '', html: '', objs: [], colunas: 1, secao: '', status: 'rascunho', novo: true, ...defaults };
  Store.upsert('paginas', p, { silent: true });
  abrirPagina(p);
}

const Editor = (() => {
  let ed = null;                                 // estado do editor aberto

  const normalize = p => {
    const d = clone(p);
    d.objs = clone(objetosDe(p)).map(o => ({ tipo: 'img', ...o }));
    d.html = conteudo(p);
    d.colunas = Number(d.colunas) || 1; d.status ||= 'rascunho'; d.secao ||= '';
    delete d.imgs; delete d.img;
    return d;
  };
  const secOf = d => (FIXAS.includes(d.tpl) ? null : secoes().find(s => s.id === d.secao) || null);
  const objAt = i => (i === -2 ? ed.d.quadro : ed.d.objs[i]);
  const isTexto = i => i === -2 || ed.d.objs[i]?.tipo === 'texto';       // se comporta como caixa (altura mínima, redimensiona livre)

  /* ───────────────── dados ↔ DOM, salvar, histórico ───────────────── */
  function syncFromDom() {
    if (!ed?.page) return;
    const t = ed.page.querySelector('[data-edit=titulo]');
    if (t) ed.d.titulo = t.textContent.replace(/\s+/g, ' ').trim();
    const b = ed.page.querySelector('[data-edit=corpo]');
    if (b) { ed.d.html = sanitizeHTML(b.innerHTML); ed.d.texto = b.innerText.trim(); }
    ed.page.querySelectorAll('.tbox').forEach(bx => {
      const o = ed.d.objs[Number(bx.dataset.i)];
      if (o && o.tipo === 'texto') o.html = sanitizeHTML(bx.querySelector('.rich').innerHTML);
    });
  }
  const setStatus = (s, t) => { ed.status.dataset.s = s; ed.status.textContent = t; };
  function saveNow() {
    clearTimeout(ed.tSave);
    syncFromDom();
    const id = ed.id;
    Store.upsert('paginas', clone(ed.d), { silent: true }).then(ok => { if (ed && ed.id === id) setStatus(ok ? 'ok' : 'err', ok ? 'Salvo' : 'Não salvou'); });
  }
  function scheduleSave() { setStatus('pend', 'Salvando…'); clearTimeout(ed.tSave); ed.tSave = setTimeout(saveNow, 450); }
  function hCommit(sync = true) {
    if (sync) syncFromDom();
    const j = JSON.stringify(ed.d);
    if (j === ed.hist[ed.hi]) return;
    ed.hist.splice(ed.hi + 1); ed.hist.push(j);
    if (ed.hist.length > 120) ed.hist.shift();
    ed.hi = ed.hist.length - 1;
    updateUndo();
  }
  function typed() { clearTimeout(ed.tHist); ed.tHist = setTimeout(() => { hCommit(); check(); }, 700); scheduleSave(); }
  const commitLive = () => { hCommit(); scheduleSave(); };                 // mudança já refletida no DOM
  function apply(fn) {                                                     // mudança estrutural: refaz a página
    syncFromDom(); fn(); hCommit(false); scheduleSave(); buildPage();
  }
  function updateUndo() { ed.undoBtn.disabled = ed.hi <= 0; ed.redoBtn.disabled = ed.hi >= ed.hist.length - 1; }
  function undo() { clearTimeout(ed.tHist); hCommit(); if (ed.hi > 0) { ed.hi--; restore(); } }
  function redo() { clearTimeout(ed.tHist); if (ed.hi < ed.hist.length - 1) { ed.hi++; restore(); } }
  function resetSel() { ed.sel = -1; ed.multi = new Set(); ed.editBox = -1; ed.rte = null; ed.panel = false; ed.crop = false; }
  function restore() { ed.d = JSON.parse(ed.hist[ed.hi]); resetSel(); buildPage(); updateUndo(); scheduleSave(); }

  /* ───────────────── texto que não cabe na folha ───────────────── */
  const check = () => marcarExcesso(ed.holder, () => { if (ed) ed.warn.hidden = !ed.page.classList.contains('overflow'); });
  function encaixar() {                                           // reduz a fonte do texto corrido até caber
    syncFromDom();
    const wrap = ed.page.querySelector('.rich-wrap'); if (!wrap) return;
    const antes = ed.d.fonte || 1; let melhor = null;
    for (let f = 1; f >= 0.6; f = Math.round((f - 0.05) * 100) / 100) {
      wrap.style.setProperty('--fs', f);
      if (!excedePagina(ed.page)) { melhor = f; break; }
    }
    if (melhor === null) { wrap.style.setProperty('--fs', antes); return toast('Não coube nem com a fonte menor — use "Dividir"'); }
    apply(() => { ed.d.fonte = melhor; });
    toast(melhor < 1 ? `Texto reduzido para ${Math.round(melhor * 100)}%` : 'O texto já cabe');
  }
  function dividir() {                                            // move o que estoura para uma nova página (logo depois)
    syncFromDom();
    const corpo = ed.page.querySelector('[data-edit=corpo]'); if (!corpo) return toast('Esta página não tem texto corrido');
    const pr = ed.page.getBoundingClientRect(), limite = pr.bottom - pr.width * 0.095;                  // 9cqw de respiro (padding do quadro) + folga
    const blocos = [...corpo.children], k = blocos.findIndex(b => b.getBoundingClientRect().bottom > limite);
    if (k < 0) return toast('O texto corrido já cabe nesta página');
    const b = blocos[k], restos = blocos.slice(k + 1).map(x => x.outerHTML);
    let mantem = blocos.slice(0, k).map(x => x.outerHTML), primeiro = '', segundo = b.outerHTML;
    if (b.tagName === 'P' && !b.children.length && b.getBoundingClientRect().top < limite - pr.width * 0.06) {   // divide o parágrafo por palavras
      const original = b.textContent, palavras = original.split(/\s+/);
      let lo = 0, hi = palavras.length;
      while (lo < hi) { const mid = (lo + hi + 1) >> 1; b.textContent = palavras.slice(0, mid).join(' '); if (b.getBoundingClientRect().bottom <= limite) lo = mid; else hi = mid - 1; }
      b.textContent = original;
      if (lo > 0 && lo < palavras.length) {
        const cls = b.className ? ` class="${esc(b.className)}"` : '';
        primeiro = `<p${cls}>${esc(palavras.slice(0, lo).join(' '))}</p>`; segundo = `<p${cls}>${esc(palavras.slice(lo).join(' '))}</p>`;
      }
    }
    const novoHtml = sanitizeHTML([segundo, ...restos].join(''));
    mantem = mantem.join('') + primeiro;
    const nova = { id: Store.uid(), tpl: 'materia', secao: ed.d.secao, titulo: (ed.d.titulo || 'Matéria') + ' (cont.)', html: novoHtml, colunas: ed.d.colunas, objs: [], status: 'rascunho', fonte: ed.d.fonte || 1 };
    apply(() => { ed.d.html = sanitizeHTML(mantem); });
    saveNow();
    Store.insertAfter('paginas', ed.id, nova, { silent: true });
    toast('O resto do texto foi para uma nova página', { label: 'Abrir', fn: () => abrirPagina(nova) });
  }

  /* ───────────────── página ───────────────── */
  function buildPage() {
    const fs = folhas(), sec = secOf(ed.d);
    const k = fs.findIndex(x => x.p && x.p.id === ed.d.id);
    const cur = { tipo: 'pagina', p: ed.d, sec, n: k >= 0 ? fs[k].n : fs.length + 1 };
    ed.page = pageEl(cur, k >= 0 ? fs.map((x, i) => (i === k ? cur : x)) : [...fs, cur], true);
    ed.layer = h('div', { class: 'cv-layer' });
    ed.holder.replaceChildren(ed.page, ed.layer);
    ed.holder.style.setProperty('--z', ed.zoom);
    ed.page.querySelectorAll('[data-edit=corpo], [data-edit=caixa]').forEach(a => trackRte(a, typed));
    const t = ed.page.querySelector('[data-edit=titulo]');
    if (t) {
      t.addEventListener('input', typed);
      t.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); ed.page.querySelector('[data-edit=corpo]')?.focus(); } });
      t.addEventListener('paste', e => { e.preventDefault(); document.execCommand('insertText', false, e.clipboardData.getData('text/plain').replace(/\s+/g, ' ')); });
    }
    const tpl = TEMPLATES.find(x => x[0] === ed.d.tpl)?.[1] || '';
    ed.ttl.replaceChildren(h('b', {}, sec ? sec.nome : 'Geral'), h('small', {}, `Página ${cur.n} · ${tpl}`));
    renderOverlay(); renderBar(); check();
  }

  /* ───────────────── objetos: geometria ───────────────── */
  const figOf = i => (i === -2 ? ed.page.querySelector('.txt[data-q]')
    : ed.page.querySelector(`.fig[data-i="${i}"], .bg[data-i="${i}"], .tbox[data-i="${i}"]`));
  function setBox(t, o) {
    t.style.left = o.x + '%'; t.style.top = o.y + '%'; t.style.width = o.w + '%';
    t.style[t.classList.contains('tbox') || t.classList.contains('txt') ? 'minHeight' : 'height'] = o.h + '%';
    t.style.transform = `rotate(${o.rot || 0}deg)`;
  }
  function rectOf(o, i, P) {                    // retângulo (em % da folha) de qualquer objeto
    if (i === -2 || o.tipo === 'texto') {
      const el = figOf(i), r = el?.getBoundingClientRect();
      return { x: o.x, y: o.y, w: o.w, h: r ? Math.max(o.h, r.height / P.height * 100) : o.h };
    }
    if (o.pos === 'livre') return { x: o.x, y: o.y, w: o.w, h: o.h };
    const el = figOf(i); if (!el) return { x: 10, y: 10, w: 30, h: 20 };
    const r = el.getBoundingClientRect();
    return { x: (r.left - P.left) / P.width * 100, y: (r.top - P.top) / P.height * 100, w: r.width / P.width * 100, h: r.height / P.height * 100 };
  }
  function toLivre(i) {
    const o = ed.d.objs[i]; if (!o || o.tipo === 'texto' || o.pos === 'livre') return;
    const was = o.pos, r = rectOf(o, i, ed.page.getBoundingClientRect());
    Object.assign(o, { pos: 'livre', x: r2(r.x), y: r2(r.y), w: r2(r.w), h: r2(r.h), rot: 0, atras: was === 'fundo' });
  }

  /* ───────────────── guias e encaixe ───────────────── */
  function candidates(excl, P) {
    const xs = [0, 50, 100, MARGEM, 100 - MARGEM], ys = [0, 50, 100, MARGEM, 100 - MARGEM];
    ed.d.objs.forEach((o, i) => {
      if (excl.has(i) || (o.tipo !== 'texto' && o.pos === 'fundo')) return;
      const r = rectOf(o, i, P); xs.push(r.x, r.x + r.w / 2, r.x + r.w); ys.push(r.y, r.y + r.h / 2, r.y + r.h);
    });
    if (ed.d.quadro && !excl.has(-2)) { const r = rectOf(ed.d.quadro, -2, P); xs.push(r.x, r.x + r.w / 2, r.x + r.w); ys.push(r.y, r.y + r.h / 2, r.y + r.h); }
    return { xs, ys };
  }
  function snapAxis(vals, cands, thr) {
    let best = null;
    for (const v of vals) for (const c of cands) { const d = c - v; if (Math.abs(d) <= thr && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, line: c }; }
    return best;
  }
  function drawGuides(gs) {
    ed.layer.querySelectorAll('.cv-guide').forEach(g => g.remove());
    for (const g of gs) ed.layer.append(h('i', { class: 'cv-guide ' + g.t, style: g.t === 'v' ? `left:${g.p}%` : `top:${g.p}%` }));
  }
  let lastSnap = false;
  const buzz = on => { if (on && !lastSnap && navigator.vibrate) navigator.vibrate(6); lastSnap = on; };

  /* ───────────────── overlay: seleção, mover, redimensionar, girar ───────────────── */
  function renderOverlay() {
    ed.layer.replaceChildren();
    const P = ed.page.getBoundingClientRect();
    if (ed.grid) ed.layer.append(h('div', { class: 'cv-grid', style: `--m:${MARGEM}%` }));
    const items = ed.d.objs.map((o, i) => ({ o, i, r: rectOf(o, i, P) }));
    if (ed.d.quadro) items.push({ o: ed.d.quadro, i: -2, r: rectOf(ed.d.quadro, -2, P) });
    items.filter(x => !(x.i >= 0 && x.o.tipo !== 'texto' && x.o.pos === 'fundo') || ed.multi.has(x.i))      // fundo não bloqueia o texto
      .sort((a, b) => ed.multi.has(a.i) - ed.multi.has(b.i) || (a.i === ed.sel) - (b.i === ed.sel) || b.r.w * b.r.h - a.r.w * a.r.h)
      .forEach(({ o, i, r }) => {
        const on = ed.multi.has(i) || i === ed.sel, single = on && ed.multi.size <= 1, editing = i === ed.editBox;
        const rot = i === -2 || o.tipo === 'texto' || o.pos === 'livre' ? o.rot || 0 : 0;
        const box = h('div', {
          class: 'cv-box' + (on ? ' sel' : '') + (editing ? ' passthru' : '') + (i === -2 ? ' frame' : '') + (on && ed.crop ? ' crop' : ''), 'data-i': i,
          tabindex: on ? '0' : '-1',
          'aria-label': `${i === -2 ? 'Quadro do texto' : o.tipo === 'texto' ? 'Caixa de texto' : 'Imagem'} ${i >= 0 ? i + 1 : ''}${on ? ' selecionado: setas movem, Delete remove' : ''}`,
          style: `left:${r.x}%;top:${r.y}%;width:${r.w}%;height:${r.h}%;transform:rotate(${rot}deg)`,
          onpointerdown: e => down(e, i), ondblclick: () => { if (o.tipo === 'texto') enterEdit(i); },
        });
        if (single && !editing && !ed.crop) {
          for (const k of Object.keys(HANDLES)) box.append(h('i', { class: 'cv-h', 'data-h': k }));
          box.append(h('i', { class: 'cv-rot', 'data-h': 'rot', title: 'Girar' }));
        }
        ed.layer.append(box);
      });
  }
  function select(i) {
    ed.sel = i; ed.multi = new Set(i >= 0 ? [i] : []); ed.editBox = -1; ed.rte = null; ed.crop = false;
    document.activeElement?.blur?.();
    renderOverlay(); renderBar();
  }
  function toggleMulti(i) {
    if (i === -2) return select(i);
    ed.multi.delete(-2);
    if (ed.multi.has(i)) ed.multi.delete(i); else ed.multi.add(i);
    ed.sel = ed.multi.size ? i : -1; ed.editBox = -1; ed.rte = null; ed.crop = false; ed.panel = false;
    document.activeElement?.blur?.();
    renderOverlay(); renderBar();
  }
  function deselect() { ed.panel = false; ed.multiMode = false; select(-1); }
  function down(e, i) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const o = objAt(i), role = e.target.dataset.h || 'move';
    if (e.pointerType === 'mouse') e.preventDefault();
    if (role === 'move' && (e.shiftKey || e.ctrlKey || e.metaKey || ed.multiMode)) { toggleMulti(i); return; }   // seleção múltipla
    if (o.tipo === 'texto' && role === 'move' && !ed.crop) {                // toque duplo edita o texto
      const now = performance.now();
      if (ed.lastTap && ed.lastTap.i === i && now - ed.lastTap.t < 350) { ed.lastTap = null; enterEdit(i); return; }
      ed.lastTap = { i, t: now };
    }
    const was = ed.multi.has(i);
    if (!was) select(i); else ed.sel = i;
    if (!was && e.pointerType !== 'mouse') return;                          // no toque, o 1º toque só seleciona
    begin(e, i, ed.crop && role === 'move' ? 'crop' : role);
  }

  function begin(e, i, role) {
    const P0 = ed.page.getBoundingClientRect();
    const alvos = role === 'move' && ed.multi.size > 1 ? [...ed.multi].filter(k => k >= 0) : [i];
    if (role !== 'crop') {                                                   // preset vira livre ao ser mexido
      let precisa = false;
      for (const k of alvos) { const ok = objAt(k); if (k >= 0 && ok.tipo !== 'texto' && ok.pos !== 'livre') { toLivre(k); precisa = true; } }
      if (precisa) { syncFromDom(); buildPage(); }
    }
    const P = ed.page.getBoundingClientRect(), pid = e.pointerId, x0 = e.clientX, y0 = e.clientY;
    for (const k of alvos) if (isTexto(k)) { const o = objAt(k), r = figOf(k)?.getBoundingClientRect(); if (r) o.h = r2(Math.max(o.h, r.height / P.height * 100)); }
    const o = objAt(i);
    const m0s = alvos.map(k => { const q = objAt(k); return { k, x: q.x, y: q.y, w: q.w, h: q.h, rot: q.rot || 0 }; });
    const m0 = m0s.find(m => m.k === i) || m0s[0], free = isTexto(i);
    const th = m0.rot * Math.PI / 180, u = [Math.cos(th), Math.sin(th)], v = [-Math.sin(th), Math.cos(th)];
    const w0 = m0.w / 100 * P.width, h0 = m0.h / 100 * P.height;
    const C = [P.left + (m0.x + m0.w / 2) / 100 * P.width, P.top + (m0.y + m0.h / 2) / 100 * P.height];
    const excl = new Set(alvos), cand = candidates(excl, P), thrX = SNAP_PX / P.width * 100, thrY = SNAP_PX / P.height * 100;
    const ub = {                                                             // retângulo que envolve a seleção
      x: Math.min(...m0s.map(m => m.x)), y: Math.min(...m0s.map(m => m.y)),
      x2: Math.max(...m0s.map(m => m.x + m.w)), y2: Math.max(...m0s.map(m => m.y + m.h)),
    };
    const paint = k => { const q = objAt(k), b = ed.layer.querySelector(`.cv-box[data-i="${k}"]`), f = figOf(k); if (b) setBox(b, q); if (f) setBox(f, q); };
    let moved = false;
    const crop0 = { fx: o.fx ?? 50, fy: o.fy ?? 50 };

    const move = ev => {
      if (ev.pointerId !== pid) return;
      ev.preventDefault(); moved = true;
      const guides = [];
      if (role === 'move') {
        let dx = (ev.clientX - x0) / P.width * 100, dy = (ev.clientY - y0) / P.height * 100;
        const bw = ub.x2 - ub.x, bh = ub.y2 - ub.y;
        const sx = snapAxis([ub.x + dx, ub.x + dx + bw / 2, ub.x + dx + bw], cand.xs, thrX);
        const sy = snapAxis([ub.y + dy, ub.y + dy + bh / 2, ub.y + dy + bh], cand.ys, thrY);
        if (sx) { dx += sx.d; guides.push({ t: 'v', p: sx.line }); }
        if (sy) { dy += sy.d; guides.push({ t: 'h', p: sy.line }); }
        buzz(!!(sx || sy));
        for (const m of m0s) { const q = objAt(m.k); q.x = r2(clamp(m.x + dx, 10 - m.w, 90)); q.y = r2(clamp(m.y + dy, 10 - m.h, 90)); paint(m.k); }
        drawGuides(guides); return;
      }
      if (role === 'crop') {                                                // arrastar a imagem dentro da moldura
        const el = figOf(i), img = el?.querySelector?.('img') || el;
        const bw = el.getBoundingClientRect().width, bh = el.getBoundingClientRect().height, cz = o.cz || 1;
        const nw = img.naturalWidth || 1, nh = img.naturalHeight || 1, s = Math.max(bw / nw, bh / nh);
        const denX = Math.max(bw * 0.5, nw * s - bw + (cz - 1) * bw), denY = Math.max(bh * 0.5, nh * s - bh + (cz - 1) * bh);
        o.fx = r2(clamp(crop0.fx - (ev.clientX - x0) / denX * 100, 0, 100)); o.fy = r2(clamp(crop0.fy - (ev.clientY - y0) / denY * 100, 0, 100));
        aplicaCrop(img, o); return;
      }
      if (role === 'rot') {
        let a = Math.atan2(ev.clientY - C[1], ev.clientX - C[0]) * 180 / Math.PI + 90;
        a = ((a + 540) % 360) - 180;
        for (const s of [0, 90, -90, 180, -180]) if (Math.abs(a - s) < 4) a = s;
        o.rot = Math.round(a);
      } else {
        const [sx, sy] = HANDLES[role], min = P.width * 0.06;
        const O = [C[0] - sx * w0 / 2 * u[0] - sy * h0 / 2 * v[0], C[1] - sx * w0 / 2 * u[1] - sy * h0 / 2 * v[1]];
        const d = [ev.clientX - O[0], ev.clientY - O[1]];
        const a = (d[0] * u[0] + d[1] * u[1]) * sx, b = (d[0] * v[0] + d[1] * v[1]) * sy;
        let nw = w0, nh = h0;
        const locked = sx && sy && !free;
        if (locked) { nw = Math.max(a, b * (w0 / h0), min); nh = nw / (w0 / h0); }       // canto: mantém a proporção (imagem)
        else { if (sx) nw = Math.max(a, min); if (sy) nh = Math.max(b, min); }
        nw = Math.min(nw, P.width * 2.5);
        const nc = [O[0] + sx * nw / 2 * u[0] + sy * nh / 2 * v[0], O[1] + sx * nw / 2 * u[1] + sy * nh / 2 * v[1]];
        let X = (nc[0] - nw / 2 - P.left) / P.width * 100, Y = (nc[1] - nh / 2 - P.top) / P.height * 100, W = nw / P.width * 100, H = nh / P.height * 100;
        if (m0.rot === 0) {                                                  // encaixe das bordas (só sem rotação)
          const L = X, R = X + W, T = Y, B = Y + H;
          let snx = null, sny = null;
          if (sx === 1) snx = snapAxis([R], cand.xs, thrX); else if (sx === -1) snx = snapAxis([L], cand.xs, thrX);
          if (sy === 1) sny = snapAxis([B], cand.ys, thrY); else if (sy === -1) sny = snapAxis([T], cand.ys, thrY);
          if (locked) {
            if (snx) { W = sx === 1 ? W + snx.d : W - snx.d; H = W * m0.h / m0.w; X = sx === 1 ? m0.x : m0.x + m0.w - W; Y = sy === 1 ? m0.y : m0.y + m0.h - H; guides.push({ t: 'v', p: snx.line }); }
          } else {
            if (snx) { if (sx === 1) W += snx.d; else { X += snx.d; W -= snx.d; } guides.push({ t: 'v', p: snx.line }); }
            if (sny) { if (sy === 1) H += sny.d; else { Y += sny.d; H -= sny.d; } guides.push({ t: 'h', p: sny.line }); }
          }
          buzz(!!(snx || sny));
        }
        o.x = r2(X); o.y = r2(Y); o.w = r2(W); o.h = r2(H);
      }
      paint(i); drawGuides(guides);
    };
    const up = ev => {
      if (ev.pointerId !== pid) return;
      removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
      if (moved) { commitLive(); renderOverlay(); check(); }
    };
    addEventListener('pointermove', move, { passive: false });
    addEventListener('pointerup', up);
    addEventListener('pointercancel', up);
  }
  function aplicaCrop(img, o) {
    img.style.objectPosition = `${o.fx ?? 50}% ${o.fy ?? 50}%`;
    img.style.transformOrigin = `${o.fx ?? 50}% ${o.fy ?? 50}%`;
    img.style.transform = `scale(${o.cz || 1})`;
  }
  function enterEdit(i) {
    if (ed.d.objs[i]?.tipo !== 'texto') return;
    ed.sel = i; ed.multi = new Set([i]); ed.editBox = i; ed.crop = false; renderOverlay();
    const area = ed.page.querySelector(`.tbox[data-i="${i}"] .rich`);
    if (!area) return;
    ed.rte = area; area.focus();
    const r = document.createRange(); r.selectNodeContents(area);
    if (ed.selectAll) { ed.selectAll = false; } else r.collapse(false);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    renderBar();
  }

  /* ───────────────── pinça: zoom da página e gesto no objeto selecionado ───────────────── */
  const tDist = t => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  const tAng = t => Math.atan2(t[1].clientY - t[0].clientY, t[1].clientX - t[0].clientX) * 180 / Math.PI;
  function touchStart(e) {
    if (e.touches.length !== 2) return;
    const t = e.touches, mx = (t[0].clientX + t[1].clientX) / 2, my = (t[0].clientY + t[1].clientY) / 2;
    const pz = { d0: tDist(t), a0: tAng(t), mx, my, z0: ed.zoom, obj: null };
    const i = ed.sel;
    if (i !== -1 && i !== -2 && ed.multi.size <= 1 && !ed.rte) {
      const box = ed.layer.querySelector('.cv-box.sel');
      if (box) {
        const r = box.getBoundingClientRect(), dentro = q => q.clientX > r.left - 24 && q.clientX < r.right + 24 && q.clientY > r.top - 24 && q.clientY < r.bottom + 24;
        if (dentro(t[0]) && dentro(t[1])) {
          syncFromDom();
          if (ed.d.objs[i].tipo !== 'texto' && ed.d.objs[i].pos !== 'livre') { toLivre(i); buildPage(); }
          const o = ed.d.objs[i]; pz.obj = { i, x: o.x, y: o.y, w: o.w, h: o.h, rot: o.rot || 0 };
        }
      }
    }
    ed.pz = pz; e.preventDefault();
  }
  function touchMove(e) {
    const pz = ed.pz; if (!pz || e.touches.length < 2) return;
    e.preventDefault();
    const t = e.touches, k = tDist(t) / pz.d0;
    if (pz.obj) {                                              // redimensiona e gira o objeto em torno do centro
      const m = pz.obj, o = ed.d.objs[m.i], cx = m.x + m.w / 2, cy = m.y + m.h / 2;
      o.w = r2(clamp(m.w * k, 6, 250)); o.h = r2(m.h * (o.w / m.w)); o.x = r2(cx - o.w / 2); o.y = r2(cy - o.h / 2);
      let a = m.rot + (tAng(t) - pz.a0); a = ((a + 540) % 360) - 180; o.rot = Math.round(Math.abs(a) < 3 ? 0 : a);
      const b = ed.layer.querySelector(`.cv-box[data-i="${m.i}"]`), f = figOf(m.i); if (b) setBox(b, o); if (f) setBox(f, o);
      return;
    }
    const rect = ed.holder.getBoundingClientRect(), fx = (pz.mx - rect.left) / rect.width, fy = (pz.my - rect.top) / rect.height;
    ed.zoom = clamp(pz.z0 * k, 0.6, 3); ed.holder.style.setProperty('--z', ed.zoom);
    const nr = ed.holder.getBoundingClientRect();                // mantém o ponto entre os dedos parado
    ed.scroller.scrollLeft += nr.left + fx * nr.width - pz.mx; ed.scroller.scrollTop += nr.top + fy * nr.height - pz.my;
  }
  function touchEnd(e) {
    if (!ed.pz || e.touches.length >= 2) return;
    const had = ed.pz; ed.pz = null;
    if (had.obj) commitLive();
    renderOverlay(); if (ed.bar.dataset.mode === 'idle') renderBar();
    if (had.obj) check();
  }

  /* ───────────────── barras (inferior contextual) ───────────────── */
  const tbtn = (label, ic, fn, extra = {}) => h('button', { type: 'button', class: 'tbn' + (extra.danger ? ' danger' : '') + (extra.on ? ' on' : ''), onclick: fn, 'aria-label': label }, icon(ic, 20), h('span', {}, label));
  function barMode() { return ed.rte ? 'text' : ed.multi.size > 1 ? 'multi' : ed.sel !== -1 ? 'obj' : 'idle'; }
  function renderBar() {
    const mode = barMode();
    ed.bar.dataset.mode = mode;
    ed.bar.replaceChildren(mode === 'text' ? textBar() : mode === 'multi' ? multiBar() : mode === 'obj' ? objBar() : idleBar());
    ed.panelEl.hidden = !(mode === 'obj' && ed.panel);
    if (!ed.panelEl.hidden) renderPanel();
  }
  function idleBar() {
    return h('div', { class: 'ed-row' },
      tbtn('Texto', 'type', addTexto), tbtn('Imagem', 'image', () => ed.file.click()),
      matchMedia('(pointer:coarse)').matches && tbtn('Câmera', 'camera', () => ed.cam.click()),
      tbtn('Biblioteca', 'folder', () => bibliotecaSheet(usarMidia)), tbtn('Objetos', 'layers', objetosSheet), tbtn('Páginas', 'pages', paginasSheet),
      tbtn(ed.d.quadro ? 'Quadro' : 'Mover texto', 'move', toggleQuadro), tbtn('Vários', 'multi', () => { ed.multiMode = true; toast('Toque nos objetos para selecionar vários'); renderBar(); }),
      tbtn('Grade', 'grid', () => { ed.grid = !ed.grid; try { localStorage.setItem('espro.grid', ed.grid ? '1' : '0'); } catch { /* ok */ } renderOverlay(); renderBar(); }, { on: ed.grid }),
      h('div', { class: 'ed-zoom' },
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Diminuir zoom', onclick: () => zoomBy(1 / 1.25) }, icon('zoomout', 20)),
        h('button', { type: 'button', class: 'zoom-val', 'aria-label': 'Ajustar à tela', onclick: () => setZoom(1) }, Math.round(ed.zoom * 100) + '%'),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Aumentar zoom', onclick: () => zoomBy(1.25) }, icon('zoomin', 20))));
  }
  function objBar() {
    const frame = ed.sel === -2, o = objAt(ed.sel), texto = o.tipo === 'texto', img = !frame && !texto;
    const mover = d => { const j = ed.sel + d; if (j < 0 || j >= ed.d.objs.length) return; apply(() => { const a = ed.d.objs; [a[ed.sel], a[j]] = [a[j], a[ed.sel]]; ed.sel = j; ed.multi = new Set([j]); }); };
    if (ed.crop) return h('div', { class: 'ed-row' }, h('span', { class: 'muted crop-hint' }, 'Arraste a imagem dentro da moldura'), tbtn('Concluir', 'check', () => { ed.crop = false; ed.panel = false; renderOverlay(); renderBar(); }));
    return h('div', { class: 'ed-row' },
      texto && tbtn('Editar', 'pencil', () => enterEdit(ed.sel)),
      img && tbtn('Recortar', 'crop', () => { ed.crop = true; ed.panel = true; renderOverlay(); renderBar(); }),
      tbtn('Ajustes', 'sliders', () => { ed.panel = !ed.panel; renderBar(); }),
      !frame && tbtn('Frente', 'up', () => mover(1)), !frame && tbtn('Trás', 'down', () => mover(-1)),
      !frame && tbtn('Duplicar', 'copy', duplicarObj),
      tbtn(frame ? 'Restaurar' : 'Remover', frame ? 'undo' : 'trash', frame ? toggleQuadro : removerObj, { danger: !frame }),
      tbtn('Pronto', 'check', deselect));
  }
  function multiBar() {
    const al = (lbl, ic, fn) => tbtn(lbl, ic, fn);
    return h('div', { class: 'ed-row' },
      al('Esq.', 'aL', () => alinhar('l')), al('Centro', 'aC', () => alinhar('c')), al('Dir.', 'aR', () => alinhar('r')),
      al('Topo', 'aT', () => alinhar('t')), al('Meio', 'aM', () => alinhar('m')), al('Base', 'aB', () => alinhar('b')),
      al('Dist. H', 'dH', () => distribuir('x')), al('Dist. V', 'dV', () => distribuir('y')),
      tbtn('Duplicar', 'copy', duplicarObj), tbtn('Remover', 'trash', removerObj, { danger: true }), tbtn('Pronto', 'check', deselect));
  }
  function textBar() {
    if (!ed.tb) ed.tb = buildTextBar();
    refreshTb();
    return h('div', { class: 'ed-row', onmousedown: e => { if (!e.target.closest('select, input')) e.preventDefault(); } },
      ed.editBox >= 0 && h('button', { type: 'button', class: 'tbn', onclick: () => { document.activeElement?.blur?.(); ed.editBox = -1; ed.rte = null; renderOverlay(); renderBar(); } }, icon('check', 20), h('span', {}, 'Concluir')),
      ed.tb);
  }
  function buildTextBar() {
    const ex = (cmd, val) => () => { if (ed.rte) rteExec(ed.rte, cmd, val); };
    const tb = (title, glyph, cmd, val) => h('button', { type: 'button', class: 'tb', title, 'aria-label': title, 'data-cmd': cmd, onclick: ex(cmd, val) }, glyph);
    const ic = n => icon(n, 18);
    const sel = (title, opts, fn) => h('select', { class: 'tb-sel', 'aria-label': title, title, onchange: e => { if (e.target.value && ed.rte) fn(e.target.value); e.target.selectedIndex = 0; } },
      h('option', { value: '' }, title), opts.map(([v, l]) => h('option', { value: v }, l)));
    return h('div', { class: 'tb-all', role: 'toolbar', 'aria-label': 'Formatação do texto' },
      tb('Negrito', h('b', {}, 'B'), 'bold'), tb('Itálico', h('i', {}, 'I'), 'italic'), tb('Sublinhado', h('u', {}, 'U'), 'underline'), tb('Tachado', h('s', {}, 'S'), 'strikeThrough'),
      h('button', { type: 'button', class: 'tb tb-colorwrap', title: 'Cor do texto', 'aria-label': 'Cor do texto', onclick: () => { const a = ed.rte; if (a) escolherCor(c => rteExec(a, 'foreColor', c)); } }, h('span', {}, 'A')),
      sel('Estilo', [['p', 'Parágrafo'], ['h2', 'Título'], ['h3', 'Subtítulo'], ['blockquote', 'Citação'], ['lead', 'Lead (resumo)'], ['legenda', 'Legenda'], ['destaque', 'Destaque colorido']], estiloBloco),
      sel('Fonte', [['Inter', 'Sem serifa'], ['Fraunces', 'Serifada'], ['Courier New', 'Monoespaçada']], v => rteExec(ed.rte, 'fontName', v)),
      sel('Tamanho', [['2', 'Pequeno'], ['3', 'Normal'], ['5', 'Grande'], ['6', 'Enorme']], v => rteExec(ed.rte, 'fontSize', v)),
      tb('Lista com marcadores', ic('ul'), 'insertUnorderedList'), tb('Lista numerada', ic('ol'), 'insertOrderedList'),
      tb('Alinhar à esquerda', ic('alignL'), 'justifyLeft'), tb('Centralizar', ic('alignC'), 'justifyCenter'),
      tb('Alinhar à direita', ic('alignR'), 'justifyRight'), tb('Justificar', ic('alignJ'), 'justifyFull'),
      h('button', { type: 'button', class: 'tb', title: 'Inserir link', 'aria-label': 'Inserir link', onclick: () => {
        const url = prompt('Endereço do link (começa com https://)'); if (url && ed.rte) rteExec(ed.rte, 'createLink', url.trim());
      } }, ic('link')),
      tb('Limpar formatação', ic('eraser'), 'removeFormat'));
  }
  /* aplica um estilo de bloco: tags nativas ou classes (lead, legenda, destaque) no parágrafo atual */
  function estiloBloco(v) {
    const area = ed.rte; if (!area) return;
    rteExec(area, 'formatBlock', ['p', 'h2', 'h3', 'blockquote'].includes(v) ? `<${v}>` : '<p>');
    const sel = getSelection(); let n = sel.anchorNode;
    while (n && n.parentNode !== area && n !== area) n = n.parentNode;
    if (n && n !== area && n.classList) { n.classList.remove('st-lead', 'st-legenda', 'st-destaque'); if (!['p', 'h2', 'h3', 'blockquote'].includes(v)) n.classList.add('st-' + v); }
    area.dispatchEvent(new Event('input', { bubbles: true }));
  }
  function refreshTb() {
    if (!ed?.tb) return;
    ed.tb.querySelectorAll('[data-cmd]').forEach(b => { try { b.classList.toggle('on', document.queryCommandState(b.dataset.cmd)); } catch { /* sem estado */ } });
  }

  /* painel de ajustes do objeto selecionado */
  function renderPanel() {
    const o = objAt(ed.sel); if (!o) { ed.panelEl.hidden = true; return; }
    const frame = ed.sel === -2, texto = o.tipo === 'texto', livre = frame || texto || o.pos === 'livre';
    const sel2 = (val, opts, on) => h('select', { class: 'input sm', onchange: e => on(e.target.value) }, opts.map(([v, l]) => h('option', { value: v, selected: v === val }, l)));
    const liveBox = () => { const b = ed.layer.querySelector(`.cv-box[data-i="${ed.sel}"]`), f = figOf(ed.sel); if (b) setBox(b, o); if (f) setBox(f, o); };
    const largura = h('input', {
      type: 'range', min: '8', max: '150', value: String(Math.round(o.w)), class: 'cv-range',
      oninput: e => {                             // redimensiona em torno do centro, mantendo a proporção
        const nw = Number(e.target.value), k = nw / o.w, cx = o.x + o.w / 2, cy = o.y + o.h / 2;
        o.w = r2(nw); o.h = r2(o.h * k); o.x = r2(cx - o.w / 2); o.y = r2(cy - o.h / 2);
        liveBox(); e.target.parentNode.firstChild.textContent = `Largura (${Math.round(o.w)}%)`;
      },
      onchange: () => { commitLive(); renderOverlay(); check(); },
    });
    const zoomImg = h('input', {
      type: 'range', min: '100', max: '400', value: String(Math.round((o.cz || 1) * 100)), class: 'cv-range',
      oninput: e => { o.cz = Number(e.target.value) / 100; const f = figOf(ed.sel); aplicaCrop(f.querySelector('img') || f, o); e.target.parentNode.firstChild.textContent = `Zoom da imagem (${Math.round(o.cz * 100)}%)`; },
      onchange: () => commitLive(),
    });
    const num = (lbl, key, step = 0.5) => field(lbl, h('input', {
      class: 'input sm', type: 'number', step: String(step), value: String(r2(o[key] || 0)),
      onchange: e => apply(() => { if (!frame && !texto && o.pos !== 'livre') toLivre(ed.sel); o[key] = Number(e.target.value) || 0; }),
    }));
    const campos = [
      !frame && !texto && field('Posição', sel2(o.pos, IMG_POS_ALL, v => apply(() => { if (v === 'livre') toLivre(ed.sel); else o.pos = v; }))),
      !frame && !texto && o.pos !== 'livre' && o.pos !== 'fundo' && field('Tamanho', sel2(o.tam, IMG_TAM, v => apply(() => { o.tam = v; }))),
      livre && field(`Largura (${Math.round(o.w)}%)`, largura),
      !frame && !texto && field(`Zoom da imagem (${Math.round((o.cz || 1) * 100)}%)`, zoomImg),
      livre && h('div', { class: 'num-grid' }, num('X %', 'x'), num('Y %', 'y'), num('Larg. %', 'w'), num('Alt. %', 'h'), num('Giro °', 'rot', 1)),
      !frame && !texto && h('div', { class: 'row' },
        field('Forma', sel2(o.forma, IMG_FORMA, v => apply(() => { o.forma = v; }))),
        field('Legenda', h('input', { class: 'input sm', value: o.legenda || '', placeholder: 'Opcional', autocomplete: 'off', onchange: e => apply(() => { o.legenda = e.target.value; }) }))),
      !frame && !texto && field('Texto alternativo (acessibilidade)', h('input', { class: 'input sm', value: o.alt || '', placeholder: 'Descreva a imagem', autocomplete: 'off', onchange: e => apply(() => { o.alt = e.target.value; }) })),
      !frame && !texto && h('button', { type: 'button', class: 'btn small', onclick: () => { ed.replaceIdx = ed.sel; ed.fileOne.click(); } }, icon('image', 16), 'Trocar imagem'),
      texto && field('Fundo da caixa', sel2(o.fundo || '', FUNDO_OPTS, v => apply(() => { o.fundo = v; }))),
      !frame && livre && h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!o.atras, onchange: e => apply(() => { o.atras = e.target.checked; }) }), 'Atrás do texto'),
      frame && h('p', { class: 'muted' }, 'Arraste o quadro para mover o título e o texto corrido juntos; use as bolinhas para redimensionar.'),
    ].filter(Boolean);
    ed.panelEl.replaceChildren(...campos);
  }

  /* ações de objeto */
  function toggleQuadro() {
    if (ed.d.quadro) { apply(() => { delete ed.d.quadro; ed.sel = -1; ed.multi = new Set(); ed.panel = false; }); return; }
    const txt = ed.page.querySelector('.txt'); if (!txt) return toast('Esta página não tem quadro de texto');
    const P = ed.page.getBoundingClientRect(), r = txt.getBoundingClientRect();
    apply(() => { ed.d.quadro = { x: r2((r.left - P.left) / P.width * 100), y: r2((r.top - P.top) / P.height * 100), w: r2(r.width / P.width * 100), h: r2(r.height / P.height * 100), rot: 0 }; });
    select(-2);
  }
  function addTexto() {
    apply(() => {
      ed.d.objs.push({ tipo: 'texto', html: '<p>Novo texto</p>', pos: 'livre', x: 15, y: clamp(30 + ed.d.objs.length * 5, 0, 70), w: 70, h: 12, rot: 0, atras: false, fundo: '' });
      ed.sel = ed.d.objs.length - 1; ed.multi = new Set([ed.sel]);
    });
    ed.selectAll = true; enterEdit(ed.sel);
    document.execCommand('selectAll');
  }
  function novaImagem(src, ar) {
    const fundoTpl = ['capa', 'destaque', 'anuncio', 'contracapa'].includes(ed.d.tpl) && !ed.d.objs.some(o => o.tipo !== 'texto' && o.pos === 'fundo');
    const w = 50, n = ed.d.objs.length;
    ed.d.objs.push(fundoTpl
      ? { tipo: 'img', src, pos: 'fundo', tam: 'g', forma: 'ret', legenda: '' }
      : { tipo: 'img', src, pos: 'livre', tam: 'm', forma: 'ret', legenda: '', x: 25, y: clamp(16 + n * 6, 0, 60), w, h: r2(w * PAGE_AR / ar), rot: 0, atras: false });
  }
  async function addFiles(files) {
    const novos = [];
    for (const fl of files) {
      if (!/^image\//.test(fl.type)) continue;
      if (ed.d.objs.filter(o => o.tipo !== 'texto').length + novos.length >= 8) { toast('Máximo de 8 imagens por página'); break; }
      try { novos.push(await resizeImage(fl)); } catch { toast('Não consegui ler uma das imagens'); }
    }
    if (!novos.length) return;
    apply(() => { for (const { src, ar } of novos) novaImagem(Store.addMidia(src), ar); ed.sel = ed.d.objs.length - 1; ed.multi = new Set([ed.sel]); ed.panel = false; });
  }
  async function onFiles(e) { const fs = [...e.target.files]; e.target.value = ''; await addFiles(fs); }
  async function onFileOne(e) {                                    // trocar imagem mantendo posição, tamanho e forma
    const fl = e.target.files[0]; e.target.value = ''; if (!fl) return;
    try {
      const { src } = await resizeImage(fl), i = ed.replaceIdx;
      apply(() => { Object.assign(ed.d.objs[i], { src: Store.addMidia(src), fx: 50, fy: 50, cz: 1, ph: false }); });
    } catch { toast('Não consegui ler essa imagem'); }
  }
  function usarMidia(ref) {                                        // reutiliza imagem da biblioteca
    const im = new Image();
    im.onload = () => apply(() => { novaImagem(ref, im.naturalWidth / im.naturalHeight || 1.33); ed.sel = ed.d.objs.length - 1; ed.multi = new Set([ed.sel]); ed.panel = false; });
    im.src = srcDe({ src: ref });
  }
  function paginasSheet() {                                        // miniaturas de todas as páginas (pular entre elas)
    const fs = folhas();
    openSheet('Páginas da revista', h('div', {},
      h('div', { class: 'tpl-grid pg-grid' }, fs.filter(f => f.tipo === 'pagina').map(f => h('button', { type: 'button', class: 'tpl-card' + (f.p.id === ed.id ? ' on' : ''), onclick: () => { closeSheet(); if (f.p.id !== ed.id) { saveNow(); abrirPagina(f.p); } } },
        miniPage(f.p), h('span', {}, `${f.n}. ${f.p.titulo || '(sem título)'}`)))),
      h('button', { type: 'button', class: 'btn', onclick: () => { closeSheet(); saveNow(); escolherModelo({ secao: ed.d.secao }); } }, icon('plus', 18), 'Nova página')));
  }
  function irPagina(dir) {                                         // Alt+←/→
    const lista = ordenadas(), i = lista.findIndex(p => p.id === ed.id), alvo = lista[i + dir];
    if (alvo) { saveNow(); abrirPagina(alvo); }
  }
  const alvosMulti = () => [...ed.multi].filter(k => k >= 0);
  function duplicarObj() {
    apply(() => {
      const novos = [];
      for (const k of alvosMulti()) { toLivre(k); const c = clone(ed.d.objs[k]); c.x += 4; c.y += 4; ed.d.objs.push(c); novos.push(ed.d.objs.length - 1); }
      ed.sel = novos.at(-1); ed.multi = new Set(novos);
    });
  }
  function removerObj() {
    const idx = alvosMulti().sort((a, b) => b - a);
    if (ed.sel === -2) return toggleQuadro();
    apply(() => { for (const k of idx) ed.d.objs.splice(k, 1); resetSel(); });
    toast(idx.length > 1 ? `${idx.length} objetos removidos` : 'Objeto removido', { label: 'Desfazer', fn: undo });
  }
  function alinhar(modo) {
    const ks = alvosMulti();
    apply(() => {
      const P = ed.page.getBoundingClientRect();
      for (const k of ks) toLivre(k);
      const rs = ks.map(k => ({ k, o: ed.d.objs[k] }));
      const L = Math.min(...rs.map(r => r.o.x)), R = Math.max(...rs.map(r => r.o.x + r.o.w)), T = Math.min(...rs.map(r => r.o.y)), B = Math.max(...rs.map(r => r.o.y + r.o.h));
      for (const { o } of rs) {
        if (modo === 'l') o.x = L; else if (modo === 'r') o.x = R - o.w; else if (modo === 'c') o.x = r2((L + R) / 2 - o.w / 2);
        else if (modo === 't') o.y = T; else if (modo === 'b') o.y = B - o.h; else if (modo === 'm') o.y = r2((T + B) / 2 - o.h / 2);
        o.x = r2(o.x); o.y = r2(o.y);
      }
      void P;
    });
  }
  function distribuir(eixo) {
    const ks = alvosMulti(); if (ks.length < 3) return toast('Selecione 3 ou mais objetos para distribuir');
    apply(() => {
      for (const k of ks) toLivre(k);
      const rs = ks.map(k => ed.d.objs[k]).sort((a, b) => a[eixo] - b[eixo]), dim = eixo === 'x' ? 'w' : 'h';
      const ini = rs[0][eixo], fim = rs.at(-1)[eixo] + rs.at(-1)[dim], soma = rs.reduce((s, o) => s + o[dim], 0), gap = (fim - ini - soma) / (rs.length - 1);
      let pos = ini; for (const o of rs) { o[eixo] = r2(pos); pos += o[dim] + gap; }
    });
  }
  function objetosSheet() {
    const lista = ed.d.objs.map((o, i) => ({ o, i })).reverse();
    const nome = o => (o.tipo === 'texto' ? 'Texto: ' + (o.html || '').replace(/<[^>]*>/g, ' ').trim().slice(0, 28) : `Imagem · ${IMG_POS_ALL.find(p => p[0] === o.pos)?.[1].split(' (')[0] || ''}`);
    openSheet('Objetos da página', lista.length
      ? h('div', {}, h('p', { class: 'muted hint' }, 'De cima para baixo = da frente para trás. Toque para selecionar (útil para a imagem de fundo).'),
        h('ul', { class: 'list' }, lista.map(({ o, i }) => h('li', {}, h('button', { class: 'item', onclick: () => { closeSheet(); select(i); } },
          o.tipo === 'texto' ? h('span', { class: 'pn' }, 'Aa') : h('img', { class: 'obj-th', src: srcDe(o), alt: '' }),
          h('span', { class: 'grow' }, h('b', {}, nome(o))))))))
      : h('p', { class: 'empty' }, 'Ainda não há imagens nem caixas de texto. Use "Texto" e "Imagem" na barra de baixo.'));
  }

  /* ───────────────── equipe: comentários, revisão, tarefa, versões ───────────────── */
  function atualizaChat() { if (!ed) return; const n = abertosDe(ed.id), b = ed.chatBtn.querySelector('.badge'); b.textContent = n; b.hidden = !n; }
  function presenca() {
    if (!ed || !window.Sync?.conectado?.()) return;
    const id = ed.id;
    Sync.presenca(id).then(nomes => { if (!ed || ed.id !== id) return; ed.pres.hidden = !nomes.length; ed.pres.textContent = nomes.length ? `${nomes.join(', ')} também ${nomes.length > 1 ? 'estão editando' : 'está editando'}` : ''; });
  }
  function mudarStatus(st, texto) {
    closeSheet(); apply(() => { ed.d.status = st; });
    comentar(ed.id, texto, { sistema: true }); atualizaChat();
    toast('Situação: ' + (STATUS.find(x => x[0] === st)?.[1] || st));
  }
  function vincular(cid) { apply(() => { if (cid) ed.d.cardId = cid; else delete ed.d.cardId; }); vincularPaginaTarefa(ed.id, cid || null); closeSheet(); toast(cid ? 'Página ligada à tarefa' : 'Ligação removida'); }
  function criarTarefa() {
    const sec = secOf(ed.d), c = criarTarefaDaPagina(ed.d, sec?.id);
    closeSheet(); apply(() => { ed.d.cardId = c.id; }); toast('Tarefa criada no Quadro', { label: 'Ver', fn: () => { location.hash = '#/quadro'; } });
  }
  function historicoSheet() {
    syncFromDom(); snapshotPagina(clone(ed.d), 'Antes de abrir o histórico');
    const vs = versoesDe(ed.id);
    openSheet('Histórico de versões', vs.length
      ? h('div', {}, h('p', { class: 'muted hint' }, 'Toque em "Restaurar" para voltar a uma versão (a versão atual também é guardada antes).'),
        h('div', { class: 'tpl-grid pg-grid' }, vs.map(v => h('div', { class: 'tpl-card ver' }, miniPage({ ...v.snap, id: 'ver-' + v.id }),
          h('span', {}, `${quando(v.quando)} · ${v.autor}`), h('button', { type: 'button', class: 'btn small', onclick: () => restaurarVersao(v) }, 'Restaurar')))))
      : h('p', { class: 'empty' }, 'Ainda não há versões guardadas desta página.'));
  }
  function restaurarVersao(v) {
    closeSheet(); syncFromDom(); snapshotPagina(clone(ed.d), 'Antes de restaurar');
    apply(() => { const snap = clone(v.snap); for (const k of Object.keys(ed.d)) delete ed.d[k]; Object.assign(ed.d, snap, { id: ed.id }); });
    toast('Versão restaurada');
  }
  function extrasMenu() {
    const S = Store.get(), p = ed.d, tarefas = S.cards.filter(c => !c.paginaId || c.paginaId === ed.id);
    const acao = (rotulo, ic, fn, cls = '') => h('button', { type: 'button', class: 'btn ' + cls, onclick: fn }, icon(ic, 18), rotulo);
    const revisao = p.status !== 'revisao'
      ? [acao('Pedir revisão', 'check2', () => mudarStatus('revisao', `Revisão pedida por ${autorAtual()}.`))]
      : [acao('Aprovar', 'check', () => mudarStatus('pronta', `Aprovado por ${autorAtual()}.`)),
        acao('Pedir ajustes', 'alert', () => { const m = prompt('O que precisa mudar?'); if (m) mudarStatus('rascunho', `Ajustes pedidos por ${autorAtual()}: ${m}`); }, 'danger')];
    return [
      field('Tarefa do Quadro', h('select', { class: 'input', onchange: e => vincular(e.target.value) },
        [['', 'Sem tarefa ligada'], ...tarefas.map(c => [c.id, c.titulo])].map(([v, l]) => h('option', { value: v, selected: v === (p.cardId || '') }, l)))),
      !tarefaDaPagina(p) ? acao('Criar tarefa para esta página', 'plus', criarTarefa) : null,
      h('div', { class: 'row-btn' }, revisao),
      h('div', { class: 'row-btn' }, acao(`Comentários (${abertosDe(ed.id)})`, 'chat', () => { closeSheet(); comentariosSheet(ed.id, atualizaChat); }), acao('Histórico de versões', 'clock', historicoSheet)),
    ].filter(Boolean);
  }

  /* opções da página (menu ⋯) */
  function menuSheet() {
    const sel = (label, name, opts, val, on) => field(label, h('select', { class: 'input', name, onchange: e => on(e.target.value) }, opts.map(([v, l]) => h('option', { value: v, selected: v === val }, l))));
    openSheet('Opções da página', h('div', { class: 'form' },
      sel('Modelo', 'tpl', TEMPLATES, ed.d.tpl, v => apply(() => { ed.d.tpl = v; })),
      sel('Seção', 'secao', [['', 'Geral (sem seção)'], ...secoes().map(s => [s.id, s.nome])], ed.d.secao, v => apply(() => { ed.d.secao = v; })),
      sel('Situação', 'status', STATUS, ed.d.status, v => apply(() => { ed.d.status = v; })),
      sel('Colunas do texto', 'colunas', [['1', '1 coluna'], ['2', '2 colunas']], String(ed.d.colunas), v => apply(() => { ed.d.colunas = Number(v); })),
      h('div', { class: 'row-btn' },
        h('button', { type: 'button', class: 'btn', onclick: () => { ed.grid = !ed.grid; try { localStorage.setItem('espro.grid', ed.grid ? '1' : '0'); } catch { /* ok */ } closeSheet(); renderOverlay(); renderBar(); } }, icon('grid', 18), ed.grid ? 'Ocultar margens e grade' : 'Mostrar margens e grade'),
        h('button', { type: 'button', class: 'btn', onclick: duplicarPagina }, icon('copy', 18), 'Duplicar página'),
        h('button', { type: 'button', class: 'btn', onclick: () => { closeSheet(); saveNow(); window.verificarEdicao?.(); } }, icon('check2', 18), 'Verificar edição'),
        h('button', { type: 'button', class: 'btn', onclick: () => { closeSheet(); Views.revTab = 'previa'; location.hash = '#/revista'; } }, icon('book', 18), 'Ver a revista')),
      ...extrasMenu(),
      h('button', { type: 'button', class: 'btn danger', onclick: excluirPagina }, icon('trash', 18), 'Excluir página')));
  }
  function duplicarPagina() {
    syncFromDom();
    const c = clone(ed.d); c.id = Store.uid(); c.titulo = (c.titulo || 'Página') + ' (cópia)'; delete c.novo;
    Store.upsert('paginas', c, { silent: true });
    closeSheet(); toast('Página duplicada', { label: 'Abrir', fn: () => abrirPagina(c) });
  }
  function excluirPagina() {
    closeSheet(); clearTimeout(ed.tSave); clearTimeout(ed.tHist);
    const r = Store.remove('paginas', ed.id); ed.deleted = true;
    Views.revTab = 'edicao'; location.hash = '#/revista';
    if (r) toast('Página excluída', { label: 'Desfazer', fn: () => Store.restore('paginas', r.item, r.index) });
  }

  /* zoom */
  function setZoom(z) { ed.zoom = clamp(z, 0.6, 3); ed.holder.style.setProperty('--z', ed.zoom); renderOverlay(); if (ed.bar.dataset.mode === 'idle') renderBar(); }
  const zoomBy = k => setZoom(ed.zoom * k);

  /* ───────────────── teclado e foco ───────────────── */
  function keydown(e) {
    if (!ed || $('#sheet').open) return;
    const mod = e.ctrlKey || e.metaKey, t = e.target;
    if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); irPagina(e.key === 'ArrowLeft' ? -1 : 1); return; }
    const typing = t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName);
    if (mod && !e.altKey && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
    if (e.key === 'Escape') {
      if (ed.crop) { ed.crop = false; renderOverlay(); renderBar(); }
      else if (ed.editBox >= 0 || ed.rte) { document.activeElement?.blur?.(); ed.editBox = -1; ed.rte = null; renderOverlay(); renderBar(); }
      else if (ed.sel !== -1) deselect();
      return;
    }
    if (typing || ed.sel === -1) return;
    const step = e.shiftKey ? 5 : 1, dir = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (dir) {
      e.preventDefault();
      apply(() => { for (const k of ed.multi) { if (k >= 0) toLivre(k); const o = objAt(k); o.x = r2(o.x + dir[0]); o.y = r2(o.y + dir[1]); } });
      ed.layer.querySelector('.cv-box.sel')?.focus();
    }
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removerObj(); }
    else if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicarObj(); }
    else if (mod && e.key.toLowerCase() === 'a') { e.preventDefault(); ed.multi = new Set(ed.d.objs.map((_, i) => i)); ed.sel = ed.d.objs.length - 1; renderOverlay(); renderBar(); }
  }
  function focusin(e) {
    const t = e.target;
    if (t.matches?.('[data-edit=corpo]')) {
      if (ed.rte !== t) { ed.rte = t; ed.sel = -1; ed.multi = new Set(); ed.editBox = -1; renderOverlay(); renderBar(); }
    } else if (t.matches?.('[data-edit=caixa]')) {
      if (ed.rte !== t) { ed.rte = t; ed.editBox = Number(t.parentNode.dataset.i); ed.sel = ed.editBox; ed.multi = new Set([ed.sel]); renderOverlay(); renderBar(); }
    } else if (t.matches?.('[data-edit=titulo]')) {
      if (ed.rte || ed.sel !== -1) { ed.rte = null; ed.sel = -1; ed.multi = new Set(); ed.editBox = -1; renderOverlay(); renderBar(); }
    }
  }
  function stageDown(e) {
    if (e.target.closest('.cv-box, [contenteditable]')) return;
    if (ed.sel !== -1 || ed.rte || ed.multiMode) deselect();
  }

  /* ───────────────── abrir / fechar ───────────────── */
  function open(id) {
    close();
    const orig = Store.get().paginas.find(x => x.id === id);
    if (!orig) { setTimeout(() => { location.replace('#/revista'); }); return h('div'); }
    const d = normalize(orig);
    let grid = false; try { grid = localStorage.getItem('espro.grid') === '1'; } catch { /* ok */ }
    ed = { id, d, hist: [JSON.stringify(d)], hi: 0, sel: -1, multi: new Set(), multiMode: false, crop: false, grid, editBox: -1, rte: null, panel: false, zoom: 1, page: null, layer: null, tSave: 0, tHist: 0, lastTap: null, tb: null, deleted: false, pz: null };
    ed.status = h('span', { class: 'ed-status', 'data-s': 'ok', role: 'status' }, 'Salvo');
    ed.ttl = h('div', { class: 'ed-ttl' });
    ed.undoBtn = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Desfazer', onclick: undo }, icon('undo', 20));
    ed.redoBtn = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Refazer', onclick: redo }, icon('redo', 20));
    ed.pres = h('span', { class: 'ed-pres', hidden: true });
    ed.chatBtn = h('button', { type: 'button', class: 'icon-btn chat-btn', 'aria-label': 'Comentários', onclick: () => comentariosSheet(ed.id, atualizaChat) }, icon('chat', 20), h('i', { class: 'badge', hidden: true }));
    ed.holder = h('div', { class: 'ed-holder' });
    ed.scroller = h('div', { class: 'ed-scroll' }, ed.holder);
    ed.warn = h('div', { class: 'ed-warn', hidden: true }, icon('alert', 18), h('span', {}, 'O texto passa da página.'),
      h('button', { type: 'button', class: 'btn small', onclick: encaixar }, 'Encaixar'), h('button', { type: 'button', class: 'btn small', onclick: dividir }, 'Dividir'));
    ed.panelEl = h('div', { class: 'ed-panel', hidden: true });
    ed.bar = h('footer', { class: 'ed-bar' });
    ed.file = h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true, onchange: onFiles });
    ed.fileOne = h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: onFileOne });
    ed.cam = h('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true, onchange: onFiles });
    ed.root = h('div', { class: 'ed' },
      h('header', { class: 'ed-top' },
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Voltar para a revista', onclick: () => { Views.revTab = 'edicao'; location.hash = '#/revista'; } }, icon('left')),
        ed.ttl, ed.pres, ed.status, ed.chatBtn, ed.undoBtn, ed.redoBtn,
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Opções da página', onclick: menuSheet }, icon('more', 20))),
      ed.scroller, ed.warn, ed.panelEl, ed.bar, ed.file, ed.fileOne, ed.cam);

    ed.scroller.addEventListener('pointerdown', stageDown);
    ed.scroller.addEventListener('wheel', e => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); zoomBy(e.deltaY < 0 ? 1.1 : 1 / 1.1); } }, { passive: false });
    ed.scroller.addEventListener('touchstart', touchStart, { passive: false });
    ed.scroller.addEventListener('touchmove', touchMove, { passive: false });
    ed.scroller.addEventListener('touchend', touchEnd);
    ed.scroller.addEventListener('touchcancel', touchEnd);
    ed.scroller.addEventListener('dragover', e => { if (e.dataTransfer?.types?.includes('Files')) e.preventDefault(); });
    ed.scroller.addEventListener('drop', e => { if (e.dataTransfer?.files?.length) { e.preventDefault(); addFiles([...e.dataTransfer.files]); } });
    const onPaste = e => {                                       // colar imagem da área de transferência
      if (!ed || $('#sheet').open) return;
      const fs = [...(e.clipboardData?.files || [])].filter(f => /^image\//.test(f.type));
      if (fs.length) { e.preventDefault(); e.stopPropagation(); addFiles(fs); }
    };
    document.addEventListener('paste', onPaste, true);
    ed.root.addEventListener('focusin', focusin);
    document.addEventListener('keydown', keydown);
    Rte.onSel = refreshTb;
    Store.onError = () => ed && setStatus('err', 'Não salvou (espaço cheio)');
    const vv = window.visualViewport;
    const fit = () => { if (!vv || !ed) return; ed.root.style.height = vv.height + 'px'; ed.root.style.transform = `translateY(${vv.offsetTop}px)`; };
    vv?.addEventListener('resize', fit); vv?.addEventListener('scroll', fit);
    ed.cleanup = () => { clearInterval(ed.tVer); clearInterval(ed.tPres); document.removeEventListener('paste', onPaste, true); document.removeEventListener('keydown', keydown); vv?.removeEventListener('resize', fit); vv?.removeEventListener('scroll', fit); Rte.onSel = null; Store.onError = null; };

    ed.tVer = setInterval(() => { if (ed) { syncFromDom(); snapshotPagina(clone(ed.d), 'Automático'); } }, 8 * 60000);
    ed.tPres = setInterval(presenca, 20000);
    document.body.classList.add('editing');
    buildPage(); updateUndo(); atualizaChat(); presenca();
    return ed.root;
  }

  function close() {
    if (!ed) return;
    clearTimeout(ed.tHist); clearTimeout(ed.tSave);
    if (!ed.deleted) {
      syncFromDom();
      const d = ed.d, vazio = !d.titulo && !(d.html || '').replace(/<[^>]*>/g, '').trim() && !d.objs.length;
      if (d.novo && vazio) Store.remove('paginas', ed.id, { silent: true });
      else { delete d.novo; Store.upsert('paginas', clone(d), { silent: true }); snapshotPagina(clone(d), 'Ao fechar'); }
    }
    ed.cleanup();
    document.body.classList.remove('editing');
    ed = null;
  }

  return { open, close, get id() { return ed?.id; } };
})();
