/* Portal: porta de entrada limpa, em cartões — Ferramentas, Equipe e (para gerência/TI) Administração.
   Cada cartão: ícone, título, descrição curta e "Abrir →". */
function viewPortal() {
  const S = Store.get(), nome = (Sync.usuario() || perfil() || '').split(' ')[0];
  const hora = new Date().getHours(), saud = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
  const minhas = S.cards.filter(c => !c.arquivado && c.col !== 'done' && Fluxo.ehMeu(c)).length;
  const atrasadas = S.cards.filter(c => !c.arquivado && c.col !== 'done' && c.prazo && c.prazo < today() && Fluxo.ehMeu(c)).length;
  const eds = S.edicoes.filter(e => e.pdf).length;

  const cartao = ({ ic, cor, titulo, desc, ir, extra }) => h('a', { class: 'pc-card', href: typeof ir === 'string' ? ir : '#/inicio', style: `--c:${cor}`,
    onclick: typeof ir === 'function' ? ev => { ev.preventDefault(); ir(); } : null },
    h('span', { class: 'pc-ic' }, icon(ic, 24)),
    h('b', { class: 'pc-tit' }, titulo, extra ? h('span', { class: 'pc-badge' }, extra) : null),
    h('span', { class: 'pc-desc' }, desc),
    h('span', { class: 'pc-abrir' }, 'Abrir →'));
  const grupo = (titulo, cards) => cards.filter(Boolean).length ? h('section', { class: 'pc-grupo' }, h('h3', { class: 'pc-rot' }, titulo), h('div', { class: 'pc-grade' }, cards.filter(Boolean))) : null;

  return h('div', { class: 'stack portal2' },
    h('header', { class: 'pc-ola' },
      h('h2', {}, `${saud}${nome ? ', ' + nome : ''}`),
      h('p', { class: 'muted' }, 'Escolha a ferramenta que você precisa.' + (Sync.conectado() ? ` Você entra como ${Sync.cargos().map(c => CARGO_ROTULO[c]).join(' + ')}${Sync.setores().length ? ' · ' + nomesSetores(Sync.setores().join(',')) : ''}.` : ''))),
    Avisos.faixaInicio(),
    secaoAlertas(),
    grupo('Ferramentas', [
      cartao({ ic: 'kanban', cor: '#2563EB', titulo: 'Quadro', desc: 'Tarefas e demandas de cada setor: repasse, ciente, prazo e entrega.', ir: '#/quadro', extra: minhas ? `${minhas} com você${atrasadas ? ` · ${atrasadas} atrasada(s)` : ''}` : '' }),
      cartao({ ic: 'shelf', cor: '#BE123C', titulo: 'Edições da revista', desc: 'Coletânea das edições em PDF: leia, baixe e acompanhe os lançamentos.', ir: '#/edicoes', extra: eds ? `${eds} edição(ões)` : '' }),
    ]),
    grupo('Equipe', [
      cartao({ ic: 'users', cor: '#9333EA', titulo: 'Organograma', desc: 'Quem é quem: gerência, TI e a hierarquia de cada setor.', ir: '#/organograma' }),
      cartao({ ic: 'journal', cor: '#A16207', titulo: 'Diário de bordo', desc: 'Quem escreve em cada quinta-feira, em ordem alfabética.', ir: '#/diario' }),
      cartao({ ic: 'calendar', cor: '#0E7490', titulo: 'Agenda', desc: 'Reuniões, prazos e eventos da equipe no calendário.', ir: '#/agenda' }),
      Sync.conectado() ? cartao({ ic: 'pencil', cor: '#B04E37', titulo: 'Meu perfil', desc: 'Sua foto, função e apresentação para a equipe.', ir: () => Perfil.meuPerfilSheet() }) : null,
    ]),
    Sync.amplo() ? grupo('Administração', [
      cartao({ ic: 'users', cor: '#1E293B', titulo: 'Usuários e permissões', desc: 'Quem entra, o cargo e os setores de cada pessoa; excluir contas.', ir: '#/equipe' }),
      cartao({ ic: 'grid', cor: '#C2410C', titulo: 'Setores', desc: 'Criar, renomear e definir a gestora e as co-gestoras.', ir: () => setoresSheet() }),
      Sync.gerencia() ? cartao({ ic: 'layers', cor: '#475569', titulo: 'Cargos', desc: 'Nomes das funções e quem tem acesso de TI.', ir: () => cargosSheet() }) : null,
      Sync.gerencia() ? cartao({ ic: 'check2', cor: '#DB2777', titulo: 'Gerência', desc: 'Quem tem a tag Gerência e administra tudo.', ir: () => gerenciaSheet() }) : null,
    ]) : null);
}
Views.inicio = viewPortal;
