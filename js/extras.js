/* Velocidade de criação: modelos de página, planejar edição, paleta de comandos, biblioteca de mídia,
   paleta da marca, miniaturas. */

/* ───────────── miniaturas ───────────── */
function miniPage(p) {
  const fs = folhas(), k = fs.findIndex(x => x.p && x.p.id === p.id);
  const f = k >= 0 ? fs[k] : { tipo: 'pagina', p, sec: FIXAS.includes(p.tpl) ? null : secoes().find(s => s.id === p.secao) || null, n: 1 };
  return h('div', { class: 'thumb', 'aria-hidden': 'true' }, pageEl(f, fs, false));
}

/* ───────────── imagem de exemplo (placeholder) ───────────── */
function placeholderRef() {
  const svg = "<svg xmlns='http://www.w3.org/2000/svg' width='800' height='600'><rect width='800' height='600' fill='#d9d6cc'/>" +
    "<g fill='none' stroke='#8d897d' stroke-width='14' stroke-linecap='round' stroke-linejoin='round'><rect x='260' y='200' width='280' height='200' rx='16'/>" +
    "<circle cx='340' cy='270' r='22'/><path d='M270 380l90-80 70 60 50-40 60 60'/></g></svg>";
  const s = Store.get(); s.midia ||= {};
  if (!s.midia.ph) s.midia.ph = 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  return 'img:ph';
}

/* ───────────── modelos de página ───────────── */
const LOREM = 'Escreva aqui o texto da matéria. Conte o que aconteceu, quem participou e por que isso importa para o leitor.';
const LOREM2 = 'Use parágrafos curtos, frases diretas e, se ajudar, destaque trechos importantes em negrito.';
const MODELOS = [
  { id: 'materia', nome: 'Matéria clássica', build: () => ({ tpl: 'materia', titulo: 'Título da matéria', colunas: 1,
    html: `<p class="st-lead">Resumo em uma ou duas frases que prendam o leitor.</p><p>${LOREM}</p><p>${LOREM2}</p>`,
    objs: [{ tipo: 'img', src: placeholderRef(), pos: 'topo', tam: 'm', forma: 'ret', legenda: '', ph: true }] }) },
  { id: 'destaque', nome: 'Foto grande', build: () => ({ tpl: 'destaque', titulo: 'Título em destaque', colunas: 1,
    html: '<p>Uma frase de apoio curta sobre a foto.</p>',
    objs: [{ tipo: 'img', src: placeholderRef(), pos: 'fundo', tam: 'g', forma: 'ret', legenda: '', ph: true }] }) },
  { id: 'colunas', nome: 'Duas colunas', build: () => ({ tpl: 'materia', titulo: 'Título da matéria', colunas: 2,
    html: `<p class="st-lead">Resumo da matéria.</p><p>${LOREM}</p><p>${LOREM2}</p><p>${LOREM}</p><p>${LOREM2}</p>`,
    objs: [{ tipo: 'img', src: placeholderRef(), pos: 'topo', tam: 'p', forma: 'ret', legenda: '', ph: true }] }) },
  { id: 'galeria', nome: 'Galeria de 4 fotos', build: () => ({ tpl: 'materia', titulo: 'Título da galeria', colunas: 1,
    html: '<p>Introdução curta da galeria.</p>',
    objs: [[6, 48], [52, 48], [6, 74], [52, 74]].map(([x, y]) => ({ tipo: 'img', src: placeholderRef(), pos: 'livre', tam: 'm', forma: 'ret', legenda: '', ph: true, x, y, w: 42, h: 22.2, rot: 0, atras: false })) }) },
  { id: 'entrevista', nome: 'Entrevista', build: () => ({ tpl: 'materia', titulo: 'Entrevista', colunas: 1,
    html: `<blockquote>“Uma frase marcante do entrevistado.”</blockquote><p><b>Primeira pergunta?</b></p><p>${LOREM}</p><p><b>Segunda pergunta?</b></p><p>${LOREM2}</p>`,
    objs: [{ tipo: 'img', src: placeholderRef(), pos: 'esquerda', tam: 'm', forma: 'circ', legenda: '', ph: true }] }) },
  { id: 'top5', nome: 'Top 5', build: () => ({ tpl: 'lista', titulo: 'Top 5', colunas: 1,
    html: '<ol><li>Primeiro item</li><li>Segundo item</li><li>Terceiro item</li><li>Quarto item</li><li>Quinto item</li></ol>', objs: [] }) },
  { id: 'citacao', nome: 'Citação', build: () => ({ tpl: 'materia', titulo: 'Citação', colunas: 1, html: '',
    objs: [{ tipo: 'texto', html: '<h2 style="text-align:center">“Uma frase forte para esta página.”</h2><p style="text-align:center">— Autor</p>', pos: 'livre', x: 8, y: 34, w: 84, h: 28, rot: 0, atras: false, fundo: 'sec' }] }) },
  { id: 'agenda', nome: 'Agenda de eventos', build: () => {
    const ev = (Store.get().eventos || []).filter(e => e.data >= today()).sort((a, b) => (a.data + a.hora).localeCompare(b.data + b.hora)).slice(0, 8);
    return { tpl: 'materia', titulo: 'Agenda', colunas: 1, objs: [],
      html: ev.length ? ev.map(e => `<p><b>${esc(fmtShort(e.data))}${e.hora ? ' · ' + esc(e.hora) : ''}</b> — ${esc(e.titulo)}</p>`).join('') : '<p>Marque eventos na aba Agenda e eles aparecem aqui.</p>' };
  } },
  { id: 'anuncio', nome: 'Anúncio', build: () => ({ tpl: 'anuncio', titulo: 'Seu anúncio aqui', colunas: 1,
    html: '<p style="text-align:center">Texto curto do anúncio.</p>',
    objs: [{ tipo: 'img', src: placeholderRef(), pos: 'fundo', tam: 'g', forma: 'ret', legenda: '', ph: true }] }) },
  { id: 'branco', nome: 'Em branco', build: () => ({ tpl: 'materia', titulo: '', colunas: 1, html: '', objs: [] }) },
];

function criarPagina(modelo, defaults = {}) {
  const base = modelo.build();
  const p = { id: Store.uid(), secao: '', status: 'rascunho', novo: true, ...base, ...defaults };
  Store.upsert('paginas', p, { silent: true });
  abrirPagina(p);
}

/* Galeria de modelos ao criar uma página */
function escolherModelo(defaults = {}) {
  const sec = secoes().find(s => s.id === defaults.secao);
  const cards = MODELOS.map(m => {
    const b = m.build(), pagina = { id: 'mini-' + m.id, ...b, secao: defaults.secao || '', status: 'rascunho' };
    return h('button', { class: 'tpl-card', type: 'button', onclick: () => { closeSheet(); criarPagina(m, defaults); } },
      miniPage(pagina), h('span', {}, m.nome));
  });
  openSheet('Nova página' + (sec ? ` · ${sec.nome}` : ''), h('div', {},
    h('p', { class: 'muted hint' }, 'Escolha um modelo para começar. Dá para mudar tudo depois.'),
    h('div', { class: 'tpl-grid' }, cards)));
}

/* ───────────── planejar edição ───────────── */
function planejarEdicao() {
  const S = Store.get(), contagens = {};
  const linhas = secoes().map(s => {
    const inp = h('input', { class: 'input sm', type: 'number', min: '0', max: '8', value: '2', 'data-sec': s.id, onchange: e => { contagens[s.id] = Number(e.target.value) || 0; } });
    contagens[s.id] = 2;
    return h('label', { class: 'plan-row', style: `--sec:${s.cor}` }, h('span', { class: 'dot' }), h('span', { class: 'grow' }, s.nome), inp);
  });
  const faltam = ['capa', 'sumario', 'contracapa'].filter(t => !Store.paginasEd().some(p => p.tpl === t));
  const chk = (id, txt, on = true) => h('label', { class: 'check' }, h('input', { type: 'checkbox', id, checked: on }), txt);
  const prazo = new Date(); prazo.setDate(prazo.getDate() + 14);
  const f = h('form', { class: 'form', onsubmit: e => {
    e.preventDefault();
    const q = id => !!f.querySelector('#' + id)?.checked, data = f.elements.prazo.value;
    let nPag = 0, nCards = 0;
    const novaP = (m, extra) => { const p = { id: Store.uid(), secao: '', status: 'rascunho', ...m.build(), ...extra }; Store.upsert('paginas', p, { silent: true }); nPag++; return p; };
    const card = (p, setor) => {
      const c = {
        id: Store.uid(),
        titulo: 'Página: ' + (p.titulo || 'sem título'),
        setor,
        col: 'todo',
        prazo: data || '',
        resp: '',
        desc: '',
        paginaId: p.id,
        criador: (typeof autorAtual === 'function' ? autorAtual() : '') || 'Planejamento',
        criadoEm: Date.now(),
      };
      p.cardId = c.id;
      Store.upsert('cards', c, { silent: true });
      nCards++;
    };
    if (q('abre')) {
      if (faltam.includes('capa')) novaP({ build: () => ({ tpl: 'capa', titulo: nomeEdicao(Store.edicaoAtual()), html: `<p>${esc(Store.get().marca?.slogan || 'A revista da nossa empresa')}</p>`, objs: [], colunas: 1 }) });
      if (faltam.includes('sumario')) novaP({ build: () => ({ tpl: 'sumario', titulo: 'Nesta edição', html: '', objs: [], colunas: 1 }) });
      if (faltam.includes('contracapa')) novaP({ build: () => ({ tpl: 'contracapa', titulo: 'Até a próxima', html: '<p>Obrigado por ler.</p>', objs: [], colunas: 1 }) });
    }
    for (const s of secoes()) {
      for (let i = 0; i < (contagens[s.id] || 0); i++) {
        const p = novaP(MODELOS[0], { secao: s.id, titulo: `${s.nome} — página ${i + 1}` });
        if (q('tarefas') && setoresPermitidos().some(x => x.id === s.id)) card(p, s.id);   // só cria tarefa em setor que a pessoa enxerga
      }
    }
    if (q('agenda') && data) Store.upsert('eventos', { id: Store.uid(), titulo: 'Fechamento da edição', data, hora: '', tipo: 'prazo', setor: '' }, { silent: true });
    Store.touch();
    closeSheet(); toast(`${nPag} página(s)${nCards ? ` e ${nCards} tarefa(s)` : ''} criadas`);
  } },
    h('p', { class: 'muted hint' }, 'Gera os rascunhos da edição por seção e, se quiser, uma tarefa no Quadro para cada página (já ligada à página).'),
    h('div', { class: 'plan' }, linhas),
    faltam.length ? chk('abre', `Criar também: ${faltam.map(t => ({ capa: 'capa', sumario: 'sumário', contracapa: 'contracapa' }[t])).join(', ')}`) : null,
    chk('tarefas', 'Criar uma tarefa no Quadro para cada página'),
    field('Fechamento da edição', input('prazo', isoDate(prazo), { type: 'date' })),
    chk('agenda', 'Marcar o fechamento na Agenda'),
    h('div', { class: 'actions' }, h('button', { type: 'submit', class: 'btn primary' }, 'Criar edição')));
  openSheet('Planejar edição', f);
}

/* ───────────── biblioteca de mídia ───────────── */
function bibliotecaSheet(onPick) {
  const S = Store.get(), m = S.midia || {};
  const usadas = new Set(S.paginas.flatMap(p => objetosDe(p).filter(o => o.tipo !== 'texto').map(o => o.src)));
  const ids = Object.keys(m).filter(k => k !== 'ph');
  const limpar = () => { let n = 0; for (const k of ids) if (!usadas.has('img:' + k)) { delete m[k]; n++; } Store.touch(); closeSheet(); toast(n ? `${n} imagem(ns) não usada(s) removida(s)` : 'Nada para limpar'); };
  openSheet('Biblioteca de imagens', h('div', {},
    h('p', { class: 'muted hint' }, onPick ? 'Toque numa imagem para usá-la nesta página (sem duplicar o arquivo).' : 'Todas as imagens enviadas para a revista ficam aqui.'),
    ids.length ? h('div', { class: 'lib-grid' }, ids.map(k => h('button', { type: 'button', class: 'lib-th', onclick: () => { if (onPick) { closeSheet(); onPick('img:' + k); } } },
      h('img', { src: m[k], alt: '' }), usadas.has('img:' + k) && h('i', { class: 'lib-used', title: 'Em uso' }, '✓'))))
      : h('p', { class: 'empty' }, 'Nenhuma imagem ainda.'),
    ids.length ? h('button', { type: 'button', class: 'btn small', onclick: limpar }, 'Limpar imagens não usadas') : null));
}

/* ───────────── paleta da marca ───────────── */
const PALETA_PADRAO = ['#1C1C1A', '#FFFFFF', '#6B6B66', '#4D7C0F', '#2563EB', '#C2410C', '#9333EA', '#0E7490', '#BE123C', '#A16207', '#DB2777'];
const paletaMarca = () => Store.get().marca?.cores || PALETA_PADRAO;
function escolherCor(onPick) {
  const input = h('input', { type: 'color', class: 'cor-custom', value: '#1c1c1a', 'aria-label': 'Outra cor', onchange: e => { closeSheet(); onPick(e.target.value); } });
  openSheet('Cor do texto', h('div', {},
    h('div', { class: 'swatches big' }, paletaMarca().map(c => h('button', { type: 'button', class: 'sw', style: `--c:${c}`, 'aria-label': c, onclick: () => { closeSheet(); onPick(c); } }))),
    field('Outra cor', input)));
}
function marcaSheet() {
  const m = Store.get().marca ||= { cores: [...PALETA_PADRAO] };
  const draw = () => openSheet('Cores da marca', h('div', {},
    h('p', { class: 'muted hint' }, 'Estas cores aparecem ao escolher a cor do texto. Toque numa cor para trocar.'),
    h('div', { class: 'swatches big' }, m.cores.map((c, i) => h('label', { class: 'sw edit', style: `--c:${c}` },
      h('input', { type: 'color', value: c, onchange: e => { m.cores[i] = e.target.value; Store.touchMeta('marca'); draw(); } })))),
    h('div', { class: 'row-btn' },
      h('button', { type: 'button', class: 'btn small', onclick: () => { m.cores.push('#888888'); draw(); } }, 'Adicionar cor'),
      h('button', { type: 'button', class: 'btn small', onclick: () => { m.cores = [...PALETA_PADRAO]; draw(); } }, 'Restaurar padrão'))));
  draw();
}

/* ───────────── paleta de comandos (Ctrl+K) ───────────── */
function abrirPaleta() {
  const S = Store.get();
  const irPara = (hash) => () => { location.hash = hash; };
  const base = [
    ['Ir para Início', irPara('#/inicio')], ['Ir para Quadro', irPara('#/quadro')], ['Ir para Agenda', irPara('#/agenda')], ['Ir para Revista', irPara('#/revista')],
    ['Nova tarefa', () => cardSheet(null)], ['Novo evento', () => eventSheet(null)],
    ['Nova página…', () => escolherModelo({})], ['Planejar edição…', planejarEdicao], ['Verificar edição antes de imprimir', () => window.verificarEdicao?.()],
    ['Exportar revista (PDF)…', () => window.exportarSheet?.()], ['Apresentar revista', () => window.apresentar?.()], ['Identidade da marca…', identidadeSheet], ['Cores do texto', marcaSheet], ['Ir para Edições', irPara('#/edicoes')], ['Nova edição…', novaEdicaoSheet],
    ...secoes().map(s => [`Nova página em ${s.nome}…`, () => escolherModelo({ secao: s.id })]),
    ...Store.paginasEd().map(p => [`Abrir página: ${p.titulo || '(sem título)'}`, () => abrirPagina(p)]),
    ...S.cards.map(c => [`Abrir tarefa: ${c.titulo}`, () => cardSheet(c)]),
  ];
  const lista = h('ul', { class: 'list pal' });
  const busca = h('input', { class: 'input', type: 'search', placeholder: 'Digite um comando, página ou tarefa…', autocomplete: 'off', 'aria-label': 'Buscar comando' });
  const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const draw = () => {
    const q = norm(busca.value.trim()), achados = base.filter(([n]) => !q || q.split(/\s+/).every(w => norm(n).includes(w))).slice(0, 30);
    lista.replaceChildren(...(achados.length ? achados.map(([n, fn]) => h('li', {}, h('button', { class: 'item', onclick: () => { closeSheet(); setTimeout(fn, 30); } }, h('span', { class: 'grow' }, h('b', {}, n)))))
      : [h('li', { class: 'empty' }, 'Nada encontrado')]));
  };
  busca.addEventListener('input', draw);
  busca.addEventListener('keydown', e => { if (e.key === 'Enter') lista.querySelector('button')?.click(); });
  draw();
  openSheet('Buscar e comandos', h('div', {}, busca, lista));
  setTimeout(() => busca.focus(), 60);
}
document.addEventListener('keydown', e => {
  const t = e.target, typing = t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName);
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); if (Store.get()) abrirPaleta(); }
  else if (e.key === '/' && !typing && !$('#sheet').open && Store.get()) { e.preventDefault(); abrirPaleta(); }
});
