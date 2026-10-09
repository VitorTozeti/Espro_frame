/* Página Equipe: quem está em cada setor.
   Admin, diretor(a) e instrutor(a) veem todos os setores (e quantas pessoas há em cada um);
   gestor(a) vê só as pessoas do próprio setor (é líder dele). Os cargos/setores são definidos só pelo admin. */
const ORDEM_CARGO = { admin: 0, diretor: 1, instrutor: 2, gestor: 3, cogestor: 4, membro: 5 };
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
  const lideres = gente.filter(u => u.cargo === 'gestor' || u.cargo === 'cogestor');
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

  if (admin) return viewAdmin(S, gente);
  const semSetor = gente.filter(u => !S.setores.some(s => s.id === u.setor));
  const cargos = ['diretor', 'instrutor', 'gestor', 'cogestor', 'membro'].map(c => [c, gente.filter(u => u.cargo === c).length]);
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

/* Visão do administrador (só a conta do admin): todas as pessoas cadastradas, setores × cargos, filtros e edição na hora */
const filtroAdm = { busca: '', setor: '', cargo: '' };
const CARGOS_ADM = ['admin', 'diretor', 'instrutor', 'gestor', 'cogestor', 'membro'];
async function mudarPessoa(u, campo, valor) {
  try { await Sync.api('equipe', { method: 'PUT', body: { email: u.email, [campo]: valor } }); toast(campo === 'cargo' ? 'Cargo atualizado' : 'Setor atualizado'); } catch (er) { toast(er.message); }
  await Sync.carregarEquipe(true); App.render();
}
function viewAdmin(S, gente) {
  const setorDe = u => S.setores.find(s => s.id === u.setor);
  const semSetor = gente.filter(u => !setorDe(u)), semCargo = gente.filter(u => u.cargo === 'membro');
  const f = filtroAdm, q = f.busca.trim().toLowerCase();
  const vistas = gente.filter(u => (!q || (u.nome + ' ' + u.email).toLowerCase().includes(q)) && (!f.setor || (f.setor === '_' ? !setorDe(u) : u.setor === f.setor)) && (!f.cargo || u.cargo === f.cargo));
  const cargosCols = CARGOS_ADM.filter(c => c !== 'admin');
  const matriz = h('div', { class: 'matriz-wrap' }, h('table', { class: 'matriz' },
    h('thead', {}, h('tr', {}, h('th', {}, 'Setor'), ...CARGOS_ADM.map(c => h('th', {}, c === 'admin' ? 'Admin' : CARGO_ROTULO[c].replace('(a)', ''))), h('th', {}, 'Total'))),
    h('tbody', {}, ...S.setores.map(s => {
      const g = gente.filter(u => u.setor === s.id);
      return h('tr', { style: `--c:${s.cor}` }, h('th', {}, h('span', { class: 'dot' }), s.nome), ...CARGOS_ADM.map(c => h('td', {}, String(g.filter(u => u.cargo === c).length || '·'))), h('td', {}, h('b', {}, String(g.length))));
    }), h('tr', { class: 'sem' }, h('th', {}, 'Sem setor'), ...CARGOS_ADM.map(c => h('td', {}, String(semSetor.filter(u => u.cargo === c).length || '·'))), h('td', {}, h('b', {}, String(semSetor.length)))))));
  const linha = u => {
    const s = setorDe(u), fixo = u.cargo === 'admin', t = s ? tarefasDe(u, s.id) : null;
    return h('li', { class: 'adm-pessoa', style: `--c:${s?.cor || 'var(--line)'}` },
      h('span', { class: 'avatar', 'aria-hidden': 'true' }, (u.nome || '?').trim().charAt(0).toUpperCase()),
      h('div', { class: 'grow' }, h('b', {}, u.nome), h('small', { class: 'muted' }, u.email),
        h('div', { class: 'adm-tags' }, h('span', { class: 'chip-setor' + (s ? '' : ' sem') }, s ? s.nome : 'Sem setor'), h('span', { class: 'chip-cargo c-' + u.cargo }, CARGO_ROTULO[u.cargo] || 'Sem cargo'),
          t ? h('small', { class: 'muted' }, `${t.abertas} aberta(s) · ${t.prontas} pronta(s)`) : null)),
      h('div', { class: 'adm-sel' },
        h('select', { class: 'input', disabled: fixo, 'aria-label': 'Cargo de ' + u.nome, onchange: ev => mudarPessoa(u, 'cargo', ev.target.value) }, ...(fixo ? ['admin'] : cargosCols).map(c => h('option', { value: c, selected: c === u.cargo }, CARGO_ROTULO[c]))),
        h('select', { class: 'input', 'aria-label': 'Setor de ' + u.nome, onchange: ev => mudarPessoa(u, 'setor', ev.target.value) }, h('option', { value: '' }, 'Sem setor'), ...S.setores.map(x => h('option', { value: x.id, selected: x.id === u.setor }, x.nome)))));
  };
  const opt = (val, rot, atual) => h('option', { value: val, selected: val === atual }, rot);
  return h('div', { class: 'stack tight' },
    h('section', { class: 'diario-hoje' },
      h('p', { class: 'eyebrow' }, 'Visão do administrador'), h('h2', {}, `${gente.length} pessoa${gente.length === 1 ? '' : 's'} cadastrada${gente.length === 1 ? '' : 's'}`),
      h('p', { class: 'muted' }, CARGOS_ADM.map(c => [c, gente.filter(u => u.cargo === c).length]).filter(([, n]) => n).map(([c, n]) => `${n} ${CARGO_ROTULO[c]}`).join(' · ')),
      (semSetor.length || semCargo.length) ? h('p', { class: 'adm-alerta' }, '⚠ ' + [semSetor.length ? `${semSetor.length} sem setor` : '', semCargo.length ? `${semCargo.length} sem cargo` : ''].filter(Boolean).join(' · ') + ' — ajuste abaixo.') : null,
      h('div', { class: 'row-btn' }, h('button', { class: 'btn small', onclick: setoresSheet }, 'Setores'), h('button', { class: 'btn small', onclick: empresaSheet }, 'Remover contas'))),
    h('section', {}, h('h3', {}, 'Setores × cargos'), matriz),
    h('section', {}, h('h3', {}, 'Todas as pessoas'),
      h('div', { class: 'adm-filtros' },
        h('input', { class: 'input', type: 'search', placeholder: 'Buscar nome ou e-mail', value: f.busca, 'aria-label': 'Buscar pessoa', oninput: ev => { f.busca = ev.target.value; clearTimeout(f._t); f._t = setTimeout(() => { App.render(); const i = document.querySelector('.adm-filtros input'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 300); } }),
        h('select', { class: 'input', 'aria-label': 'Filtrar por setor', onchange: ev => { f.setor = ev.target.value; App.render(); } }, opt('', 'Todos os setores', f.setor), ...S.setores.map(s => opt(s.id, s.nome, f.setor)), opt('_', 'Sem setor', f.setor)),
        h('select', { class: 'input', 'aria-label': 'Filtrar por cargo', onchange: ev => { f.cargo = ev.target.value; App.render(); } }, opt('', 'Todos os cargos', f.cargo), ...CARGOS_ADM.map(c => opt(c, CARGO_ROTULO[c], f.cargo)))),
      vistas.length ? h('ul', { class: 'adm-lista' }, vistas.map(linha)) : h('p', { class: 'empty' }, 'Ninguém com esses filtros.')));
}
