/* Cargos e setores como dados editáveis.
   Cargo = nome livre + NÍVEL fixo de acesso:
     gerencia → tudo (cargos, setores, pessoas, contas)
     ti       → tudo, menos criar/editar cargos, trocar o cargo de alguém e mexer em contas da gerência
     lider    → vê e lidera o(s) próprio(s) setor(es) (antigo gestor / co-gestor)
     membro   → vê o quadro do próprio setor
   Os cargos sincronizam como kind `cargos`; o servidor confere o nível a cada requisição. */
const NIVEIS = [
  ['gerencia', 'Gerência', 'Tudo: cargos, setores, pessoas e contas'],
  ['ti', 'TI', 'Tudo, menos cargos e contas da gerência'],
  ['lider', 'Líder de setor', 'Lidera e vê o(s) próprio(s) setor(es)'],
  ['membro', 'Membro', 'Vê o quadro do próprio setor'],
];
const Cargos = (() => {
  const lista = () => {
    const l = Store.get()?.cargos || Store.cargosPadrao();
    return l.some(c => c.id === 'admin') ? l : [...Store.cargosPadrao().filter(c => c.id === 'admin'), ...l];
  };
  const get = id => lista().find(c => c.id === id);
  const nivel = id => id === 'admin' ? 'gerencia' : (get(id)?.nivel || 'membro');
  const rotulo = id => get(id)?.nome || (id ? 'Membro' : 'Sem cargo');
  const ordem = id => { const i = lista().findIndex(c => c.id === id); return i < 0 ? 99 : i; };
  const nivelRotulo = n => NIVEIS.find(x => x[0] === n)?.[1] || 'Membro';
  return { lista, get, nivel, rotulo, ordem, nivelRotulo };
})();
/* nível de uma pessoa vinda de /api/equipe (o servidor manda `nivel`; senão, pela lista) */
const nivelDe = u => u?.nivel || Cargos.nivel(u?.cargo);
const amploDe = u => ['gerencia', 'ti'].includes(nivelDe(u));

/* id legível e único a partir do nome ("Social Media" → "social-media") */
function idDeNome(nome, usados) {
  const base = String(nome).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'cargo';
  let id = base, n = 2;
  while (usados.includes(id)) id = `${base}-${n++}`;
  return id;
}

/* linha editável comum a setores e cargos: cor · nome (edita no lugar) · extra · subir/descer · excluir */
function linhaEditavel({ item, cor, onNome, onCor, extra, onSubir, onDescer, onExcluir, bloqueado, motivo }) {
  const nome = h('input', { class: 'input ge-nome', value: item.nome, maxlength: 40, 'aria-label': 'Nome', disabled: bloqueado,
    onchange: ev => { const v = ev.target.value.trim(); if (v && v !== item.nome) onNome(v); else ev.target.value = item.nome; },
    onkeydown: ev => { if (ev.key === 'Enter') ev.target.blur(); } });
  return h('li', { class: 'ge-linha', style: `--c:${cor}` },
    h('label', { class: 'ge-cor', title: 'Trocar cor' }, h('span', { class: 'dot' }), h('input', { type: 'color', value: cor, disabled: bloqueado, onchange: ev => onCor(ev.target.value), 'aria-label': 'Cor' })),
    nome, extra || null,
    h('span', { class: 'ge-acoes' },
      h('button', { class: 'icon-btn sm', type: 'button', 'aria-label': 'Subir', disabled: !onSubir, onclick: onSubir }, '↑'),
      h('button', { class: 'icon-btn sm', type: 'button', 'aria-label': 'Descer', disabled: !onDescer, onclick: onDescer }, '↓'),
      h('button', { class: 'icon-btn sm danger', type: 'button', 'aria-label': 'Excluir ' + item.nome, title: motivo || 'Excluir', disabled: !onExcluir, onclick: onExcluir }, icon('trash', 16))));
}
function moverNaLista(kind, id, delta) {
  const l = Store.get()[kind], i = l.findIndex(x => x.id === id), j = i + delta;
  if (i < 0 || j < 0 || j >= l.length) return;
  [l[i], l[j]] = [l[j], l[i]]; Store.touch();
}

/* ───────────── Setores: criar, renomear, cor, ordem, excluir (gerência e TI) ───────────── */
function setoresSheet() {
  if (Sync.conectado() && !Sync.amplo()) return toast('Só a gerência e o TI cuidam dos setores');
  const draw = () => {
    const S = Store.get(), gente = Sync.equipe() || [];
    const lista = h('ul', { class: 'ge-lista' }, S.setores.map((s, i) => {
      const cartoes = S.cards.filter(c => c.setor === s.id).length, pessoas = gente.filter(u => listaSetores(u.setor).includes(s.id)).length;
      return linhaEditavel({
        item: s, cor: s.cor,
        onNome: nome => { Store.upsert('setores', { ...s, nome }); toast('Setor renomeado'); draw(); },
        onCor: cor => { Store.upsert('setores', { ...s, cor }); draw(); },
        extra: h('small', { class: 'muted ge-info' }, `${pessoas} pessoa(s) · ${cartoes} tarefa(s)`),
        onSubir: i ? () => { moverNaLista('setores', s.id, -1); draw(); } : null,
        onDescer: i < S.setores.length - 1 ? () => { moverNaLista('setores', s.id, 1); draw(); } : null,
        onExcluir: S.setores.length > 1 ? () => excluirSetor(s, cartoes, pessoas, draw) : null,
        motivo: S.setores.length > 1 ? null : 'Precisa existir pelo menos um setor',
      });
    }));
    const f = h('form', { class: 'ge-novo', onsubmit: ev => {
      ev.preventDefault(); const nome = new FormData(f).get('nome').trim(); if (!nome) return;
      Store.upsert('setores', { id: Store.uid(), nome, cor: Store.CORES[S.setores.length % Store.CORES.length] }); toast(`Setor "${nome}" criado`); draw();
      setTimeout(() => $('#sheet .ge-novo input')?.focus(), 30);
    } }, h('input', { class: 'input', name: 'nome', placeholder: 'Nome do novo setor', required: true, maxlength: 40, 'aria-label': 'Nome do novo setor' }), h('button', { class: 'btn primary', type: 'submit' }, '+ Criar'));
    openSheet('Setores', h('div', { class: 'stack tight' }, h('p', { class: 'muted hint' }, 'Toque no nome para renomear e na bolinha para trocar a cor. As setas mudam a ordem (vale para a revista e o quadro).'), f, lista));
  };
  if (Sync.conectado() && !Sync.equipe()) Sync.carregarEquipe().then(() => $('#sheet .ge-lista') && draw());
  draw();
}
function excluirSetor(s, cartoes, pessoas, aoFim) {
  const S = Store.get(), outros = S.setores.filter(x => x.id !== s.id);
  const f = h('form', { class: 'form', onsubmit: async ev => {
    ev.preventDefault();
    const destino = new FormData(f).get('destino');
    for (const c of S.cards.filter(c => c.setor === s.id)) Store.upsert('cards', { ...c, setor: destino }, { silent: true });
    for (const p of S.paginas.filter(p => p.secao === s.id)) Store.upsert('paginas', { ...p, secao: destino }, { silent: true });
    if (Sync.conectado()) for (const u of (Sync.equipe() || []).filter(u => listaSetores(u.setor).includes(s.id))) {
      const novo = [...new Set(listaSetores(u.setor).map(x => x === s.id ? destino : x))].join(',');
      try { await Sync.api('equipe', { method: 'PUT', body: { email: u.email, setor: novo } }); } catch (er) { toast(er.message); }
    }
    Store.remove('setores', s.id); Sync.carregarEquipe(true);
    toast(`Setor "${s.nome}" excluído`); aoFim();
  } },
    h('p', {}, `Excluir o setor "${s.nome}"?`),
    h('p', { class: 'muted' }, cartoes || pessoas ? `Ele tem ${cartoes} tarefa(s) e ${pessoas} pessoa(s). Para onde vão?` : 'Ele está vazio.'),
    field('Mover tudo para', selectEl('destino', outros.map(x => [x.id, x.nome]), outros[0].id)),
    h('div', { class: 'actions' }, h('button', { type: 'button', class: 'btn ghost', onclick: aoFim }, 'Cancelar'), h('button', { type: 'submit', class: 'btn danger' }, 'Excluir setor')));
  openSheet('Excluir setor', f);
}

/* ───────────── Cargos: criar, renomear, nível, cor, ordem, excluir (só gerência) ───────────── */
function cargosSheet() {
  if (Sync.conectado() && !Sync.gerencia()) return toast('Só a gerência cria e edita cargos');
  if (!Store.get().cargos) Store.get().cargos = Store.cargosPadrao();
  const draw = () => {
    const S = Store.get(), gente = Sync.equipe() || [], l = S.cargos;
    const lista = h('ul', { class: 'ge-lista' }, l.map((c, i) => {
      const n = gente.filter(u => u.cargo === c.id).length, fixo = c.id === 'admin', base = c.id === 'membro';
      const sel = h('select', { class: 'input ge-nivel', 'aria-label': 'Nível de ' + c.nome, disabled: fixo, onchange: ev => { Store.upsert('cargos', { ...c, nivel: ev.target.value }); toast(`${c.nome}: ${Cargos.nivelRotulo(ev.target.value)}`); draw(); } },
        NIVEIS.map(([v, r]) => h('option', { value: v, selected: v === c.nivel }, r)));
      return linhaEditavel({
        item: c, cor: c.cor || '#64748B',
        onNome: nome => { Store.upsert('cargos', { ...c, nome }); toast('Cargo renomeado'); draw(); },
        onCor: cor => { Store.upsert('cargos', { ...c, cor }); draw(); },
        extra: h('span', { class: 'ge-extra' }, sel, h('small', { class: 'muted ge-info' }, `${n} pessoa(s)`)),
        onSubir: i ? () => { moverNaLista('cargos', c.id, -1); draw(); } : null,
        onDescer: i < l.length - 1 ? () => { moverNaLista('cargos', c.id, 1); draw(); } : null,
        onExcluir: fixo || base ? null : () => excluirCargo(c, gente.filter(u => u.cargo === c.id), draw),
        motivo: fixo ? 'O cargo ADM é fixo' : base ? 'Membro é o cargo padrão de quem entra' : null,
      });
    }));
    const f = h('form', { class: 'ge-novo', onsubmit: ev => {
      ev.preventDefault(); const d = Object.fromEntries(new FormData(f)), nome = d.nome.trim(); if (!nome) return;
      Store.upsert('cargos', { id: idDeNome(nome, l.map(x => x.id)), nome, nivel: d.nivel, cor: Store.CORES[l.length % Store.CORES.length] });
      toast(`Cargo "${nome}" criado`); draw();
    } }, h('input', { class: 'input', name: 'nome', placeholder: 'Nome do novo cargo', required: true, maxlength: 40, 'aria-label': 'Nome do novo cargo' }),
      selectEl('nivel', NIVEIS.map(([v, r]) => [v, r]), 'membro'), h('button', { class: 'btn primary', type: 'submit' }, '+ Criar'));
    openSheet('Cargos', h('div', { class: 'stack tight' },
      h('p', { class: 'muted hint' }, 'O nome do cargo é livre; o nível define o que a pessoa pode fazer.'),
      h('ul', { class: 'niveis-leg' }, NIVEIS.map(([v, r, d]) => h('li', {}, h('b', {}, r), ' — ', d))),
      f, lista));
  };
  if (Sync.conectado() && !Sync.equipe()) Sync.carregarEquipe().then(() => $('#sheet .ge-lista') && draw());
  draw();
}
function excluirCargo(c, pessoas, aoFim) {
  const outros = Store.get().cargos.filter(x => x.id !== c.id && x.id !== 'admin');
  const f = h('form', { class: 'form', onsubmit: async ev => {
    ev.preventDefault();
    const destino = new FormData(f).get('destino');
    for (const u of pessoas) {
      try { await Sync.api('equipe', { method: 'PUT', body: { email: u.email, cargo: destino } }); } catch (er) { toast(er.message); return; }
    }
    Store.remove('cargos', c.id); await Sync.carregarEquipe(true);
    toast(`Cargo "${c.nome}" excluído`); aoFim();
  } },
    h('p', {}, `Excluir o cargo "${c.nome}"?`),
    pessoas.length ? h('p', { class: 'muted' }, `${pessoas.length} pessoa(s) têm esse cargo: ${pessoas.map(u => u.nome).join(', ')}. Elas passam para:`) : h('p', { class: 'muted' }, 'Ninguém tem esse cargo.'),
    pessoas.length ? field('Novo cargo', selectEl('destino', outros.map(x => [x.id, `${x.nome} (${Cargos.nivelRotulo(x.nivel)})`]), 'membro')) : null,
    h('div', { class: 'actions' }, h('button', { type: 'button', class: 'btn ghost', onclick: aoFim }, 'Cancelar'), h('button', { type: 'submit', class: 'btn danger' }, 'Excluir cargo')));
  openSheet('Excluir cargo', f);
}

/* ───────────── Excluir conta (gerência; TI só contas fora da gerência) ───────────── */
function podeExcluirConta(u) {
  if (!Sync.amplo() || u.cargo === 'admin' || u.email === Sync.email()) return false;
  return Sync.gerencia() || nivelDe(u) !== 'gerencia';
}
function excluirContaSheet(u) {
  const f = h('form', { class: 'form', onsubmit: async ev => {
    ev.preventDefault();
    if (new FormData(f).get('conf').trim().toLowerCase() !== u.nome.trim().toLowerCase()) return toast('Digite o nome exatamente para confirmar');
    const b = f.querySelector('[type=submit]'); b.disabled = true;
    try { await Sync.api('equipe/' + encodeURIComponent(u.email), { method: 'DELETE' }); toast(`Conta de ${u.nome} excluída`); closeSheet(); await Sync.carregarEquipe(true); App.render(); }
    catch (er) { toast(er.message); b.disabled = false; }
  } },
    h('p', {}, h('b', {}, u.nome), ' · ', u.email),
    h('p', { class: 'muted' }, 'A conta é apagada e a pessoa perde o acesso na hora. As tarefas e páginas que ela criou continuam no sistema. Isso não pode ser desfeito.'),
    field(`Digite "${u.nome}" para confirmar`, input('conf', '', { required: true, autocomplete: 'off' })),
    h('div', { class: 'actions' }, h('button', { type: 'button', class: 'btn ghost', onclick: closeSheet }, 'Cancelar'), h('button', { type: 'submit', class: 'btn danger' }, 'Excluir conta')));
  openSheet('Excluir conta', f);
}
