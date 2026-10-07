/* Telas: Início, Quadro, Agenda (calendário) e Revista. */
const fab = (label, onclick) => h('button', { class: 'fab', 'aria-label': label, onclick }, icon('plus', 26));
const chipSetor = s => h('span', { class: 'tag', style: `--c:${s.cor}` }, s.nome);

/* ───────────── Sheets de edição ───────────── */
/* Exclui na hora e oferece "Desfazer" no aviso */
function excluir(kind, id, rotulo) {
  const r = Store.remove(kind, id);
  if (r) toast(`${rotulo} excluído`, { label: 'Desfazer', fn: () => Store.restore(kind, r.item, r.index) });
}


const PRIORIDADES = [['', 'Normal'], ['baixa', 'Baixa 🟢'], ['media', 'Média 🟡'], ['alta', 'Alta 🔴']];

function cardSheet(card, defaults = {}) {
  const S = Store.get(), novo = !card;
  const c = card || {
    id: Store.uid(),
    titulo: '',
    setor: (setoresPermitidos()[0] || S.setores[0]).id,
    col: 'todo',
    prazo: '',
    resp: '',
    desc: '',
    prioridade: '',
    link: '',
    esforco: '',
    checklist: [],
    historico: [],
    criador: (typeof autorAtual === 'function' ? autorAtual() : '') || 'Equipe',
    criadoEm: Date.now(),
    ...defaults,
  };

  const checklistState = Array.isArray(c.checklist) ? [...c.checklist.map(x => ({ ...x }))] : [];
  const checklistBox = h('div', { class: 'checklist-box' });

  const renderChecklist = () => {
    checklistBox.replaceChildren(
      h('div', { class: 'sec-head', style: 'margin-bottom:6px;' },
        h('span', { style: 'font-size:.8rem;font-weight:600;color:var(--muted);' }, 'Subtarefas / Checklist'),
        h('button', {
          type: 'button', class: 'link', onclick: () => {
            checklistState.push({ id: Store.uid(), texto: '', feito: false });
            renderChecklist();
          },
        }, '+ Item')
      ),
      checklistState.length
        ? h('div', { class: 'checklist-list' }, checklistState.map((item, idx) => h('div', { class: 'check-row' },
            h('input', {
              type: 'checkbox',
              checked: !!item.feito,
              onchange: e => { item.feito = e.target.checked; renderChecklist(); },
            }),
            h('input', {
              class: 'input check-input' + (item.feito ? ' check-done' : ''),
              value: item.texto,
              placeholder: 'Ex.: Pauta aprovada',
              oninput: e => { item.texto = e.target.value; },
            }),
            h('button', {
              type: 'button', class: 'icon-btn small', 'aria-label': 'Remover item',
              onclick: () => { checklistState.splice(idx, 1); renderChecklist(); },
            }, icon('x', 16))
          )))
        : h('p', { class: 'empty', style: 'padding:8px;font-size:.85rem;' }, 'Nenhuma subtarefa adicionada.')
    );
  };
  renderChecklist();

  const f = h('form', {
    class: 'form',
    onsubmit: e => {
      e.preventDefault();
      const dadosForm = Object.fromEntries(new FormData(f));
      const colNova = dadosForm.col;
      const hist = Array.isArray(c.historico) ? [...c.historico] : [];
      if (!novo && c.col && c.col !== colNova) {
        const nomeDe = Store.COLS.find(x => x.id === c.col)?.nome || c.col;
        const nomePara = Store.COLS.find(x => x.id === colNova)?.nome || colNova;
        hist.push({ de: nomeDe, para: nomePara, quando: Date.now(), por: (typeof autorAtual === 'function' ? autorAtual() : '') || 'Equipe' });
      }

      Store.upsert('cards', {
        ...c,
        ...dadosForm,
        checklist: checklistState.filter(it => it.texto && it.texto.trim()),
        historico: hist,
        criador: c.criador || (typeof autorAtual === 'function' ? autorAtual() : '') || 'Equipe',
        criadoEm: c.criadoEm || Date.now(),
      });
      closeSheet();
      toast(novo ? 'Cartão criado' : 'Cartão salvo');
    },
  },
    field('Título', input('titulo', c.titulo, { required: true, placeholder: 'Ex.: Escrever a matéria de capa' })),
    h('div', { class: 'row' },
      field('Setor', selectEl('setor', setoresPermitidos().map(s => [s.id, s.nome]), c.setor)),
      field('Coluna', selectEl('col', Store.COLS.map(x => [x.id, x.nome]), c.col))),
    h('div', { class: 'row' },
      field('Prioridade', selectEl('prioridade', PRIORIDADES, c.prioridade || '')),
      field('Estimativa de tempo', input('esforco', c.esforco || '', { placeholder: 'Ex.: 2h, 30 min' }))),
    h('div', { class: 'row' },
      field('Prazo', input('prazo', c.prazo, { type: 'date' })),
      field('Responsável', input('resp', c.resp))),
    field('Link externo / Fonte (Drive, doc, pesquisa)', input('link', c.link || '', { type: 'url', placeholder: 'https://...' })),
    field('Detalhes', textarea('desc', c.desc)),
    checklistBox,
    c.link ? h('a', { href: c.link, target: '_blank', rel: 'noopener noreferrer', class: 'btn small', style: 'align-self:flex-start;' }, icon('link2', 16), 'Abrir link externo') : null,
    (!novo && (c.criador || c.criadoEm)) ? h('p', { class: 'muted hint', style: 'margin:2px 0 4px;' },
      `Criado por ${c.criador || 'Alguém da equipe'}${c.criadoEm ? ' ' + (typeof quando === 'function' ? quando(c.criadoEm) : fmtShort(isoDate(new Date(c.criadoEm)))) : ''}`) : null,
    (!novo && Array.isArray(c.historico) && c.historico.length) ? h('div', { class: 'hist-box' },
      h('span', { style: 'font-size:.78rem;font-weight:600;color:var(--muted);' }, 'Histórico de movimentação'),
      h('ul', { class: 'plain', style: 'display:flex;flex-direction:column;gap:4px;margin-top:4px;' },
        c.historico.slice(-4).reverse().map(hItem => h('li', { style: 'font-size:.76rem;color:var(--muted);' },
          `• ${hItem.de} → ${hItem.para} (${(typeof quando === 'function' ? quando(hItem.quando) : '')} por ${hItem.por})`)))) : null,
    paginaDaTarefa(c) ? h('button', { type: 'button', class: 'btn small', onclick: () => { closeSheet(); abrirPagina(paginaDaTarefa(c)); } }, icon('book', 16), 'Abrir a página: ' + (paginaDaTarefa(c).titulo || 'sem título')) : null,
    actionsRow(novo ? null : () => { closeSheet(); excluir('cards', c.id, 'Cartão'); }));
  openSheet(novo ? 'Novo cartão' : 'Editar cartão', f);
}

const TIPOS = [['reuniao', 'Reunião'], ['prazo', 'Prazo'], ['evento', 'Evento'], ['producao', 'Produção']];
function eventSheet(ev, defaults = {}) {
  const S = Store.get(), novo = !ev;
  const e0 = ev || { id: Store.uid(), titulo: '', data: today(), hora: '', tipo: 'evento', setor: '', ...defaults };
  const f = h('form', {
    class: 'form',
    onsubmit: e => { e.preventDefault(); Store.upsert('eventos', { ...e0, ...Object.fromEntries(new FormData(f)) }); closeSheet(); toast(novo ? 'Evento criado' : 'Evento salvo'); },
  },
    field('Título', input('titulo', e0.titulo, { required: true, placeholder: 'Ex.: Reunião de pauta' })),
    h('div', { class: 'row' },
      field('Data', input('data', e0.data, { type: 'date', required: true })),
      field('Hora', input('hora', e0.hora, { type: 'time' }))),
    h('div', { class: 'row' },
      field('Tipo', selectEl('tipo', TIPOS, e0.tipo)),
      field('Setor', selectEl('setor', [['', 'Geral'], ...S.setores.map(s => [s.id, s.nome])], e0.setor))),
    actionsRow(novo ? null : () => { closeSheet(); excluir('eventos', e0.id, 'Evento'); }));
  openSheet(novo ? 'Novo evento' : 'Editar evento', f);
}

/* ───────────── Seções da revista ───────────── */
/* Estes 4 setores têm seção própria na revista (nesta ordem); o resto vive em "Capa e abertura". */
const SECOES_REV = ['Notícias Gerais', 'Pop', 'Moda', 'Geek'];
const secoes = () => SECOES_REV.map(n => Store.get().setores.find(s => s.nome === n)).filter(Boolean);
const TEMPLATES = [['capa', 'Capa'], ['sumario', 'Sumário'], ['materia', 'Matéria'], ['destaque', 'Destaque (foto grande)'],
  ['lista', 'Lista / Top'], ['anuncio', 'Anúncio'], ['contracapa', 'Contracapa']];
const STATUS = [['rascunho', 'Rascunho'], ['revisao', 'Em revisão'], ['pronta', 'Pronta']];
const FIXAS = ['capa', 'sumario', 'contracapa'];

/* Grupo de ordenação: capa, sumário, geral, [seções na ordem], contracapa */
function grupoDe(p) {
  if (p.tpl === 'capa') return 0;
  if (p.tpl === 'sumario') return 1;
  if (p.tpl === 'contracapa') return 99;
  const i = secoes().findIndex(s => s.id === p.secao);
  return i < 0 ? 2 : 3 + i;
}
const ordenadas = ed => Store.paginasEd(ed).map((p, i) => ({ p, i, g: grupoDe(p) })).sort((a, b) => a.g - b.g || a.i - b.i).map(x => x.p);

/* "Folhas" = o que realmente vai impresso: páginas + uma abertura automática no início de cada seção. */
function folhas(ed) {
  const out = []; let atual = null;
  for (const p of ordenadas(ed)) {
    const sec = FIXAS.includes(p.tpl) ? null : secoes().find(s => s.id === p.secao) || null;
    if (sec && sec !== atual) out.push({ tipo: 'secao', sec });
    atual = sec;
    out.push({ tipo: 'pagina', p, sec });
  }
  return out.map((f, i) => ({ ...f, n: i + 1 }));
}

/* Marca páginas cujo conteúdo (em fluxo) é maior que a folha; o excesso é cortado na impressão */
function excedePagina(pg) {
  const usado = [...pg.children].filter(c => getComputedStyle(c).position !== 'absolute').reduce((a, c) => a + c.getBoundingClientRect().height, 0);
  const q = pg.querySelector('.txt[data-q]');                         // quadro móvel: confere se passa da borda de baixo
  const passou = q && q.getBoundingClientRect().bottom > pg.getBoundingClientRect().bottom + 2;
  return usado > pg.clientHeight + 2 || !!passou;
}
function marcarExcesso(root, cb) {
  setTimeout(() => { root.querySelectorAll('.page').forEach(pg => pg.classList.toggle('overflow', excedePagina(pg))); cb?.(); }, 80);
}

function setoresSheet() {
  if (Sync.conectado() && Sync.cargo() !== 'admin') return toast('Só o administrador cria e edita setores');
  const draw = () => {
    const S = Store.get();
    let cor = Store.CORES[S.setores.length % Store.CORES.length];
    const swatches = h('div', { class: 'swatches', role: 'radiogroup', 'aria-label': 'Cor do setor' },
      Store.CORES.map(c => h('button', {
        type: 'button', role: 'radio', 'aria-checked': String(c === cor), 'aria-label': c, class: 'sw' + (c === cor ? ' on' : ''), style: `--c:${c}`,
        onclick: ev => { cor = c; swatches.querySelectorAll('.sw').forEach(b => { b.classList.remove('on'); b.setAttribute('aria-checked', 'false'); }); ev.currentTarget.classList.add('on'); ev.currentTarget.setAttribute('aria-checked', 'true'); },
      })));
    const f = h('form', {
      class: 'form inline',
      onsubmit: e => { e.preventDefault(); const nome = new FormData(f).get('nome').trim(); if (!nome) return; Store.upsert('setores', { id: Store.uid(), nome, cor }); draw(); },
    }, field('Novo setor', input('nome', '', { placeholder: 'Ex.: Fotografia', required: true })), swatches, h('button', { class: 'btn primary', type: 'submit' }, 'Adicionar setor'));
    const list = h('ul', { class: 'plain' }, S.setores.map(s => {
      const usos = S.cards.filter(c => c.setor === s.id).length;
      return h('li', { class: 'setor-row' }, chipSetor(s), h('span', { class: 'muted' }, `${usos} cartão(ões)`),
        h('button', {
          class: 'btn ghost small', type: 'button', disabled: S.setores.length <= 1,
          onclick: () => {
            if (usos && !confirm(`"${s.nome}" tem ${usos} cartão(ões). Eles ficarão sem setor. Excluir mesmo?`)) return;
            Store.remove('setores', s.id); draw();
          },
        }, 'Excluir'));
    }));
    openSheet('Setores', h('div', {}, list, f));
  };
  draw();
}

function empresaSheet() {
  const f = h('form', {
    class: 'form',
    onsubmit: e => { e.preventDefault(); const d = new FormData(f); Store.setEmpresa(d.get('nome').trim() || 'Minha Empresa'); if (d.get('perfil')) salvarPerfil(d.get('perfil')); closeSheet(); toast('Empresa atualizada'); },
  },
    field('Nome da empresa', input('nome', Store.get().empresa.nome, { required: true })),
    field('Seu nome (assina comentários e revisões)', input('perfil', perfil())),
    h('div', { class: 'actions' }, h('button', { class: 'btn primary', type: 'submit' }, 'Salvar')),
    h('hr'),
    h('p', { class: 'muted' }, 'Seus dados ficam salvos neste aparelho. Exporte um backup para não perder nada.'),
    h('div', { class: 'row-btn' },
      h('button', { type: 'button', class: 'btn', onclick: exportar }, 'Exportar backup'),
      h('button', { type: 'button', class: 'btn', onclick: () => $('#import-file').click() }, 'Importar backup'),
      h('input', { id: 'import-file', type: 'file', accept: 'application/json', hidden: true, onchange: importar })));
  openSheet('Empresa e dados', h('div', {}, f, h('hr'), equipeSecao(), h('hr'), h('button', { type: 'button', class: 'btn small', onclick: identidadeSheet }, 'Identidade da marca (logo, cor, fonte)')));
}
function exportar() {
  const a = h('a', { href: URL.createObjectURL(new Blob([Store.exportJSON()], { type: 'application/json' })), download: `espro-backup-${today()}.json` });
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
async function importar(e) {
  const fl = e.target.files[0]; if (!fl) return;
  try { Store.importJSON(await fl.text()); closeSheet(); toast('Backup importado'); } catch { toast('Arquivo de backup inválido'); }
}

/* ───────────── Início ───────────── */
function viewInicio() {
  const S = Store.get(), t = today();
  const total = S.cards.length, done = S.cards.filter(c => c.col === 'done').length, setoresVis = setoresPermitidos();
  const pct = total ? Math.round(done / total * 100) : 0;
  const itens = [
    ...S.eventos.map(e => ({ data: e.data, hora: e.hora, titulo: e.titulo, cor: corSetor(e.setor) || 'var(--accent)', tag: TIPOS.find(x => x[0] === e.tipo)?.[1], on: () => eventSheet(e) })),
    ...S.cards.filter(c => c.prazo && c.col !== 'done').map(c => ({ data: c.prazo, hora: '', titulo: c.titulo, cor: corSetor(c.setor), tag: 'Prazo', on: () => cardSheet(c) })),
  ].filter(i => i.data >= t).sort((a, b) => (a.data + a.hora).localeCompare(b.data + b.hora)).slice(0, 5);

  return h('div', { class: 'stack' },
    h('section', { class: 'hero' },
      h('div', { class: 'ring', style: `--p:${pct}`, role: 'img', 'aria-label': `${pct}% concluído` }, h('b', {}, pct + '%')),
      h('div', {},
        h('p', { class: 'eyebrow' }, `${nomeEdicao(Store.edicaoAtual())} em andamento`),
        h('h2', {}, total ? `${done} de ${total} tarefas prontas` : 'Comece criando as tarefas'),
        h('p', { class: 'muted' }, `${Store.paginasEd().length} página(s) na revista`))),
    secaoAlertas(),
    h('section', {},
      h('div', { class: 'sec-head' }, h('h3', {}, 'Próximos compromissos'), h('a', { href: '#/agenda' }, 'Ver agenda')),
      itens.length
        ? h('ul', { class: 'list' }, itens.map(i => h('li', {}, h('button', { class: 'item', onclick: i.on },
          h('span', { class: 'bar', style: `background:${i.cor}` }),
          h('span', { class: 'grow' }, h('b', {}, i.titulo), h('small', {}, `${fmtShort(i.data)}${i.hora ? ' · ' + i.hora : ''} · ${i.tag}`))))))
        : h('p', { class: 'empty' }, 'Nada marcado. Toque em Agenda para planejar.')),
    h('section', {},
      h('div', { class: 'sec-head' }, h('h3', {}, 'Desempenho por setor'), Sync.cargo() === 'admin' ? h('button', { class: 'link', onclick: setoresSheet }, 'Gerenciar') : null),
      h('div', { class: 'setor-perf-list' }, setoresVis.map(s => {
        const tarefas = S.cards.filter(c => c.setor === s.id && !c.arquivado);
        const feitas = tarefas.filter(c => c.col === 'done').length;
        const tot = tarefas.length;
        const progresso = tot ? Math.round((feitas / tot) * 100) : 0;
        return h('button', {
          class: 'setor-perf-card',
          style: `--c:${s.cor}`,
          onclick: () => { Views.filtro = s.id; location.hash = '#/quadro'; },
        },
          h('div', { class: 'setor-perf-head' },
            h('span', { class: 'setor-perf-nome' }, h('span', { class: 'dot' }), s.nome),
            h('span', { class: 'setor-perf-pct' }, tot ? `${feitas}/${tot} (${progresso}%)` : 'Sem tarefas')),
          h('div', { class: 'meter' }, h('i', { style: `width:${progresso}%;background:${s.cor}` })));
      }))));
}

/* ───────────── Quadro (kanban) ───────────── */
function cardEl(c) {
  const idx = Store.COLS.findIndex(x => x.id === c.col), atrasado = c.prazo && c.prazo < today() && c.col !== 'done';
  const s = Store.get().setores.find(x => x.id === c.setor);
  return h('article', { class: 'card' + (c.col === 'done' ? ' done' : ''), 'data-id': c.id },
    h('button', { class: 'card-main', onclick: () => { if (!Drag.recent) cardSheet(c); } },
      h('div', { class: 'card-tags' },
        s && chipSetor(s),
        c.prioridade && h('span', { class: `prio-tag prio-${c.prioridade}` }, { baixa: 'Baixa 🟢', media: 'Média 🟡', alta: 'Alta 🔴' }[c.prioridade]),
        c.esforco && h('span', { class: 'esforco-tag' }, icon('clock', 12), c.esforco),
        c.link && h('span', { class: 'link-tag', title: 'Possui link/fonte' }, icon('link2', 12))),
      h('b', {}, c.titulo),
      Array.isArray(c.checklist) && c.checklist.length ? (() => {
        const prontos = c.checklist.filter(it => it.feito).length;
        const tot = c.checklist.length;
        const pct = Math.round((prontos / tot) * 100);
        return h('div', { class: 'card-checklist-bar', title: `${prontos} de ${tot} subtarefas prontas` },
          h('div', { class: 'meter' }, h('i', { style: `width:${pct}%` })),
          h('small', {}, `${prontos}/${tot}`));
      })() : null,
      (c.prazo || c.resp) && h('small', { class: atrasado ? 'late' : '' }, [c.prazo && (atrasado ? 'Atrasado · ' : '') + fmtShort(c.prazo), c.resp].filter(Boolean).join(' · ')),
      (c.criador || c.criadoEm) && h('small', { class: 'card-meta-criador' }, `Por ${c.criador || 'Equipe'}${c.criadoEm ? ' · ' + (typeof quando === 'function' ? quando(c.criadoEm) : fmtShort(isoDate(new Date(c.criadoEm)))) : ''}`)),
    h('span', { class: 'drag-handle', 'aria-hidden': 'true', title: 'Arraste para mover' }, icon('grip', 20)),
    idx < Store.COLS.length - 1 && h('button', {
      class: 'icon-btn mv', 'aria-label': `Mover para ${Store.COLS[idx + 1].nome}`,
      onclick: () => { Store.placeCard(c.id, Store.COLS[idx + 1].id); },
    }, icon('arrow', 20)));
}

/* Arrastar e soltar por Pointer Events (mouse e toque). No toque, só pela alça, para não brigar com o scroll. */
const Drag = {
  recent: false,
  attach(board) {
    board.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const card = e.target.closest('.card');
      if (!card || e.target.closest('.mv')) return;
      if (e.pointerType !== 'mouse' && !e.target.closest('.drag-handle')) return;
      Drag.begin(e, card, board);
    });
  },
  begin(e, card, board) {
    const st = { x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, on: false, pid: e.pointerId, raf: 0, ghost: null, col: null, before: null };
    const line = h('div', { class: 'drop-line' });
    const rect = card.getBoundingClientRect(), ox = e.clientX - rect.left, oy = e.clientY - rect.top;

    const colAt = () => {
      const el = document.elementFromPoint(st.x, st.y);
      return el ? el.closest('.col') : null;
    };
    const update = () => {
      st.ghost.style.transform = `translate(${st.x - ox}px, ${st.y - oy}px)`;
      const col = colAt();
      board.querySelectorAll('.col.drop-over').forEach(c => { if (c !== col) c.classList.remove('drop-over'); });
      st.col = col; st.before = null;
      if (!col) return line.remove();
      col.classList.add('drop-over');
      const box = col.querySelector('.cards');
      st.before = [...box.querySelectorAll('.card:not(.ghosting)')].find(it => {
        const r = it.getBoundingClientRect(); return st.y < r.top + r.height / 2;
      }) || null;
      box.insertBefore(line, st.before);
    };
    const tick = () => {
      if (!st.on) return;
      const br = board.getBoundingClientRect(), zone = 64;
      if (st.x < br.left + zone) board.scrollLeft -= 16 * Math.min(1, (br.left + zone - st.x) / zone);
      else if (st.x > br.right - zone) board.scrollLeft += 16 * Math.min(1, (st.x - (br.right - zone)) / zone);
      if (st.y < 100) window.scrollBy(0, -12);
      else if (st.y > innerHeight - 120) window.scrollBy(0, 12);
      update();
      st.raf = requestAnimationFrame(tick);
    };
    const start = () => {
      st.on = true;
      st.ghost = card.cloneNode(true);
      st.ghost.classList.add('drag-ghost');
      st.ghost.style.width = rect.width + 'px';
      document.body.append(st.ghost);
      card.classList.add('ghosting');
      document.body.classList.add('dragging');
      if (navigator.vibrate) navigator.vibrate(10);
      st.raf = requestAnimationFrame(tick);
    };
    const cleanup = () => {
      cancelAnimationFrame(st.raf);
      removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', cancel);
      st.ghost?.remove(); line.remove();
      board.querySelectorAll('.drop-over').forEach(c => c.classList.remove('drop-over'));
      card.classList.remove('ghosting'); document.body.classList.remove('dragging');
    };
    const move = ev => {
      if (ev.pointerId !== st.pid) return;
      st.x = ev.clientX; st.y = ev.clientY;
      if (!st.on) { if (Math.hypot(st.x - st.x0, st.y - st.y0) < 6) return; start(); }
      ev.preventDefault(); update();
    };
    const up = ev => {
      if (ev.pointerId !== st.pid) return;
      const was = st.on, col = st.col, before = st.before;
      cleanup();
      if (!was) return;
      Drag.recent = true; setTimeout(() => { Drag.recent = false; }, 80);
      if (!col) return;
      const id = card.dataset.id, from = Store.get().cards.find(c => c.id === id)?.col;
      Store.placeCard(id, col.dataset.col, before?.dataset.id);
      if (from !== col.dataset.col) toast(`Movido para ${Store.COLS.find(c => c.id === col.dataset.col).nome}`);
    };
    const cancel = ev => { if (ev.pointerId === st.pid) cleanup(); };
    addEventListener('pointermove', move, { passive: false });
    addEventListener('pointerup', up);
    addEventListener('pointercancel', cancel);
  },
};

function viewQuadro() {
  const S = Store.get(), vis = setoresPermitidos(), restrito = Sync.setoresVisiveis() !== null;
  if (restrito && Views.filtro !== 'all' && !vis.some(s => s.id === Views.filtro)) Views.filtro = 'all';
  const fl = Views.filtro;
  const usuario = (typeof autorAtual === 'function' ? autorAtual() : '') || perfil() || '';
  const apenasMeus = !!Views.apenasMeus;

  const chip = (nome, id, cor) => h('button', {
    class: 'chip' + (fl === id ? ' on' : ''),
    'aria-pressed': String(fl === id),
    style: cor && `--c:${cor}`,
    onclick: () => { Views.filtro = id; App.render(); },
  }, nome);

  const filtroCard = c => {
    if (c.arquivado) return false;
    const matchSetor = fl === 'all' || c.setor === fl;
    const matchUsuario = !apenasMeus || (usuario && c.resp && c.resp.toLowerCase().includes(usuario.toLowerCase()));
    return matchSetor && matchUsuario;
  };

  const data = Store.COLS.map(col => ({
    col,
    cards: S.cards.filter(c => c.col === col.id && filtroCard(c)),
  }));

  const cols = data.map(({ col, cards }) => h('section', { class: 'col', 'data-col': col.id, 'aria-label': col.nome },
    h('header', {}, h('h3', {}, col.nome), h('span', { class: 'count' }, cards.length)),
    h('div', { class: 'cards' }, cards.length ? cards.map(cardEl) : h('p', { class: 'empty' }, 'Nada por aqui')),
    h('button', { class: 'add-in', onclick: () => cardSheet(null, { col: col.id, ...(fl !== 'all' && { setor: fl }) }) }, icon('plus', 18), 'Adicionar')));
  const board = h('div', { class: 'board' }, cols);
  const tabs = h('div', { class: 'col-tabs', role: 'tablist', 'aria-label': 'Ir para a coluna' }, data.map(({ col, cards }, i) =>
    h('button', { role: 'tab', onclick: () => cols[i].scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' }) },
      h('span', {}, col.nome), h('b', {}, cards.length))));
  const sync = () => {
    const br = board.getBoundingClientRect();
    let best = 0, bd = Infinity;
    cols.forEach((c, i) => { const d = Math.abs(c.getBoundingClientRect().left - br.left); if (d < bd) { bd = d; best = i; } });
    if (board.scrollLeft + board.clientWidth >= board.scrollWidth - 4) best = cols.length - 1;
    [...tabs.children].forEach((b, i) => { b.classList.toggle('on', i === best); b.setAttribute('aria-selected', String(i === best)); });
  };
  board.addEventListener('scroll', () => requestAnimationFrame(sync), { passive: true });
  requestAnimationFrame(sync);
  Drag.attach(board);

  /* Ações extras do quadro */
  const arquivarConcluidos = () => {
    const concluidos = S.cards.filter(c => c.col === 'done' && !c.arquivado);
    if (!concluidos.length) return toast('Nenhum cartão pronto para arquivar');
    concluidos.forEach(c => { c.arquivado = true; Store.upsert('cards', c, { silent: true }); });
    Store.touch();
    toast(`${concluidos.length} cartão(ões) arquivado(s)`);
  };

  const distribuirTarefas = () => {
    const semResp = S.cards.filter(c => !c.resp && !c.arquivado && c.col !== 'done');
    if (!semResp.length) return toast('Todas as tarefas já possuem responsável!');
    const membros = [...new Set(S.cards.map(c => c.resp).filter(Boolean))];
    if (!membros.length && usuario) membros.push(usuario);
    if (!membros.length) return toast('Cadastre ao menos 1 responsável nos cartões para o rodízio.');
    let i = 0;
    semResp.forEach(c => {
      c.resp = membros[i % membros.length];
      i++;
      Store.upsert('cards', c, { silent: true });
    });
    Store.touch();
    toast(`${semResp.length} tarefa(s) distribuída(s) entre: ${membros.join(', ')}`);
  };

  return h('div', { class: 'stack tight' },
    h('div', { class: 'chips', role: 'group', 'aria-label': 'Filtrar por setor' },
      restrito && vis.length <= 1 ? null : chip('Todos', 'all'),
      vis.map(s => chip(s.nome, s.id, s.cor))),
    restrito && !vis.length ? h('p', { class: 'empty' }, 'Você ainda não está em nenhum setor. Peça ao administrador para definir o seu setor e o quadro dele aparece aqui.') : null,
    h('div', { class: 'kanban-actions-row' },
      h('button', {
        class: 'chip' + (apenasMeus ? ' on' : ''),
        'aria-pressed': String(apenasMeus),
        onclick: () => { Views.apenasMeus = !apenasMeus; App.render(); },
      }, icon('check', 14), 'Minhas tarefas' + (usuario ? ` (${usuario})` : '')),
      h('button', { class: 'btn ghost small', onclick: arquivarConcluidos }, 'Arquivar prontos'),
      h('button', { class: 'btn ghost small', onclick: distribuirTarefas }, 'Rodízio (distribuir)')),
    tabs, board,
    fab('Novo cartão', () => cardSheet(null, fl !== 'all' ? { setor: fl } : {})));
}

/* ───────────── Agenda ───────────── */
const hoje = new Date();
const cal = { m: new Date(hoje.getFullYear(), hoje.getMonth(), 1), sel: today() };
function viewAgenda() {
  const S = Store.get();
  const map = {};
  const add = (d, i) => (map[d] ||= []).push(i);
  S.eventos.forEach(e => add(e.data, { cor: corSetor(e.setor) || 'var(--accent)', hora: e.hora, titulo: e.titulo, tag: TIPOS.find(x => x[0] === e.tipo)?.[1], setor: e.setor, on: () => eventSheet(e) }));
  S.cards.forEach(c => c.prazo && add(c.prazo, { cor: corSetor(c.setor) || 'var(--accent)', hora: '', titulo: c.titulo, tag: 'Prazo', setor: c.setor, feito: c.col === 'done', on: () => cardSheet(c) }));
  Object.values(map).forEach(l => l.sort((a, b) => a.hora.localeCompare(b.hora)));

  const y = cal.m.getFullYear(), m = cal.m.getMonth();
  const lead = new Date(y, m, 1).getDay(), days = new Date(y, m + 1, 0).getDate();
  const cells = Array.from({ length: lead }, () => h('span', { class: 'day blank', 'aria-hidden': 'true' }));
  for (let d = 1; d <= days; d++) {
    const iso = isoDate(new Date(y, m, d)), its = map[iso] || [];
    cells.push(h('button', {
      class: 'day' + (iso === cal.sel ? ' sel' : '') + (iso === today() ? ' today' : ''),
      'aria-pressed': String(iso === cal.sel),
      'aria-label': fmtLong(iso) + (its.length ? `, ${its.length} item(ns)` : ''),
      onclick: () => { cal.sel = iso; App.render(); },
    }, h('span', { class: 'n' }, d), h('span', { class: 'dots' }, its.slice(0, 3).map(i => h('i', { style: `background:${i.cor}` })))));
  }
  const nav = n => { cal.m = new Date(y, m + n, 1); App.render(); };
  const dia = map[cal.sel] || [];
  return h('div', { class: 'stack tight' },
    h('section', { class: 'cal' },
      h('div', { class: 'cal-head' },
        h('button', { class: 'icon-btn', 'aria-label': 'Mês anterior', onclick: () => nav(-1) }, icon('left')),
        h('h2', {}, cap1(cal.m.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }))),
        h('button', { class: 'icon-btn', 'aria-label': 'Próximo mês', onclick: () => nav(1) }, icon('right'))),
      h('div', { class: 'dow', 'aria-hidden': 'true' }, ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map(x => h('span', {}, x))),
      h('div', { class: 'days' }, cells),
      h('button', { class: 'link center', onclick: () => { cal.m = new Date(hoje.getFullYear(), hoje.getMonth(), 1); cal.sel = today(); App.render(); } }, 'Ir para hoje')),
    h('section', {},
      h('div', { class: 'sec-head' }, h('h3', {}, fmtLong(cal.sel))),
      dia.length
        ? h('ul', { class: 'list' }, dia.map(i => h('li', {}, h('button', { class: 'item' + (i.feito ? ' done' : ''), onclick: i.on },
          h('span', { class: 'bar', style: `background:${i.cor}` }),
          h('span', { class: 'grow' }, h('b', {}, i.titulo), h('small', {}, [i.hora, i.tag, i.setor && nomeSetor(i.setor)].filter(Boolean).join(' · ')))))))
        : h('p', { class: 'empty' }, 'Nenhuma atividade neste dia. Toque em + para marcar.')),
    fab('Novo evento', () => eventSheet(null, { data: cal.sel })));
}

/* ───────────── Revista ───────────── */
function pageEl(f, fs, edit = false) {
  const sec = f.sec, style = sec ? `--sec:${sec.cor}` : null, num = h('span', { class: 'num' }, f.n);
  const li = (txt, n, cls, st) => h('li', { class: cls, style: st }, h('span', {}, txt), h('i', {}), h('b', {}, n));

  if (f.tipo === 'secao') {
    const itens = fs.filter(x => x.tipo === 'pagina' && x.sec === sec);
    return h('article', { class: 'page tpl-secao', style },
      h('div', { class: 'txt' }, h('small', {}, 'Seção'), h('h2', {}, sec.nome), h('ol', {}, itens.map(x => li(x.p.titulo, x.n)))), num);
  }
  const p = f.p, nome = Store.get().empresa.nome;
  const objs = objetosDe(p), fundoI = objs.findIndex(o => o.tipo !== 'texto' && o.pos === 'fundo'), fundo = objs[fundoI];
  const imgsEm = pos => objs.map((o, i) => ({ o, i })).filter(x => x.o.tipo !== 'texto' && x.o.pos === pos).map(x => figEl(x.o, x.i));
  const livres = () => objs.map((o, i) => ({ o, i })).filter(x => x.o.tipo === 'texto' || x.o.pos === 'livre')
    .map(x => (x.o.tipo === 'texto' ? textoEl(x.o, x.i, edit) : figEl(x.o, x.i)));
  const kicker = sec && h('small', { class: 'kicker' }, sec.nome);
  /* título e texto corrido: na edição são editáveis direto na página */
  const h2 = () => h('h2', edit ? { contenteditable: 'true', 'data-edit': 'titulo', 'data-ph': 'Título da página', spellcheck: 'true', role: 'textbox', 'aria-label': 'Título da página' } : {}, p.titulo);
  const rich = () => {
    const body = h('div', { class: 'rich', ...(edit ? { contenteditable: 'true', 'data-edit': 'corpo', 'data-ph': 'Escreva o texto da página…', spellcheck: 'true', role: 'textbox', 'aria-multiline': 'true', 'aria-label': 'Texto da página' } : {}) });
    body.innerHTML = sanitizeHTML(conteudo(p));
    return h('div', { class: 'rich-wrap' + (Number(p.colunas) === 2 ? ' cols2' : ''), style: p.fonte && p.fonte !== 1 ? `--fs:${Number(p.fonte) || 1}` : null }, imgsEm('esquerda'), imgsEm('direita'), body);
  };
  const txt = (cls, ...cab) => h('div', { class: 'txt ' + cls }, cab, imgsEm('acima'), rich(), imgsEm('abaixo'));
  const corpo = {
    capa: () => txt('', h('small', { class: 'brand-line' }, marcaLogoEl(22), nome), h2()),
    sumario: () => h('div', { class: 'txt' }, h2(), h('ol', {}, fs.flatMap(x => {
      if (x.tipo === 'secao') return [li(x.sec.nome, x.n, 'sec-li', `--sec:${x.sec.cor}`)];
      return FIXAS.includes(x.p.tpl) ? [] : [li(x.p.titulo, x.n, 'sub')];
    }))),
    materia: () => txt('', kicker, h2()),
    destaque: () => txt('', kicker, h2()),
    lista: () => txt('', kicker, h2()),
    anuncio: () => txt('center', h2()),
    contracapa: () => h('div', { class: 'txt center' }, h2(), imgsEm('acima'), rich(), imgsEm('abaixo'), h('small', { class: 'brand-line' }, marcaLogoEl(22), nome)),
  }[p.tpl] || (() => []);
  /* quadro do texto: título + texto corrido como um bloco livre (movível/redimensionável) */
  const quadro = el => {
    const q = p.quadro;
    if (q && el instanceof Element && el.classList.contains('txt')) {
      el.dataset.q = '1';
      el.style.cssText += `position:absolute;left:${q.x}%;top:${q.y}%;width:${q.w}%;min-height:${q.h}%;transform:rotate(${q.rot || 0}deg)`;
    }
    return el;
  };
  const cls = `page tpl-${p.tpl}` + (sec && !FIXAS.includes(p.tpl) ? ' has-sec' : '') + (fundo ? ' on-photo' : '') + (edit ? ' editing' : '');
  return h('article', { class: cls, style },
    fundo && h('img', { class: 'bg', src: srcDe(fundo), alt: fundo.alt || '', 'data-i': fundoI, style: cropStyle(fundo) }),
    fundo && p.tpl !== 'contracapa' && h('div', { class: 'veil' }),
    imgsEm('topo'), quadro(corpo()), livres(), num);
}

function printRevista() {
  const fs = folhas();
  $('#print-root').replaceChildren(...fs.map(f => pageEl(f, fs)));
  window.print();
}

const statusEl = p => { const s = p.status || 'rascunho'; return h('span', { class: 'st st-' + s }, STATUS.find(x => x[0] === s)[1]); };

function edicaoView(fs) {
  const S = Store.get(), todas = ordenadas();
  const prontas = todas.filter(p => p.status === 'pronta').length;
  const pct = todas.length ? Math.round(prontas / todas.length * 100) : 0;
  const nPag = p => fs.find(f => f.p === p)?.n;

  const linha = lista => (p, i) => h('li', { class: 'page-row' },
    h('button', { class: 'item', onclick: () => abrirPagina(p) },
      h('span', { class: 'pthumb' }, miniPage(p), h('i', {}, nPag(p))),
      h('span', { class: 'grow' }, h('b', {}, p.titulo || '(sem título)'), h('small', {}, TEMPLATES.find(t => t[0] === p.tpl)?.[1])),
      statusEl(p)),
    h('div', { class: 'reorder' },
      h('button', { class: 'icon-btn', 'aria-label': 'Subir página', disabled: i === 0, onclick: () => Store.swap('paginas', p.id, lista[i - 1].id) }, icon('up', 18)),
      h('button', { class: 'icon-btn', 'aria-label': 'Descer página', disabled: i === lista.length - 1, onclick: () => Store.swap('paginas', p.id, lista[i + 1].id) }, icon('down', 18))));

  const grupo = ({ titulo, sec, paginas, defaults, vazio }) => {
    const tarefas = sec ? S.cards.filter(c => c.setor === sec.id) : [];
    const feitas = tarefas.filter(c => c.col === 'done').length;
    return h('section', { class: 'sec-grupo', style: sec && `--sec:${sec.cor}` },
      h('header', {}, h('span', { class: 'dot' }), h('h3', {}, titulo),
        sec && h('a', { class: 'meta-link', href: '#/quadro', onclick: () => { Views.filtro = sec.id; } }, `${feitas}/${tarefas.length} tarefas`),
        defaults && h('button', { class: 'btn small', onclick: () => escolherModelo(defaults) }, icon('plus', 16), 'Página')),
      paginas.length ? h('ul', { class: 'list' }, paginas.map(linha(paginas))) : h('p', { class: 'empty' }, vazio));
  };

  return [
    h('section', { class: 'rev-resumo' },
      h('div', {}, h('b', {}, `${fs.length} páginas impressas`), h('small', {}, `${prontas} de ${todas.length} conteúdos prontos · aberturas de seção são automáticas`)),
      h('div', { class: 'meter', role: 'img', 'aria-label': `${pct}% pronto` }, h('i', { style: `width:${pct}%` })),
      h('div', { class: 'row-btn' },
        h('button', { class: 'btn small', onclick: planejarEdicao }, icon('plus', 16), 'Planejar edição'),
        h('button', { class: 'btn small', onclick: () => window.verificarEdicao?.() }, icon('check2', 16), 'Verificar'),
        h('button', { class: 'btn small', onclick: () => window.exportarSheet?.() }, icon('print', 16), 'Exportar'))),
    h('div', { class: 'stack' },
      grupo({ titulo: 'Capa e abertura', paginas: todas.filter(p => grupoDe(p) <= 2), defaults: { secao: '' }, vazio: 'Sem páginas aqui.' }),
      secoes().map((s, i) => grupo({ titulo: s.nome, sec: s, paginas: todas.filter(p => grupoDe(p) === 3 + i), defaults: { secao: s.id }, vazio: `Nenhuma página em ${s.nome} ainda.` })),
      grupo({ titulo: 'Contracapa', paginas: todas.filter(p => grupoDe(p) === 99), vazio: 'Sem contracapa.' })),
    fab('Nova página', () => escolherModelo({})),
  ];
}

function previaView(fs) {
  if (!fs.length) return h('p', { class: 'empty' }, 'Crie páginas na aba Edição para ver a revista.');
  const dupla = !!Views.dupla;
  const unidades = [];                                            // cada unidade = índices de páginas vistas juntas
  if (dupla) { unidades.push([0]); for (let i = 1; i < fs.length; i += 2) unidades.push(i + 1 < fs.length ? [i, i + 1] : [i]); }
  else fs.forEach((_, i) => unidades.push([i]));
  const modoAtivo = Views.modoLeitura || (Views.dupla ? 'dupla' : 'unica');
  const modo = (id, label) => h('button', {
    role: 'tab',
    'aria-selected': String(modoAtivo === id),
    class: modoAtivo === id ? 'on' : '',
    onclick: () => {
      Views.modoLeitura = id;
      Views.dupla = id === 'dupla';
      App.render();
    },
  }, label);

  const flipbookClass = modoAtivo === 'flipbook' ? ' flipbook-3d' : (dupla ? ' dupla' : '');
  const reader = h('div', { class: 'reader' + flipbookClass, tabindex: '0', 'aria-label': 'Prévia da revista, deslize para virar a página' },
    unidades.map(u => (dupla ? h('div', { class: 'spread' + (u.length === 1 ? (u[0] === 0 ? ' first' : ' last') : '') }, u.map(i => pageEl(fs[i], fs))) : pageEl(fs[u[0]], fs))));
  marcarExcesso(reader);
  const rotulo = u => (u.length === 1 ? `Página ${u[0] + 1}` : `Páginas ${u[0] + 1}–${u[1] + 1}`) + ` de ${fs.length}`;
  const info = h('p', { class: 'reader-info muted' }, rotulo(unidades[0]));
  const itens = [...reader.children];
  const sync = () => {
    const rr = reader.getBoundingClientRect();
    let best = 0, bd = Infinity;
    itens.forEach((el, i) => { const d = Math.abs(el.getBoundingClientRect().left - rr.left); if (d < bd) { bd = d; best = i; } });
    info.textContent = rotulo(unidades[best]);
  };
  reader.addEventListener('scroll', () => requestAnimationFrame(sync), { passive: true });
  const go = i => itens[unidades.findIndex(u => u.includes(i))]?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
  const atalhos = [{ nome: 'Capa', i: 0 }, ...secoes().map(s => ({ nome: s.nome, cor: s.cor, i: fs.findIndex(f => f.tipo === 'secao' && f.sec === s) })).filter(a => a.i >= 0)];
  return [
    h('div', { class: 'seg seg3', role: 'tablist', 'aria-label': 'Modo de leitura' },
      modo('unica', 'Página única'),
      modo('dupla', 'Página dupla'),
      modo('flipbook', 'Flipbook 3D 📖')),
    h('div', { class: 'chips', role: 'group', 'aria-label': 'Ir para a seção' }, atalhos.map(a => h('button', { class: 'chip', style: a.cor && `--c:${a.cor}`, onclick: () => go(a.i) }, a.nome))),
    reader, info,
    h('div', { class: 'row-btn center-row' },
      h('button', { class: 'btn', onclick: () => window.apresentar?.() }, icon('present', 18), 'Apresentar'),
      h('button', { class: 'btn', onclick: () => window.exportarSheet ? window.exportarSheet() : printRevista() }, icon('print', 18), 'Exportar PDF')),
  ];
}

function viewRevista() {
  const tab = Views.revTab, fs = folhas();
  const seg = (id, label) => h('button', { role: 'tab', 'aria-selected': String(tab === id), class: tab === id ? 'on' : '', onclick: () => { Views.revTab = id; App.render(); } }, label);
  const ed = Store.edicaoAtual();
  return h('div', { class: 'stack tight' },
    h('a', { class: 'ed-atual', href: '#/edicoes' }, icon('shelf', 18), h('span', { class: 'grow' }, h('b', {}, nomeEdicao(ed)), ed.nome && h('small', {}, ed.nome)), h('span', { class: 'ed-trocar' }, 'Trocar')),
    h('div', { class: 'seg', role: 'tablist' }, seg('edicao', 'Edição'), seg('previa', 'Prévia')),
    tab === 'edicao' ? edicaoView(fs) : previaView(fs));
}

const Views = { filtro: 'all', revTab: 'edicao', dupla: false, inicio: viewInicio, quadro: viewQuadro, agenda: viewAgenda, revista: viewRevista, edicoes: viewEdicoes, diario: viewDiario };
