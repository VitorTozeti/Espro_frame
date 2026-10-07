/* Página Equipe: quem está em cada setor.
   Admin, diretor(a) e instrutor(a) veem todos os setores (e quantas pessoas há em cada um);
   gestor(a) vê só as pessoas do próprio setor (é líder dele). Os cargos/setores são definidos só pelo admin. */
const ORDEM_CARGO = { admin: 0, diretor: 1, instrutor: 2, gestor: 3, membro: 4 };
let pessoasBuscadaEm = 0;

function tarefasDe(pessoa, setorId) {
  const nome = (pessoa.nome || '').toLowerCase();
  const doSetor = Store.get().cards.filter(c => c.setor === setorId && !c.arquivado && c.resp && c.resp.toLowerCase().includes(nome));
  return { abertas: doSetor.filter(c => c.col !== 'done').length, prontas: doSetor.filter(c => c.col === 'done').length };
}
const porCargo = (a, b) => (ORDEM_CARGO[a.cargo] ?? 9) - (ORDEM_CARGO[b.cargo] ?? 9) || a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' });

function pessoaLinha(u, setorId) {
  const t = setorId ? tarefasDe(u, setorId) : null;
  return h('li', { class: 'pessoa-linha' },
    h('span', { class: 'avatar', 'aria-hidden': 'true' }, (u.nome || '?').trim().charAt(0).toUpperCase()),
    h('span', { class: 'grow' }, h('b', {}, u.nome), h('small', {}, CARGO_ROTULO[u.cargo] || 'Sem cargo')),
    t ? h('small', { class: 'muted' }, `${t.abertas} aberta(s) · ${t.prontas} pronta(s)`) : null);
}

function blocoSetor(s, gente, detalhe) {
  const lideres = gente.filter(u => u.cargo === 'gestor');
  return h('section', { class: 'setor-equipe', style: `--c:${s?.cor || 'var(--muted)'}` },
    h('header', {}, h('h3', {}, h('span', { class: 'dot' }), s ? s.nome : 'Sem setor'), h('span', { class: 'count' }, `${gente.length} pessoa${gente.length === 1 ? '' : 's'}`)),
    s ? h('p', { class: 'muted hint' }, lideres.length ? 'Líder: ' + lideres.map(u => u.nome).join(', ') : 'Sem gestor(a) neste setor ainda.') : null,
    gente.length ? h('ul', { class: 'pessoas-lista' }, gente.map(u => pessoaLinha(u, detalhe ? s?.id : null))) : h('p', { class: 'empty' }, 'Ninguém aqui ainda.'));
}

function viewEquipe() {
  if (!Sync.gestor()) return h('div', { class: 'stack' }, h('p', { class: 'muted' }, 'Esta página é para gestores(as), diretoria e instrução.'));
  const lista = Sync.equipe();
  if (Sync.conectado() && (!lista || Date.now() - pessoasBuscadaEm > 60000)) {
    pessoasBuscadaEm = Date.now();
    Sync.carregarEquipe(true).then(() => { if (location.hash === '#/equipe') App.render(); });
  }
  if (!lista) return h('div', { class: 'stack' }, h('p', { class: 'muted' }, 'Carregando a equipe…'));
  const S = Store.get(), amplo = Sync.amplo(), admin = Sync.cargo() === 'admin';
  const gente = [...lista].sort(porCargo);

  if (!amplo) {                                                    // gestor(a): só o próprio setor
    const s = S.setores.find(x => x.id === Sync.setor());
    if (!s) return h('div', { class: 'stack' }, h('p', { class: 'empty' }, 'Você ainda não está em um setor. Peça ao administrador para definir o seu.'));
    const meus = gente.filter(u => u.setor === s.id), tar = S.cards.filter(c => c.setor === s.id && !c.arquivado);
    return h('div', { class: 'stack tight' },
      h('section', { class: 'diario-hoje' }, h('p', { class: 'eyebrow' }, 'Você lidera'), h('h2', {}, s.nome),
        h('p', { class: 'muted' }, `${meus.length} pessoa(s) · ${tar.filter(c => c.col !== 'done').length} tarefa(s) abertas · ${tar.filter(c => c.col === 'done').length} prontas`)),
      blocoSetor(s, meus, true));
  }

  const semSetor = gente.filter(u => !S.setores.some(s => s.id === u.setor));
  const cargos = ['diretor', 'instrutor', 'gestor', 'membro'].map(c => [c, gente.filter(u => u.cargo === c).length]);
  return h('div', { class: 'stack tight' },
    h('section', { class: 'diario-hoje' },
      h('p', { class: 'eyebrow' }, 'Visão geral'), h('h2', {}, `${gente.length} pessoa${gente.length === 1 ? '' : 's'} na equipe`),
      h('p', { class: 'muted' }, cargos.filter(([, n]) => n).map(([c, n]) => `${n} ${CARGO_ROTULO[c].replace('(a)', n === 1 ? '' : 's')}`.toLowerCase()).join(' · ') || 'Ninguém com cargo ainda.'),
      admin ? h('div', { class: 'row-btn' },
        h('button', { class: 'btn small', onclick: setoresSheet }, 'Setores'),
        h('button', { class: 'btn small', onclick: empresaSheet }, 'Cargos e setores das pessoas')) : null),
    h('section', {}, h('h3', {}, 'Pessoas por setor'),
      h('div', { class: 'setor-perf-list' }, S.setores.map(s => {
        const n = gente.filter(u => u.setor === s.id).length;
        return h('a', { class: 'setor-perf-card', style: `--c:${s.cor}`, href: '#/equipe', onclick: ev => { ev.preventDefault(); document.getElementById('eq-' + s.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); } },
          h('div', { class: 'setor-perf-head' }, h('span', { class: 'setor-perf-nome' }, h('span', { class: 'dot' }), s.nome), h('span', { class: 'setor-perf-pct' }, `${n} pessoa${n === 1 ? '' : 's'}`)));
      }))),
    S.setores.map(s => { const el = blocoSetor(s, gente.filter(u => u.setor === s.id), true); el.id = 'eq-' + s.id; return el; }),
    semSetor.length ? blocoSetor(null, semSetor, false) : null);
}
Views.equipe = viewEquipe;
