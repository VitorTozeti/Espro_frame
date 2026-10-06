/* Diário de bordo: toda quinta-feira uma pessoa da equipe registra como foi a semana.
   O rodízio segue a ordem alfabética das contas (Sync.equipe) a partir de uma quinta de referência.
   Cada registro é `state.diario [{id:'q-<ISO da quinta>', data, texto, autorEmail, autor, setor, _u}]` e sincroniza com a equipe. */
const DIARIO_REF = '2026-01-01';                                   // uma quinta-feira (começo do rodízio)
const SEMANA_MS = 7 * 864e5;

const quintaAte = iso => { const d = parseISO(iso); d.setDate(d.getDate() - ((d.getDay() - 4 + 7) % 7)); return isoDate(d); };   // quinta mais recente ≤ iso
const somaDias = (iso, n) => { const d = parseISO(iso); d.setDate(d.getDate() + n); return isoDate(d); };
const ordemAlfa = lista => [...(lista || [])].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }) || a.email.localeCompare(b.email));
function responsavelDa(quinta, lista) {
  const l = ordemAlfa(lista); if (!l.length) return null;
  const i = Math.round((parseISO(quinta) - parseISO(DIARIO_REF)) / SEMANA_MS);
  return l[((i % l.length) + l.length) % l.length];
}
const registroDa = quinta => (Store.get().diario || []).find(r => r.data === quinta);
const setorChip = id => id ? h('span', { class: 'chip-setor', style: `--c:${corSetor(id) || 'var(--muted)'}` }, nomeSetor(id)) : h('span', { class: 'chip-setor sem' }, 'Sem setor');
let equipeBuscadaEm = 0;

function registrarSheet(quinta, resp) {
  const antigo = registroDa(quinta), souEu = resp && resp.email === Sync.email();
  const f = h('form', { class: 'form', onsubmit: ev => {
    ev.preventDefault();
    const texto = f.elements.texto.value.trim();
    if (!texto) { toast('Escreva alguma coisa'); return; }
    const dono = antigo ? { autorEmail: antigo.autorEmail, autor: antigo.autor, setor: antigo.setor } : { autorEmail: resp?.email || Sync.email(), autor: resp?.nome || Sync.usuario(), setor: resp?.setor || '' };
    Store.upsert('diario', { ...dono, id: 'q-' + quinta, data: quinta, texto: texto.slice(0, 4000) });
    closeSheet(); toast('Diário salvo');
  } },
    h('p', { class: 'muted hint' }, souEu ? 'É a sua vez! Conte como foi a semana: o que andou, o que travou e o que vem por aí.' : `Você está editando o registro de ${resp?.nome || 'outra pessoa'} (gestão).`),
    field('Registro da semana', textarea('texto', antigo?.texto || '', 8)),
    antigo ? actionsRow(() => { const r = Store.remove('diario', antigo.id); closeSheet(); toast('Registro apagado', { label: 'Desfazer', fn: () => r && Store.restore('diario', r.item, r.index) }); }) : actionsRow(null));
  openSheet(`Diário · ${fmtLong(quinta)}`, f);
  f.elements.texto.focus();
}

function viewDiario() {
  const hoje = today(), atual = quintaAte(hoje), lista = Sync.equipe();
  if (Sync.conectado() && (!lista || Date.now() - equipeBuscadaEm > 60000)) {
    equipeBuscadaEm = Date.now();
    Sync.carregarEquipe(true).then(() => { if (location.hash === '#/diario') App.render(); });
  }
  if (!lista) return h('div', { class: 'stack' }, h('p', { class: 'muted' }, Sync.conectado() ? 'Carregando a equipe…' : 'Entre na equipe para usar o diário de bordo.'));
  if (!lista.length) return h('div', { class: 'stack' }, h('p', { class: 'muted' }, 'Ainda não há contas na equipe.'));

  const eu = Sync.email(), gestao = Sync.gestor();
  const dono = q => { const r = registroDa(q), p = responsavelDa(q, lista); return { r, p, nome: r?.autor || p?.nome || '—', setor: r ? r.setor : p?.setor || '' }; };
  const podeEscrever = q => { const { r, p } = dono(q); return gestao || (r ? r.autorEmail : p?.email) === eu; };

  const a = dono(atual), minhaVez = (a.r ? a.r.autorEmail : a.p?.email) === eu;
  const destaque = h('section', { class: 'diario-hoje' + (minhaVez ? ' minha' : '') },
    h('p', { class: 'eyebrow' }, atual === hoje ? 'Hoje é quinta' : 'Quinta mais recente'),
    h('h2', {}, fmtLong(atual)),
    h('p', { class: 'diario-quem' }, h('b', {}, minhaVez ? 'Você' : a.nome), ' ', setorChip(a.setor)),
    a.r ? h('p', { class: 'diario-texto' }, a.r.texto) : h('p', { class: 'muted' }, minhaVez ? 'É a sua vez de escrever o diário de bordo!' : 'Ainda sem registro desta semana.'),
    podeEscrever(atual) ? h('button', { class: 'btn primary', type: 'button', onclick: () => registrarSheet(atual, a.p) }, icon('pencil', 18), a.r ? 'Editar registro' : 'Escrever diário') : null);

  const proximas = [1, 2, 3, 4].map(i => somaDias(atual, 7 * i)).map(q => {
    const p = responsavelDa(q, lista);
    return h('li', { class: 'diario-linha' + (p?.email === eu ? ' eu' : '') }, h('span', { class: 'diario-data' }, fmtShort(q)), h('b', { class: 'grow' }, p?.email === eu ? `${p.nome} (você)` : p?.nome || '—'), setorChip(p?.setor));
  });

  const antigas = (Store.get().diario || []).map(r => r.data).filter(d => d < atual).sort()[0];
  const semanas = Math.min(52, Math.max(8, antigas ? Math.round((parseISO(atual) - parseISO(antigas)) / SEMANA_MS) : 0));
  const historico = Array.from({ length: semanas }, (_, i) => somaDias(atual, -7 * (i + 1))).map(q => {
    const d = dono(q);
    return h('li', { class: 'diario-item' },
      h('div', { class: 'diario-cab' }, h('span', { class: 'diario-data' }, fmtShort(q)), h('b', { class: 'grow' }, d.nome), setorChip(d.setor),
        podeEscrever(q) ? h('button', { class: 'icon-btn sm', type: 'button', 'aria-label': 'Editar registro de ' + fmtShort(q), onclick: () => registrarSheet(q, d.p) }, icon('pencil', 16)) : null),
      d.r ? h('p', { class: 'diario-texto' }, d.r.texto) : h('p', { class: 'muted' }, 'Sem registro.'));
  });

  return h('div', { class: 'stack tight' },
    destaque,
    h('section', {}, h('h3', {}, 'Próximas quintas'), h('p', { class: 'muted hint' }, 'O rodízio segue a ordem alfabética das contas: uma pessoa por quinta-feira.'), h('ul', { class: 'diario-lista' }, proximas)),
    h('section', {}, h('h3', {}, 'Registros anteriores'), h('ul', { class: 'diario-lista' }, historico)));
}
