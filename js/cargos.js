/* Cargos e setores como dados editáveis.
   Cargo = nome livre + NÍVEL fixo de acesso:
     gerencia → tudo (cargos, setores, pessoas, contas)
     ti       → tudo, menos criar/editar cargos, trocar o cargo de alguém e mexer em contas da gerência
     lider    → vê e lidera o(s) próprio(s) setor(es) (antigo gestor / co-gestor)
     membro   → vê o quadro do próprio setor
   Os cargos sincronizam como kind `cargos`; o servidor confere o nível a cada requisição. */
/* Hoje cada pessoa tem 3 marcas: tag Gerência (sim/não) · cargo (nome livre; TI dá acesso de TI) · setores (com papel
   Gestora / Co-gestora / colaborador(a) em cada setor). Os níveis 'gerencia' e 'lider' no cargo ficam só por compatibilidade. */
const NIVEIS = [
  ['membro', 'Colaborador(a)', 'Acesso normal: vê o quadro dos próprios setores'],
  ['ti', 'TI', 'Tudo, menos cargos e a gerência'],
  ['gerencia', 'Gerência (antigo)', 'Cargo antigo que já dava acesso de gerência'],
  ['lider', 'Líder (antigo)', 'Cargo antigo de gestor(a)/co-gestor(a)'],
];
const NIVEIS_NOVOS = NIVEIS.slice(0, 2);
const Cargos = (() => {
  const lista = () => {
    const l = Store.get()?.cargos || Store.cargosPadrao();
    return l.some(c => c.id === 'admin') ? l : [...Store.cargosPadrao().filter(c => c.id === 'admin'), ...l];
  };
  const get = id => lista().find(c => c.id === id);
  const nivel = id => id === 'admin' ? 'gerencia' : (get(id)?.nivel || 'membro');
  const rotulo = id => get(id)?.nome || (id ? 'Membro' : 'Sem cargo');
  const ordem = id => { const i = lista().findIndex(c => c.id === id); return i < 0 ? 99 : i; };
  const nivelRotulo = n => NIVEIS.find(x => x[0] === n)?.[1] || 'Colaborador(a)';
  return { lista, get, nivel, rotulo, ordem, nivelRotulo };
})();
/* nível de uma pessoa vinda de /api/equipe (o servidor manda `nivel`; senão, pela lista) */
/* uma pessoa pode ter VÁRIOS cargos (`cargos` vem do servidor; contas antigas têm só `cargo`, que pode ser "a,b") */
const cargosDe = u => { const l = u?.cargos?.length ? u.cargos : listaSetores(u?.cargo); return l.length ? l : ['membro']; };
const rotuloCargos = u => cargosDe(u).map(c => CARGO_ROTULO[c]).join(' · ');
const temCargo = (u, id) => cargosDe(u).includes(id);
const ORDEM_NIVEL = { gerencia: 3, ti: 2, lider: 1, membro: 0 };
const nivelDe = u => u?.nivel || cargosDe(u).map(Cargos.nivel).sort((a, b) => ORDEM_NIVEL[b] - ORDEM_NIVEL[a])[0];
const amploDe = u => ['gerencia', 'ti'].includes(nivelDe(u));
const ehGerencia = u => !!u && (u.gerencia === true || temCargo(u, 'admin') || nivelDe(u) === 'gerencia');

/* papéis dentro do setor: gestora (1) → co-gestoras (várias) → colaboradores. Sem papel gravado, vale o cargo antigo (gestor/co-gestor). */
function papelNoSetor(u, s) {
  if (!u || !s) return '';
  if (s.gestora) { if (s.gestora === u.email) return 'gestora'; }
  if ((s.cogestoras || []).includes(u.email)) return 'cogestora';
  if (!s.gestora && !(s.cogestoras || []).length) return temCargo(u, 'gestor') ? 'gestora' : temCargo(u, 'cogestor') ? 'cogestora' : '';
  return '';
}
const PAPEL_ROTULO = { gestora: 'Gestora', cogestora: 'Co-gestora' };
function hierarquiaSetor(s, gente) {
  const g = gente.filter(u => listaSetores(u.setor).includes(s.id) || s.gestora === u.email || (s.cogestoras || []).includes(u.email));
  const ord = (a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' });
  return { gestoras: g.filter(u => papelNoSetor(u, s) === 'gestora').sort(ord), cos: g.filter(u => papelNoSetor(u, s) === 'cogestora').sort(ord), colab: g.filter(u => !papelNoSetor(u, s) && !ehGerencia(u)).sort(ord), todos: g };
}
const ehLiderDe = (u, setorId) => { const s = Store.get().setores.find(x => x.id === setorId); return !!papelNoSetor(u, s); };

/* as 3 tags de uma pessoa: Gerência (se tiver) · cargo · setores (com o papel em cada um) */
function tagsPessoa(u) {
  const ss = listaSetores(u.setor).map(id => Store.get().setores.find(s => s.id === id)).filter(Boolean);
  return h('span', { class: 'tags-pessoa' },
    ehGerencia(u) ? h('span', { class: 'tag-ger' }, '★ Gerência') : null,
    ...cargosDe(u).filter(c => c !== 'membro' || cargosDe(u).length === 1).map(c => h('span', { class: 'chip-cargo', style: Cargos.get(c)?.cor ? `--cc:${Cargos.get(c).cor}` : null }, CARGO_ROTULO[c] || 'Colaborador(a)')),
    ...(ss.length ? ss.map(s => { const p = papelNoSetor(u, s); return h('span', { class: 'chip-setor' + (p ? ' papel' : ''), style: `--c:${s.cor}` }, s.nome + (p ? ' · ' + PAPEL_ROTULO[p] : '')); })
      : [h('span', { class: 'chip-setor sem' }, amploDe(u) ? 'Todos os setores' : 'Sem setor')]));
}

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
        extra: h('span', { class: 'ge-extra ge-papeis' },
          h('small', { class: 'muted ge-info' }, `${pessoas} pessoa(s) · ${cartoes} tarefa(s)`),
          Sync.conectado() ? papeisSetor(s, gente, draw) : null),
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
/* gestora (uma) e co-gestoras (várias) entre as pessoas do setor */
function papeisSetor(s, gente, aoMudar) {
  const doSetor = gente.filter(u => listaSetores(u.setor).includes(s.id)).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  if (!doSetor.length) return h('small', { class: 'muted' }, 'Ponha pessoas no setor para escolher a gestora');
  const salvar = mud => { Store.upsert('setores', { ...Store.get().setores.find(x => x.id === s.id), ...mud }); Sync.carregarEquipe(true); aoMudar(); };
  const gest = h('select', { class: 'input', 'aria-label': 'Gestora de ' + s.nome, onchange: ev => salvar({ gestora: ev.target.value, cogestoras: (s.cogestoras || []).filter(e => e !== ev.target.value) }) },
    h('option', { value: '' }, 'Gestora: ninguém'), doSetor.map(u => h('option', { value: u.email, selected: u.email === s.gestora }, 'Gestora: ' + u.nome)));
  const marc = new Set(s.cogestoras || []);
  const sum = h('summary', { class: 'input' }, marc.size ? 'Co-gestoras: ' + doSetor.filter(u => marc.has(u.email)).map(u => u.nome.split(' ')[0]).join(', ') : 'Co-gestoras: nenhuma');
  const co = h('details', { class: 'multi-setor' }, sum, h('div', { class: 'multi-setor-lista' }, doSetor.filter(u => u.email !== s.gestora).map(u =>
    h('label', {}, h('input', { type: 'checkbox', checked: marc.has(u.email), onchange: ev => { ev.target.checked ? marc.add(u.email) : marc.delete(u.email); } }), u.nome))));
  co.addEventListener('toggle', () => { if (!co.open && [...marc].sort().join() !== [...(s.cogestoras || [])].sort().join()) salvar({ cogestoras: [...marc] }); });
  return h('span', { class: 'ge-papeis-sel' }, gest, co);
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
      const n = gente.filter(u => temCargo(u, c.id)).length, fixo = c.id === 'admin', base = c.id === 'membro';
      const sel = h('select', { class: 'input ge-nivel', 'aria-label': 'Nível de ' + c.nome, disabled: fixo, onchange: ev => { Store.upsert('cargos', { ...c, nivel: ev.target.value }); toast(`${c.nome}: ${Cargos.nivelRotulo(ev.target.value)}`); draw(); } },
        NIVEIS.filter(([v]) => NIVEIS_NOVOS.some(n => n[0] === v) || v === c.nivel).map(([v, r]) => h('option', { value: v, selected: v === c.nivel }, r)));
      return linhaEditavel({
        item: c, cor: c.cor || '#64748B',
        onNome: nome => { Store.upsert('cargos', { ...c, nome }); toast('Cargo renomeado'); draw(); },
        onCor: cor => { Store.upsert('cargos', { ...c, cor }); draw(); },
        extra: h('span', { class: 'ge-extra' }, sel, h('small', { class: 'muted ge-info' }, `${n} pessoa(s)`)),
        onSubir: i ? () => { moverNaLista('cargos', c.id, -1); draw(); } : null,
        onDescer: i < l.length - 1 ? () => { moverNaLista('cargos', c.id, 1); draw(); } : null,
        onExcluir: fixo || base ? null : () => excluirCargo(c, gente.filter(u => temCargo(u, c.id)), draw),
        motivo: fixo ? 'O cargo ADM é fixo' : base ? 'Membro é o cargo padrão de quem entra' : null,
      });
    }));
    const f = h('form', { class: 'ge-novo', onsubmit: ev => {
      ev.preventDefault(); const d = Object.fromEntries(new FormData(f)), nome = d.nome.trim(); if (!nome) return;
      Store.upsert('cargos', { id: idDeNome(nome, l.map(x => x.id)), nome, nivel: d.nivel, cor: Store.CORES[l.length % Store.CORES.length] });
      toast(`Cargo "${nome}" criado`); draw();
    } }, h('input', { class: 'input', name: 'nome', placeholder: 'Nome do novo cargo', required: true, maxlength: 40, 'aria-label': 'Nome do novo cargo' }),
      selectEl('nivel', NIVEIS_NOVOS.map(([v, r]) => [v, r]), 'membro'), h('button', { class: 'btn primary', type: 'submit' }, '+ Criar'));
    openSheet('Cargos', h('div', { class: 'stack tight' },
      h('p', { class: 'muted hint' }, 'O cargo é a função da pessoa (nome livre). Quem é da Gerência se marca em "Gerência"; gestora e co-gestora se escolhem em cada setor.'),
      h('ul', { class: 'niveis-leg' }, NIVEIS_NOVOS.map(([v, r, d]) => h('li', {}, h('b', {}, r), ' — ', d))),
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
      const novos = [...new Set(cargosDe(u).map(x => x === c.id ? destino : x))].filter(x => x !== 'admin');
      try { await Sync.api('equipe', { method: 'PUT', body: { email: u.email, cargos: novos } }); } catch (er) { toast(er.message); return; }
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
  if (!Sync.amplo() || temCargo(u, 'admin') || u.email === Sync.email()) return false;
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

/* ───────────── Gerência: quem tem a tag (só a gerência marca/desmarca) ───────────── */
function gerenciaSheet() {
  if (!Sync.gerencia()) return toast('Só a gerência define quem é da gerência');
  const draw = () => {
    const gente = [...(Sync.equipe() || [])].sort((a, b) => Number(ehGerencia(b)) - Number(ehGerencia(a)) || a.nome.localeCompare(b.nome, 'pt-BR'));
    const linha = u => {
      const fixo = temCargo(u, 'admin'), legado = !u.tagGerencia && ehGerencia(u) && !fixo;
      return h('li', { class: 'ger-linha' }, Perfil.avatar(u, 32),
        h('span', { class: 'grow' }, h('b', {}, u.nome), tagsPessoa(u), legado ? h('small', { class: 'muted' }, 'Gerência pelo cargo antigo — troque o cargo para tirar') : null),
        h('label', { class: 'switch', title: fixo ? 'O ADM é sempre da gerência' : '' }, h('input', { type: 'checkbox', checked: ehGerencia(u), disabled: fixo || legado, onchange: async ev => {
          ev.target.disabled = true;
          try { await Sync.api('equipe', { method: 'PUT', body: { email: u.email, gerencia: ev.target.checked } }); toast(ev.target.checked ? `${u.nome} agora é da Gerência` : `${u.nome} saiu da Gerência`); } catch (er) { toast(er.message); }
          await Sync.carregarEquipe(true); draw(); App.render();
        } }), h('span', {})));
    };
    openSheet('Gerência', h('div', { class: 'stack tight' },
      h('p', { class: 'muted hint' }, 'Quem está na Gerência vê e administra tudo (cargos, setores, pessoas e contas). O cargo e os setores da pessoa continuam os mesmos.'),
      gente.length ? h('ul', { class: 'ger-lista' }, gente.map(linha)) : h('p', { class: 'muted' }, 'Carregando…')));
  };
  if (!Sync.equipe()) Sync.carregarEquipe(true).then(draw);
  draw();
}

/* ───────────── Editar uma pessoa: cargos (vários), setores (vários) e o papel em cada setor — tudo num lugar só ─────────────
   Escolhe com chips (toque liga/desliga), vê o resumo e salva uma vez só. Gerência edita tudo; TI edita setores e papéis
   (não mexe em cargos nem em contas da gerência). */
function editarPessoaSheet(u) {
  const ger = Sync.gerencia(), ehAdm = temCargo(u, 'admin');
  const bloqueada = !Sync.amplo() || (!ger && nivelDe(u) === 'gerencia');
  const S = Store.get();
  const cargosSel = new Set(cargosDe(u).filter(c => c !== 'admin'));
  if (ehAdm) cargosSel.delete('membro');
  const setoresSel = new Set(listaSetores(u.setor));
  const papel = Object.fromEntries(S.setores.map(s => [s.id, papelNoSetor(u, s) || '']));
  let tagGer = !!u.tagGerencia;
  const chip = (ativo, rot, cor, onclick, travado) => h('button', { type: 'button', class: 'chip-toggle' + (ativo ? ' on' : ''), 'aria-pressed': String(ativo), disabled: travado, style: cor ? `--c:${cor}` : null, onclick },
    h('span', { class: 'chip-check' }, ativo ? '✓' : ''), rot);
  const corpo = h('div', { class: 'stack tight edp' });
  const draw = () => {
    const resumoCargos = [ehAdm ? 'ADM' : null, ...[...cargosSel].map(c => CARGO_ROTULO[c])].filter(Boolean);
    const linhasSetor = S.setores.filter(s => setoresSel.has(s.id));
    corpo.replaceChildren(...[
      h('div', { class: 'edp-topo' }, Perfil.avatar(u, 44), h('span', { class: 'grow' }, h('b', {}, u.nome), h('small', { class: 'muted' }, u.email))),
      bloqueada ? h('p', { class: 'adm-alerta' }, 'Só a gerência altera contas da gerência.') : null,
      ger && !ehAdm ? h('label', { class: 'edp-ger' }, h('span', { class: 'grow' }, h('b', {}, '★ Gerência'), h('small', { class: 'muted' }, 'Vê e administra tudo')),
        h('span', { class: 'switch' }, h('input', { type: 'checkbox', checked: tagGer, onchange: ev => { tagGer = ev.target.checked; draw(); } }), h('span', {}))) : null,
      h('section', {}, h('h4', {}, 'Cargos ', h('small', { class: 'muted' }, ger ? '— pode marcar mais de um' : '— só a gerência muda')),
        h('div', { class: 'chips-wrap' },
          ehAdm ? chip(true, 'ADM', '#0F172A', null, true) : null,
          ...Cargos.lista().filter(c => c.id !== 'admin').map(c => chip(cargosSel.has(c.id), c.nome + (c.nivel === 'ti' ? ' · acesso TI' : ''), c.cor, () => {
            cargosSel.has(c.id) ? cargosSel.delete(c.id) : cargosSel.add(c.id);
            if (c.id !== 'membro' && cargosSel.has(c.id)) cargosSel.delete('membro');      // "Membro" é o padrão: sai quando há outro cargo
            draw();
          }, !ger || bloqueada)))),
      h('section', {}, h('h4', {}, 'Setores ', h('small', { class: 'muted' }, '— pode marcar mais de um')),
        h('div', { class: 'chips-wrap' }, ...S.setores.map(s => chip(setoresSel.has(s.id), s.nome, s.cor, () => { setoresSel.has(s.id) ? setoresSel.delete(s.id) : setoresSel.add(s.id); draw(); }, bloqueada)))),
      linhasSetor.length ? h('section', {}, h('h4', {}, 'Papel em cada setor'),
        h('ul', { class: 'edp-papeis' }, linhasSetor.map(s => h('li', { style: `--c:${s.cor}` }, h('span', { class: 'dot' }), h('b', { class: 'grow' }, s.nome),
          h('span', { class: 'segmento', role: 'group', 'aria-label': 'Papel em ' + s.nome }, [['', 'Colaborador'], ['cogestora', 'Co-gestora'], ['gestora', 'Gestora']].map(([v, r]) =>
            h('button', { type: 'button', class: papel[s.id] === v ? 'on' : '', 'aria-pressed': String(papel[s.id] === v), disabled: bloqueada, onclick: () => { papel[s.id] = v; draw(); } }, r))))))) : null,
      h('p', { class: 'edp-resumo' }, h('b', {}, 'Fica assim: '), [tagGer || ehAdm ? '★ Gerência' : null, resumoCargos.join(' + ') || 'Membro', linhasSetor.length ? linhasSetor.map(s => s.nome + (papel[s.id] ? ` (${PAPEL_ROTULO[papel[s.id]]})` : '')).join(' + ') : 'sem setor'].filter(Boolean).join(' · ')),
      h('div', { class: 'actions' }, h('button', { type: 'button', class: 'btn ghost', onclick: closeSheet }, 'Cancelar'),
        h('button', { type: 'button', class: 'btn primary', disabled: bloqueada, onclick: salvar }, 'Salvar'))].filter(Boolean));
  };
  async function salvar(ev) {
    const b = ev.currentTarget; b.disabled = true;
    const body = { email: u.email, setor: [...setoresSel].join(',') };
    if (ger) { body.cargos = [...cargosSel]; if (!ehAdm && tagGer !== !!u.tagGerencia) body.gerencia = tagGer; }
    try { await Sync.api('equipe', { method: 'PUT', body }); }
    catch (er) { toast(er.message); b.disabled = false; return; }
    /* papéis ficam gravados no próprio setor (gestora = 1 e-mail, cogestoras = lista); fora do setor, perde o papel */
    for (const s of Store.get().setores) {
      const p = setoresSel.has(s.id) ? papel[s.id] : '';
      let gestora = s.gestora || '', cos = (s.cogestoras || []).filter(e => e !== u.email);
      if (gestora === u.email && p !== 'gestora') gestora = '';
      if (p === 'gestora') gestora = u.email; else if (p === 'cogestora') cos = [...cos, u.email];
      if (gestora !== (s.gestora || '') || cos.join() !== (s.cogestoras || []).join()) Store.upsert('setores', { ...s, gestora, cogestoras: cos }, { silent: true });
    }
    Store.touch(); toast(`${u.nome} atualizado(a)`); closeSheet();
    await Sync.carregarEquipe(true); App.render();
  }
  draw();
  openSheet('Cargos e setores', corpo);
}
