/* Qualidade e entrega: verificador de pré-impressão, exportar PDF (escopo, sangria, marcas de corte),
   apresentação em tela cheia e HTML de leitura (arquivo único para compartilhar). */

/* ───────────── verificador ───────────── */
const A5_IN = 148 / 25.4;                                   // largura da folha em polegadas
function larguraEmPolegadas(o) {
  if (o.pos === 'livre') return (o.w / 100) * A5_IN;
  const f = { esquerda: { p: .26, m: .38, g: .5 }, direita: { p: .26, m: .38, g: .5 }, acima: { p: .4, m: .7, g: 1 }, abaixo: { p: .4, m: .7, g: 1 } }[o.pos];
  return A5_IN * (f ? f[o.tam] ?? .5 : 1);
}
const dimsDaImagem = src => new Promise(res => { const im = new Image(); im.onload = () => res(im.naturalWidth); im.onerror = () => res(0); im.src = src; });

/* mede, fora da tela, quais páginas têm texto maior que a folha */
function medirExcesso(fs) {
  const box = h('div', { style: 'position:fixed;left:-9999px;top:0;width:360px;visibility:hidden;pointer-events:none' });
  document.body.append(box);
  const res = {};
  for (const f of fs) if (f.tipo === 'pagina') { const el = pageEl(f, fs, false); box.replaceChildren(el); res[f.p.id] = excedePagina(el); }
  box.remove();
  return res;
}

async function analisarEdicao() {
  const S = Store.get(), fs = folhas(), problemas = [];
  const add = (nivel, p, texto) => problemas.push({ nivel, p, texto });
  const excesso = medirExcesso(fs);
  const paginas = fs.filter(f => f.tipo === 'pagina');
  if (!paginas.some(f => f.p.tpl === 'capa')) add('erro', null, 'A revista não tem capa.');
  if (!paginas.some(f => f.p.tpl === 'contracapa')) add('aviso', null, 'A revista não tem contracapa.');
  if (!paginas.some(f => f.p.tpl === 'sumario')) add('aviso', null, 'A revista não tem sumário.');
  for (const s of secoes()) if (!paginas.some(f => f.p.secao === s.id && !FIXAS.includes(f.p.tpl))) add('aviso', null, `A seção ${s.nome} está vazia.`);
  for (const f of paginas) {
    const p = f.p, objs = objetosDe(p), nome = `Pág. ${f.n}`;
    const textoVazio = !(conteudo(p) || '').replace(/<[^>]*>/g, '').trim();
    if (excesso[p.id]) add('erro', p, `${nome}: o texto passa da folha e seria cortado na impressão.`);
    if (!FIXAS.includes(p.tpl) && !p.titulo?.trim()) add('aviso', p, `${nome}: sem título.`);
    if (!FIXAS.includes(p.tpl) && textoVazio && !objs.length) add('erro', p, `${nome}: página vazia.`);
    if (p.status && p.status !== 'pronta' && !FIXAS.includes(p.tpl)) add('info', p, `${nome}: ainda está em "${STATUS.find(x => x[0] === p.status)?.[1] || p.status}".`);
    for (const [i, o] of objs.entries()) {
      if (o.tipo === 'texto') {
        if (o.x < 3 || o.y < 3 || o.x + o.w > 97) add('aviso', p, `${nome}: uma caixa de texto está muito perto da borda (pode ser cortada).`);
        continue;
      }
      if (o.ph || o.src === 'img:ph') { add('erro', p, `${nome}: a imagem ${i + 1} ainda é um exemplo (troque pela foto real).`); continue; }
      const nat = await dimsDaImagem(srcDe(o));
      if (nat) {
        const dpi = Math.round(nat / (larguraEmPolegadas(o) * (o.cz || 1)));
        if (dpi < 100) add('erro', p, `${nome}: imagem ${i + 1} com resolução muito baixa (~${dpi} dpi).`);
        else if (dpi < 150) add('aviso', p, `${nome}: imagem ${i + 1} com baixa resolução (~${dpi} dpi).`);
      }
      if (!o.alt && !o.legenda) add('info', p, `${nome}: imagem ${i + 1} sem texto alternativo ou legenda.`);
      if (o.pos === 'livre' && (o.x < 0 || o.y < 0 || o.x + o.w > 100 || o.y + o.h > 100) && o.atras !== true) add('info', p, `${nome}: imagem ${i + 1} sai da página (parte será cortada).`);
    }
  }
  for (const extra of window.__checksExtras || []) extra(add, fs);
  const ordem = { erro: 0, aviso: 1, info: 2 };
  problemas.sort((a, b) => ordem[a.nivel] - ordem[b.nivel]);
  return problemas;
}

async function verificarEdicao(depois) {
  openSheet('Verificar edição', h('p', { class: 'muted' }, 'Verificando a revista…'));
  const probs = await analisarEdicao();
  const c = n => probs.filter(p => p.nivel === n).length;
  const icone = { erro: 'alert', aviso: 'alert', info: 'check2' };
  const lista = probs.length ? h('ul', { class: 'list check-list' }, probs.map(pr => h('li', {}, h('button', { class: 'item prob ' + pr.nivel, onclick: () => { closeSheet(); if (pr.p) abrirPagina(pr.p); } },
    h('span', { class: 'prob-ic' }, icon(icone[pr.nivel], 18)), h('span', { class: 'grow' }, h('b', {}, pr.texto)))))) : h('p', { class: 'empty ok' }, 'Tudo certo! Nenhum problema encontrado.');
  openSheet('Verificar edição', h('div', {},
    h('div', { class: 'prob-resumo' },
      h('span', { class: 'chip-prob erro' }, `${c('erro')} erro(s)`), h('span', { class: 'chip-prob aviso' }, `${c('aviso')} aviso(s)`), h('span', { class: 'chip-prob info' }, `${c('info')} dica(s)`)),
    lista,
    h('div', { class: 'row-btn' },
      h('button', { class: 'btn small', onclick: () => verificarEdicao(depois) }, 'Verificar de novo'),
      depois && h('button', { class: 'btn primary small', onclick: () => { closeSheet(); depois(); } }, c('erro') ? 'Exportar mesmo assim' : 'Continuar'))));
  return probs;
}

/* ───────────── exportar PDF / impressão ───────────── */
function exportarSheet() {
  const fs = folhas(), total = fs.length;
  const f = h('form', { class: 'form', onsubmit: e => { e.preventDefault(); fazer(false); } },
    field('O que exportar', selectEl('escopo', [['todas', 'A revista inteira'], ...secoes().map(s => ['sec:' + s.id, 'Só a seção ' + s.nome]), ['intervalo', 'Intervalo de páginas']], 'todas')),
    h('div', { class: 'row', id: 'intervalo', hidden: true }, field('De', input('de', '1', { type: 'number', min: '1', max: String(total) })), field('Até', input('ate', String(total), { type: 'number', min: '1', max: String(total) }))),
    h('label', { class: 'check' }, h('input', { type: 'checkbox', name: 'sangria' }), 'Sangria de 3 mm e marcas de corte (para gráfica)'),
    h('label', { class: 'check' }, h('input', { type: 'checkbox', name: 'verificar', checked: true }), 'Verificar a edição antes de exportar'),
    h('div', { class: 'actions col' },
      h('button', { type: 'submit', class: 'btn primary' }, icon('print', 18), 'Imprimir / salvar em PDF'),
      h('button', { type: 'button', class: 'btn', onclick: () => fazer(true) }, icon('file', 18), 'Baixar HTML de leitura'),
      h('button', { type: 'button', class: 'btn ghost', onclick: () => { closeSheet(); apresentar(); } }, icon('present', 18), 'Apresentar em tela cheia')));
  f.elements.escopo.addEventListener('change', () => { f.querySelector('#intervalo').hidden = f.elements.escopo.value !== 'intervalo'; });
  function fazer(html) {
    const d = Object.fromEntries(new FormData(f)), opts = { escopo: d.escopo, de: Number(d.de), ate: Number(d.ate), sangria: !!d.sangria };
    const go = () => (html ? baixarHTML() : imprimir(opts));
    if (d.verificar && !html) { verificarEdicao(go); return; }
    closeSheet(); go();
  }
  openSheet('Exportar revista', f);
}

function imprimir(opts = { escopo: 'todas' }) {
  const fs = folhas();
  let sel = fs;
  if (opts.escopo?.startsWith('sec:')) { const id = opts.escopo.slice(4); sel = fs.filter(x => x.sec && x.sec.id === id); }
  else if (opts.escopo === 'intervalo') sel = fs.filter(x => x.n >= (opts.de || 1) && x.n <= (opts.ate || fs.length));
  if (!sel.length) return toast('Nenhuma página nesse intervalo');
  const marcas = ['tl', 'tr', 'bl', 'br'].flatMap(c => [h('i', { class: `mk mk-${c}-h` }), h('i', { class: `mk mk-${c}-v` })]);
  $('#print-root').replaceChildren(...sel.map(f => h('div', { class: 'print-sheet' + (opts.sangria ? ' bleed' : '') }, pageEl(f, fs, false), opts.sangria ? marcas.map(m => m.cloneNode()) : null)));
  document.getElementById('print-style')?.remove();
  document.head.append(h('style', { id: 'print-style' }, `@page { size: ${opts.sangria ? '160mm 222mm' : 'A5 portrait'}; margin: 0; }`));
  const limpar = () => { $('#print-root').replaceChildren(); document.getElementById('print-style')?.remove(); removeEventListener('afterprint', limpar); };
  addEventListener('afterprint', limpar);
  setTimeout(() => window.print(), 80);
}

/* ───────────── HTML de leitura (arquivo único) ───────────── */
function htmlLeitura(edId, publico = false) {
  const S = Store.get(), fs = folhas(edId), nome = S.empresa.nome, ed = S.edicoes.find(e => e.id === edId);
  const css = [...document.styleSheets].map(sh => { try { return [...sh.cssRules].map(r => r.cssText).join('\n'); } catch { return ''; } }).join('\n');
  const paginas = fs.map(f => pageEl(f, fs, false).outerHTML).join('\n');
  const titulo = ed ? `${nome} — ${nomeEdicao(ed)}` : nome;
  const doc = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(titulo)}</title>
<link href="${fontesHref()}" rel="stylesheet">
<style>${css}
body{padding:0}.lh{padding:18px 16px 4px;font:700 1.4rem var(--serif);display:flex;align-items:center;gap:10px}.lh small{display:block;font:500 .8rem var(--sans);color:var(--muted)}
.reader{margin:0!important;padding:16px!important}</style></head>
<body><div class="lh">${marcaLogoHTML(30)}<span>${esc(nome)}${ed ? ` · ${esc(nomeEdicao(ed))}` : ''}<small>Deslize para folhear · use as setas do teclado</small></span></div>
<main class="reader" id="r">${paginas}</main>
<script>const r=document.getElementById('r');addEventListener('keydown',e=>{if(e.key==='ArrowRight')r.scrollBy({left:r.clientWidth*.8,behavior:'smooth'});if(e.key==='ArrowLeft')r.scrollBy({left:-r.clientWidth*.8,behavior:'smooth'})});<\/script></body></html>`;
  if (!publico) return doc;
  let out = doc;                                                  // público: imagens vêm do servidor (/api/pm), não embutidas
  for (const [id, data] of Object.entries(S.midia || {})) if (id !== 'ph' && out.includes(data)) out = out.split(data).join('/api/pm/' + id);
  return out;
}
function baixarHTML(edId = Store.get().edicaoAtiva) {
  const ed = Store.get().edicoes.find(e => e.id === edId);
  const a = h('a', { href: URL.createObjectURL(new Blob([htmlLeitura(edId)], { type: 'text/html' })), download: `revista-edicao-${ed?.numero ?? ''}-${today()}.html` });
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  toast('HTML de leitura baixado — é um arquivo único, pode enviar por e-mail ou hospedar');
}

/* ───────────── apresentação em tela cheia ───────────── */
function apresentar(inicio = 0, edId) {
  const fs = folhas(edId); if (!fs.length) return toast('Crie páginas primeiro');
  let dupla = innerWidth > innerHeight * 1.15, idx = Math.min(inicio, fs.length - 1);
  const unidades = () => { const u = []; if (dupla) { u.push([0]); for (let i = 1; i < fs.length; i += 2) u.push(i + 1 < fs.length ? [i, i + 1] : [i]); } else fs.forEach((_, i) => u.push([i])); return u; };
  const stage = h('div', { class: 'pres-stage' }), info = h('span', { class: 'pres-info' });
  const root = h('div', { class: 'pres', role: 'dialog', 'aria-label': 'Apresentação da revista' },
    h('button', { class: 'pres-x icon-btn', 'aria-label': 'Sair da apresentação', onclick: sair }, icon('x')), stage,
    h('button', { class: 'pres-nav prev', 'aria-label': 'Página anterior', onclick: () => ir(-1) }, icon('left', 28)),
    h('button', { class: 'pres-nav next', 'aria-label': 'Próxima página', onclick: () => ir(1) }, icon('right', 28)),
    h('div', { class: 'pres-bar' }, info, h('button', { class: 'chip', onclick: () => { const pagina = u[idx][0]; dupla = !dupla; idx = Math.max(0, unidades().findIndex(un => un.includes(pagina))); desenha(0); } }, 'Alternar página dupla')));
  let u = unidades();
  function desenha(dir) {
    u = unidades(); idx = clamp(idx, 0, u.length - 1);
    const un = u[idx];
    stage.className = 'pres-stage' + (dupla ? ' dupla' : '') + (dir ? (dir > 0 ? ' in-next' : ' in-prev') : '');
    stage.replaceChildren(...un.map(i => pageEl(fs[i], fs, false)));
    info.textContent = un.length === 1 ? `Página ${un[0] + 1} de ${fs.length}` : `Páginas ${un[0] + 1}–${un[1] + 1} de ${fs.length}`;
  }
  const ir = d => { const n = clamp(idx + d, 0, u.length - 1); if (n !== idx) { idx = n; desenha(d); } };
  const tecla = e => { if (e.key === 'Escape') sair(); else if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') { e.preventDefault(); ir(1); } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); ir(-1); } };
  let x0 = null;
  root.addEventListener('pointerdown', e => { x0 = e.clientX; });
  root.addEventListener('pointerup', e => { if (x0 != null && Math.abs(e.clientX - x0) > 50) ir(e.clientX < x0 ? 1 : -1); x0 = null; });
  function sair() { removeEventListener('keydown', tecla, true); root.remove(); if (document.fullscreenElement) document.exitFullscreen?.(); }
  addEventListener('keydown', tecla, true);
  document.body.append(root); desenha(0);
  root.requestFullscreen?.().catch(() => {});
}
