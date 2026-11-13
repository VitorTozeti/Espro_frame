/* Página de cada setor (#/setor/<id>): quem é quem, o fluxo de trabalho (etapas do quadro), números do setor,
   demandas recebidas de outros setores e as páginas da revista que ele produz.
   "Pedir a este setor" cria uma demanda com `deSetor` (setor de quem pediu): qualquer pessoa pode abrir
   um pedido para outro setor; quem trata é o setor de destino. */
function viewSetor(id) {
  const S = Store.get(), s = S.setores.find(x => x.id === id), t = today();
  if (!s) return h('div', { class: 'stack' }, h('p', { class: 'empty' }, 'Setor não encontrado.'), h('a', { class: 'btn', href: '#/inicio' }, 'Voltar ao portal'));
  const vejo = Sync.setoresVisiveis() === null || Sync.setoresVisiveis().includes(id);
  const gente = (Sync.equipe() || []).filter(u => listaSetores(u.setor).includes(id)).sort((a, b) => Math.min(...cargosDe(a).map(Cargos.ordem)) - Math.min(...cargosDe(b).map(Cargos.ordem)) || a.nome.localeCompare(b.nome, 'pt-BR'));
  const hs = hierarquiaSetor(s, Sync.equipe() || []), lideres = [...hs.gestoras, ...hs.cos];
  const ts = S.cards.filter(c => c.setor === id && !c.arquivado && !c.gestao);
  const abertas = ts.filter(c => c.col !== 'done'), atrasadas = abertas.filter(c => c.prazo && c.prazo < t);
  const mes = t.slice(0, 7), feitasMes = ts.filter(c => c.col === 'done' && c.concluidoEm && isoDate(new Date(c.concluidoEm)).startsWith(mes)).length;
  const duracoes = ts.filter(c => c.concluidoEm && c.criadoEm && c.concluidoEm > c.criadoEm && Date.now() - c.concluidoEm < 90 * 864e5).map(c => (c.concluidoEm - c.criadoEm) / 864e5);
  const media = duracoes.length ? duracoes.reduce((a, b) => a + b, 0) / duracoes.length : null;
  const recebidas = abertas.filter(c => c.deSetor && c.deSetor !== id);
  const paginas = Store.paginasEd().filter(p => p.secao === id);
  const num = (v, rot, cls = '') => h('div', { class: 'setor-num ' + cls }, h('b', {}, String(v)), h('small', {}, rot));
  const pedir = () => cardSheet(null, { setor: id, deSetor: Sync.setores()[0] || '', titulo: '' });

  return h('div', { class: 'stack setor-pg', style: `--c:${s.cor}` },
    h('section', { class: 'setor-hero' },
      h('a', { class: 'link', href: '#/inicio' }, '← Portal'),
      h('h2', {}, h('span', { class: 'dot' }), s.nome),
      h('p', { class: 'muted' }, `${gente.length} pessoa(s)` + (hs.gestoras.length ? ` · Gestora: ${hs.gestoras.map(u => u.nome).join(', ')}` : ' · Sem gestora') + (hs.cos.length ? ` · Co-gestora: ${hs.cos.map(u => u.nome).join(', ')}` : '')),
      h('div', { class: 'row-btn' },
        vejo ? h('button', { class: 'btn small primary', type: 'button', onclick: () => cardSheet(null, { setor: id }) }, icon('plus', 14), 'Nova tarefa') : null,
        !vejo || Sync.amplo() ? h('button', { class: 'btn small' + (vejo ? '' : ' primary'), type: 'button', onclick: pedir }, icon('chat', 14), 'Pedir algo a este setor') : null,
        vejo ? h('button', { class: 'btn small', type: 'button', onclick: () => { Views.filtro = id; location.hash = '#/quadro'; } }, icon('kanban', 14), 'Quadro do setor') : null,
        Sync.amplo() ? h('button', { class: 'btn small ghost', type: 'button', onclick: setoresSheet }, 'Editar setor') : null)),
    vejo ? h('section', {},
      h('h3', {}, 'Números'),
      h('div', { class: 'setor-nums' },
        num(abertas.length, 'abertas'), num(atrasadas.length, 'atrasadas', atrasadas.length ? 'ruim' : ''), num(feitasMes, 'concluídas no mês'),
        num(media === null ? '—' : media < 1 ? '<1 d' : `${Math.round(media)} d`, 'tempo médio (90 dias)'))) : null,
    vejo ? h('section', {},
      h('h3', {}, 'Fluxo de trabalho'),
      h('ol', { class: 'fluxo-etapas' }, Store.COLS.map(col => {
        const n = ts.filter(c => c.col === col.id).length;
        return h('li', {}, h('button', { type: 'button', onclick: () => { Views.filtro = id; location.hash = '#/quadro'; } }, h('b', {}, String(n)), h('span', {}, col.nome)));
      })),
      h('p', { class: 'muted hint' }, 'Demanda chega → A fazer → Fazendo → Revisão → Pronto. Ao repassar, quem recebe dá ciente; ao concluir, registra a entrega.')) : null,
    vejo ? h('section', {},
      h('div', { class: 'sec-head' }, h('h3', {}, 'Pedidos de outros setores')),
      recebidas.length ? h('ul', { class: 'list' }, recebidas.map(c => h('li', {}, h('button', { class: 'item', onclick: () => cardSheet(c) },
        h('span', { class: 'bar', style: `background:${corSetor(c.deSetor) || 'var(--muted)'}` }),
        h('span', { class: 'grow' }, h('b', {}, c.titulo), h('small', {}, `de ${nomeSetor(c.deSetor)} · ${Store.COLS.find(x => x.id === c.col)?.nome}${c.prazo ? ' · até ' + fmtShort(c.prazo) : ''}`))))))
        : h('p', { class: 'empty' }, 'Nenhum pedido de outro setor em aberto.')) : null,
    vejo ? h('section', {},
      h('div', { class: 'sec-head' }, h('h3', {}, 'Tarefas em aberto'), h('small', { class: 'muted' }, String(abertas.length))),
      abertas.length ? h('ul', { class: 'list' }, abertas.sort((a, b) => (a.prazo || '9999').localeCompare(b.prazo || '9999')).slice(0, 12).map(c => h('li', {}, h('button', { class: 'item', onclick: () => cardSheet(c) },
        h('span', { class: 'bar', style: `background:${c.prazo && c.prazo < t ? 'var(--danger, #DC2626)' : s.cor}` }),
        h('span', { class: 'grow' }, h('b', {}, c.titulo), h('small', {}, [Store.COLS.find(x => x.id === c.col)?.nome, c.resp, c.prazo ? 'até ' + fmtShort(c.prazo) : ''].filter(Boolean).join(' · ')))))))
        : h('p', { class: 'empty' }, 'Tudo em dia.')) : h('p', { class: 'muted hint' }, 'Você não faz parte deste setor, então não vê o quadro dele — mas pode abrir um pedido.'),
    gente.length ? h('section', {}, h('h3', {}, 'Equipe'),
      h('div', { class: 'org-equipe' }, gente.map(u => h('button', { class: 'org-pessoa', type: 'button', onclick: () => Perfil.pessoaSheet(u) }, Perfil.avatar(u, 36), h('span', { class: 'org-nome' }, h('b', {}, u.nome), h('small', {}, u.funcao || rotuloCargos(u))))))) : null);
}
Views.setor = viewSetor;
