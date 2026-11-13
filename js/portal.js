/* Portal: a Início vira a porta de entrada da empresa — boas-vindas, atalhos, avisos, minha semana,
   setores (cada um leva à página de fluxo do setor), revista (última edição) e organograma resumido. */
function viewPortal() {
  const S = Store.get(), t = today(), nome = (Sync.usuario() || perfil() || '').split(' ')[0];
  const hora = new Date().getHours(), saud = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
  const meusSetores = S.setores.filter(s => Sync.setores().includes(s.id));
  const ferramenta = (ic, rot, sub, href) => h('a', { class: 'portal-ferr', href }, h('span', { class: 'portal-ferr-ic' }, icon(ic, 26)), h('span', { class: 'grow' }, h('b', {}, rot), h('small', {}, sub)), icon('right', 18));
  const atalho = (ic, rot, fn) => h('button', { class: 'portal-atalho', type: 'button', onclick: fn }, icon(ic, 20), h('span', {}, rot));

  /* minha semana: minhas tarefas abertas + compromissos dos próximos 7 dias */
  const em7 = isoDate(new Date(Date.now() + 7 * 864e5));
  const minhas = S.cards.filter(c => !c.arquivado && c.col !== 'done' && Fluxo.ehMeu(c))
    .sort((a, b) => (a.prazo || '9999').localeCompare(b.prazo || '9999')).slice(0, 6);
  const agenda = S.eventos.filter(e => e.data >= t && e.data <= em7).sort((a, b) => (a.data + (a.hora || '')).localeCompare(b.data + (b.hora || ''))).slice(0, 5);
  const itemTarefa = c => h('li', {}, h('button', { class: 'item', onclick: () => cardSheet(c) },
    h('span', { class: 'bar', style: `background:${corSetor(c.setor) || 'var(--accent)'}` }),
    h('span', { class: 'grow' }, h('b', {}, c.titulo), h('small', {}, [nomeSetor(c.setor), Store.COLS.find(x => x.id === c.col)?.nome, c.prazo ? (c.prazo < t ? 'atrasada · ' : 'até ') + fmtShort(c.prazo) : ''].filter(Boolean).join(' · ')))));
  const itemEvento = e => h('li', {}, h('button', { class: 'item', onclick: () => eventSheet(e) },
    h('span', { class: 'bar', style: `background:${corSetor(e.setor) || 'var(--accent)'}` }),
    h('span', { class: 'grow' }, h('b', {}, e.titulo), h('small', {}, `${fmtShort(e.data)}${e.hora ? ' · ' + e.hora : ''}`))));

  /* revista: a edição publicada mais recente (vitrine) e a que está em produção */
  const eds = [...S.edicoes].sort((a, b) => b.numero - a.numero);
  const vitrine = eds.find(e => e.status === 'publicada') || eds[0], producao = Store.edicaoAtual();
  const capaEd = e => { const c = Store.paginasEd(e.id).find(p => p.tpl === 'capa'); return c ? miniPage(c) : h('div', { class: 'ed-cover-ph' }, h('b', {}, `nº ${e.numero}`)); };

  return h('div', { class: 'stack portal' },
    h('section', { class: 'portal-hero' },
      h('div', { class: 'portal-hero-txt' },
        h('p', { class: 'eyebrow' }, cap1(new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }))),
        h('h2', {}, `${saud}${nome ? ', ' + nome : ''}!`),
        h('p', { class: 'muted' }, [Sync.conectado() ? CARGO_ROTULO[Sync.cargo()] : '', meusSetores.map(s => s.nome).join(' + ') || (Sync.amplo() ? 'Todos os setores' : '')].filter(Boolean).join(' · ') || S.empresa.nome)),
      null),
    h('section', {}, h('h3', {}, 'Ferramentas'),
      h('div', { class: 'portal-ferramentas' },
        ferramenta('kanban', 'Quadro', `${minhas.length ? minhas.length + ' tarefa(s) com você · ' : ''}tarefas e demandas dos setores`, '#/quadro'),
        ferramenta('shelf', 'Edições da revista', `${S.edicoes.length} edição(ões) na coletânea · leia ou baixe o PDF`, '#/edicoes'))),
    Avisos.faixaInicio(),
    secaoAlertas(),
    h('div', { class: 'portal-grid' },
      h('section', { class: 'portal-card' },
        h('div', { class: 'sec-head' }, h('h3', {}, 'Minhas tarefas'), h('a', { href: '#/quadro', onclick: () => { Views.filtro = 'all'; Views.apenasMeus = true; } }, 'Ver no quadro')),
        minhas.length ? h('ul', { class: 'list' }, minhas.map(itemTarefa)) : h('p', { class: 'empty' }, 'Nada com você agora. 🎉')),
      h('section', { class: 'portal-card' },
        h('div', { class: 'sec-head' }, h('h3', {}, 'Próximos 7 dias'), h('a', { href: '#/agenda' }, 'Agenda')),
        agenda.length ? h('ul', { class: 'list' }, agenda.map(itemEvento)) : h('p', { class: 'empty' }, 'Nenhum compromisso marcado.'))),
    h('section', {},
      h('div', { class: 'sec-head' }, h('h3', {}, 'Setores'), Sync.amplo() ? h('button', { class: 'link', onclick: setoresSheet }, 'Gerenciar') : null),
      h('div', { class: 'portal-setores' }, setoresPermitidos().map(s => {
        const ts = S.cards.filter(c => c.setor === s.id && !c.arquivado && !c.gestao), feitas = ts.filter(c => c.col === 'done').length;
        const atras = ts.filter(c => c.prazo && c.prazo < t && c.col !== 'done').length, pct = ts.length ? Math.round(feitas / ts.length * 100) : 0;
        return h('a', { class: 'portal-setor', href: '#/setor/' + s.id, style: `--c:${s.cor}` },
          h('b', {}, s.nome),
          h('small', {}, ts.length ? `${ts.length - feitas} aberta(s)${atras ? ` · ${atras} atrasada(s)` : ''}` : 'Sem tarefas'),
          h('div', { class: 'meter' }, h('i', { style: `width:${pct}%;background:${s.cor}` })));
      }))),
    vitrine ? h('section', { class: 'portal-revista' },
      h('div', { class: 'sec-head' }, h('h3', {}, 'Revista'), h('a', { href: '#/edicoes' }, 'Todas as edições')),
      h('div', { class: 'portal-rev-grid' },
        h('button', { class: 'portal-capa', type: 'button', 'aria-label': 'Ler ' + tituloEdicao(vitrine), onclick: () => (Store.paginasEd(vitrine.id).length ? apresentar(0, vitrine.id) : toast('Edição sem páginas')) }, capaEd(vitrine)),
        h('div', {},
          h('p', { class: 'eyebrow' }, vitrine.status === 'publicada' ? 'Última edição publicada' : 'Edição mais recente'),
          h('h3', {}, tituloEdicao(vitrine)), h('p', { class: 'muted' }, dataEd(vitrine)),
          h('div', { class: 'row-btn' },
            h('button', { class: 'btn small primary', type: 'button', onclick: () => (Store.paginasEd(vitrine.id).length ? apresentar(0, vitrine.id) : toast('Edição sem páginas')) }, icon('present', 16), 'Ler'),
            producao && producao.id !== vitrine.id ? h('button', { class: 'btn small', type: 'button', onclick: () => abrirEdicao(producao.id) }, `Em produção: nº ${producao.numero}`) : null)))) : null,
    Sync.conectado() ? h('section', {},
      h('div', { class: 'sec-head' }, h('h3', {}, 'Quem é quem'), h('a', { href: '#/organograma' }, 'Organograma completo')),
      Perfil.organograma({ compacto: true })) : null);
}

/* página do organograma (rota #/organograma, fora da barra de abas) */
function viewOrganograma() {
  if (!Sync.conectado()) return h('div', { class: 'stack' }, h('p', { class: 'empty' }, 'Entre na equipe para ver o organograma.'));
  return h('div', { class: 'stack' },
    h('section', { class: 'estante-head' }, h('p', { class: 'eyebrow' }, S_EMPRESA()), h('h2', {}, 'Organograma'),
      h('p', { class: 'muted' }, 'Gerência, TI e cada setor com seus líderes e equipe. Toque numa pessoa para ver o perfil ou num setor para ver o fluxo dele.'),
      h('div', { class: 'row-btn' }, h('button', { class: 'btn small', type: 'button', onclick: Perfil.meuPerfilSheet }, icon('pencil', 14), 'Meu perfil'),
        Sync.amplo() ? h('button', { class: 'btn small', type: 'button', onclick: () => { location.hash = '#/equipe'; } }, icon('users', 14), 'Gerenciar pessoas') : null)),
    Perfil.organograma());
}
const S_EMPRESA = () => Store.get().empresa.nome;
Views.inicio = viewPortal;
Views.organograma = viewOrganograma;
