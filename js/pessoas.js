/* Página Equipe: quem está em cada setor.
   Gerência e TI veem todos os setores e administram pessoas (o TI não mexe em cargos nem na gerência);
   líder de setor vê só as pessoas do(s) próprio(s) setor(es). */
let pessoasBuscadaEm = 0;

const temSetor = (u, id) => listaSetores(u.setor).includes(id);
function tarefasDe(pessoa, setorIds) {
  const nome = (pessoa.nome || '').toLowerCase(), ids = [].concat(setorIds);
  const doSetor = Store.get().cards.filter(c => ids.includes(c.setor) && !c.arquivado && c.resp && c.resp.toLowerCase().includes(nome));
  return { abertas: doSetor.filter(c => c.col !== 'done').length, prontas: doSetor.filter(c => c.col === 'done').length };
}
const porCargo = (a, b) => Cargos.ordem(a.cargo) - Cargos.ordem(b.cargo) || a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' });

function pessoaLinha(u, setorId) {
  const t = setorId ? tarefasDe(u, setorId) : null;
  return h('li', { class: 'pessoa-linha', onclick: () => Perfil.pessoaSheet(u), style: 'cursor:pointer' },
    Perfil.avatar(u, 34),
    h('span', { class: 'grow' }, h('b', {}, u.nome), tagsPessoa(u)),
    t ? h('small', { class: 'muted' }, `${t.abertas} aberta(s) · ${t.prontas} pronta(s)`) : null);
}

function blocoSetor(s, gente, detalhe) {
  const lideres = s ? hierarquiaSetor(s, gente) : null;
  return h('section', { class: 'setor-equipe', style: `--c:${s?.cor || 'var(--muted)'}` },
    h('header', {}, h('h3', {}, h('span', { class: 'dot' }), s ? s.nome : 'Sem setor'), h('span', { class: 'count' }, `${gente.length} pessoa${gente.length === 1 ? '' : 's'}`)),
    s ? h('p', { class: 'muted hint' }, [lideres.gestoras.length ? 'Gestora: ' + lideres.gestoras.map(u => u.nome).join(', ') : 'Sem gestora', lideres.cos.length ? 'Co-gestora: ' + lideres.cos.map(u => u.nome).join(', ') : ''].filter(Boolean).join(' · ')) : null,
    gente.length ? h('ul', { class: 'pessoas-lista' }, gente.map(u => pessoaLinha(u, detalhe ? s?.id : null))) : h('p', { class: 'empty' }, 'Ninguém aqui ainda.'));
}

function viewEquipe() {
  if (!Sync.gestor()) return h('div', { class: 'stack' }, h('p', { class: 'muted' }, 'Esta página é para líderes de setor, gerência e TI.'));
  const lista = Sync.equipe();
  if (Sync.conectado() && (!lista || Date.now() - pessoasBuscadaEm > 60000)) {
    pessoasBuscadaEm = Date.now();
    Sync.carregarEquipe(true).then(() => { if (location.hash === '#/equipe') App.render(); });
  }
  if (!lista) return h('div', { class: 'stack' }, h('p', { class: 'muted' }, 'Carregando a equipe…'));
  const S = Store.get(), amplo = Sync.amplo();
  const gente = [...lista].sort(porCargo);

  if (!amplo) {                                                    // gestor(a): só o próprio setor
    const mine = S.setores.filter(x => Sync.setores().includes(x.id));
    if (!mine.length) return h('div', { class: 'stack' }, h('p', { class: 'empty' }, 'Você ainda não está em um setor. Peça à gerência ou ao TI para definir o seu.'));
    return h('div', { class: 'stack tight' }, mine.map(s => {
      const meus = gente.filter(u => temSetor(u, s.id)), tar = S.cards.filter(c => c.setor === s.id && !c.arquivado);
      return h('div', { class: 'stack tight' },
        h('section', { class: 'diario-hoje' }, h('p', { class: 'eyebrow' }, 'Você lidera'), h('h2', {}, s.nome),
          h('p', { class: 'muted' }, `${meus.length} pessoa(s) · ${tar.filter(c => c.col !== 'done').length} tarefa(s) abertas · ${tar.filter(c => c.col === 'done').length} prontas`)),
        blocoSetor(s, meus, true));
    }));
  }

  return viewAdmin(S, gente);
}
Views.equipe = viewEquipe;

/* Visão de administração (gerência e TI): todas as pessoas, setores × cargos, filtros, edição na hora e exclusão de contas */
const filtroAdm = { busca: '', setor: '', cargo: '' };
async function mudarPessoa(u, campo, valor) {
  try { await Sync.api('equipe', { method: 'PUT', body: { email: u.email, [campo]: valor } }); toast(campo === 'cargo' ? 'Cargo atualizado' : 'Setor atualizado'); } catch (er) { toast(er.message); }
  await Sync.carregarEquipe(true); App.render();
}
function viewAdmin(S, gente) {
  const setoresDe = u => S.setores.filter(s => temSetor(u, s.id));
  const CARGOS_ADM = Cargos.lista().map(c => c.id), ger = Sync.gerencia();
  const semSetor = gente.filter(u => !amploDe(u) && !setoresDe(u).length);   // gerência e TI não precisam de setor
  const f = filtroAdm, q = f.busca.trim().toLowerCase();
  const vistas = gente.filter(u => (!q || (u.nome + ' ' + u.email).toLowerCase().includes(q)) && (!f.setor || (f.setor === '_' ? !setoresDe(u).length : temSetor(u, f.setor))) && (!f.cargo || u.cargo === f.cargo));
  const cargosCols = CARGOS_ADM.filter(c => c !== 'admin');
  const colsMatriz = CARGOS_ADM.filter(c => gente.some(u => u.cargo === c));
  const matriz = h('div', { class: 'matriz-wrap' }, h('table', { class: 'matriz' },
    h('thead', {}, h('tr', {}, h('th', {}, 'Setor'), ...colsMatriz.map(c => h('th', {}, CARGO_ROTULO[c].replace('(a)', ''))), h('th', {}, 'Total'))),
    h('tbody', {}, ...S.setores.map(s => {
      const g = gente.filter(u => temSetor(u, s.id));
      return h('tr', { style: `--c:${s.cor}` }, h('th', {}, h('span', { class: 'dot' }), s.nome), ...colsMatriz.map(c => h('td', {}, String(g.filter(u => u.cargo === c).length || '·'))), h('td', {}, h('b', {}, String(g.length))));
    }), h('tr', { class: 'sem' }, h('th', {}, 'Sem setor'), ...colsMatriz.map(c => h('td', {}, String(semSetor.filter(u => u.cargo === c).length || '·'))), h('td', {}, h('b', {}, String(semSetor.length)))))));
  const linha = u => {
    const ss = setoresDe(u), s = ss[0], fixo = u.cargo === 'admin' || (!ger && nivelDe(u) === 'gerencia'), t = ss.length ? tarefasDe(u, ss.map(x => x.id)) : null;
    return h('li', { class: 'adm-pessoa', style: `--c:${s?.cor || 'var(--line)'}` },
      h('button', { type: 'button', class: 'avatar-btn', 'aria-label': 'Ver perfil de ' + u.nome, onclick: () => Perfil.pessoaSheet(u) }, Perfil.avatar(u, 34)),
      h('div', { class: 'grow' }, h('b', {}, u.nome), h('small', { class: 'muted' }, u.email),
        h('div', { class: 'adm-tags' }, tagsPessoa(u),
          t ? h('small', { class: 'muted' }, `${t.abertas} aberta(s) · ${t.prontas} pronta(s)`) : null)),
      h('div', { class: 'adm-sel' },
        h('select', { class: 'input', disabled: fixo || !ger, title: ger ? null : 'Só a gerência muda cargos', 'aria-label': 'Cargo de ' + u.nome, onchange: ev => mudarPessoa(u, 'cargo', ev.target.value) }, ...(u.cargo === 'admin' ? ['admin'] : cargosCols.includes(u.cargo) ? cargosCols : [u.cargo, ...cargosCols]).map(c => h('option', { value: c, selected: c === u.cargo }, CARGO_ROTULO[c]))),
        fixo ? h('span', { class: 'chip-setor sem' }, nomesSetores(u.setor) || 'Sem setor') : seletorSetores(u, valor => mudarPessoa(u, 'setor', valor)),
        podeExcluirConta(u) ? h('button', { class: 'icon-btn sm danger', type: 'button', 'aria-label': 'Excluir conta de ' + u.nome, title: 'Excluir conta', onclick: () => excluirContaSheet(u) }, icon('trash', 16)) : null));
  };
  const opt = (val, rot, atual) => h('option', { value: val, selected: val === atual }, rot);
  return h('div', { class: 'stack tight' },
    h('section', { class: 'diario-hoje' },
      h('p', { class: 'eyebrow' }, ger ? 'Gerência' : 'TI · administração'), h('h2', {}, `${gente.length} pessoa${gente.length === 1 ? '' : 's'} cadastrada${gente.length === 1 ? '' : 's'}`),
      h('p', { class: 'muted' }, CARGOS_ADM.map(c => [c, gente.filter(u => u.cargo === c).length]).filter(([, n]) => n).map(([c, n]) => `${n} ${CARGO_ROTULO[c]}`).join(' · ')),
      semSetor.length ? h('p', { class: 'adm-alerta' }, `⚠ ${semSetor.length} sem setor — ajuste abaixo.`) : null,
      h('div', { class: 'adm-ferramentas' },
        ger ? h('button', { class: 'adm-ferr', onclick: cargosSheet }, icon('layers', 20), h('b', {}, 'Cargos'), h('small', {}, 'criar, renomear, excluir')) : null,
        ger ? h('button', { class: 'adm-ferr', onclick: gerenciaSheet }, icon('users', 20), h('b', {}, 'Gerência'), h('small', {}, 'quem é da gerência')) : null,
        h('button', { class: 'adm-ferr', onclick: setoresSheet }, icon('grid', 20), h('b', {}, 'Setores'), h('small', {}, 'gestora, co-gestoras, cores')),
        h('button', { class: 'adm-ferr', onclick: () => { location.hash = '#/organograma'; } }, icon('shelf', 20), h('b', {}, 'Organograma'), h('small', {}, 'hierarquia da equipe')))),
    h('section', {}, h('h3', {}, 'Setores × cargos'), matriz),
    h('section', {}, h('h3', {}, 'Todas as pessoas'),
      h('div', { class: 'adm-filtros' },
        h('input', { class: 'input', type: 'search', placeholder: 'Buscar nome ou e-mail', value: f.busca, 'aria-label': 'Buscar pessoa', oninput: ev => { f.busca = ev.target.value; clearTimeout(f._t); f._t = setTimeout(() => { App.render(); const i = document.querySelector('.adm-filtros input'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 300); } }),
        h('select', { class: 'input', 'aria-label': 'Filtrar por setor', onchange: ev => { f.setor = ev.target.value; App.render(); } }, opt('', 'Todos os setores', f.setor), ...S.setores.map(s => opt(s.id, s.nome, f.setor)), opt('_', 'Sem setor', f.setor)),
        h('select', { class: 'input', 'aria-label': 'Filtrar por cargo', onchange: ev => { f.cargo = ev.target.value; App.render(); } }, opt('', 'Todos os cargos', f.cargo), ...CARGOS_ADM.map(c => opt(c, CARGO_ROTULO[c], f.cargo)))),
      vistas.length ? h('ul', { class: 'adm-lista' }, vistas.map(linha)) : h('p', { class: 'empty' }, 'Ninguém com esses filtros.')));
}
