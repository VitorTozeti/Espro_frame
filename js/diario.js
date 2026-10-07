/* Diário de bordo: marca quem é a pessoa responsável de cada quinta-feira.
   O rodízio segue a ordem alfabética das contas (Sync.equipe) a partir de uma quinta de referência.
   Só o admin troca a pessoa de uma quinta: isso grava `state.diario [{id:'q-<ISO da quinta>', data, autorEmail, autor, _u}]` (exceção ao rodízio). */
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
function donoDaQuinta(q, lista) {                                  // pessoa da quinta (troca do admin ou rodízio)
  const r = registroDa(q);
  return r ? (lista || []).find(u => u.email === r.autorEmail) || { email: r.autorEmail, nome: r.autor, setor: '' } : responsavelDa(q, lista);
}
const setorChip = id => id ? h('span', { class: 'chip-setor', style: `--c:${corSetor(id) || 'var(--muted)'}` }, nomeSetor(id)) : h('span', { class: 'chip-setor sem' }, 'Sem setor');
let equipeBuscadaEm = 0;

function trocarSheet(quinta, lista) {
  const atual = registroDa(quinta), auto = responsavelDa(quinta, lista) ;
  const sel = h('select', { class: 'input', name: 'quem' }, ordemAlfa(lista).map(u => h('option', { value: u.email, selected: u.email === (atual?.autorEmail || auto?.email) }, u.nome)));
  const f = h('form', { class: 'form', onsubmit: ev => {
    ev.preventDefault();
    const u = lista.find(x => x.email === sel.value);
    if (u) Store.upsert('diario', { id: 'q-' + quinta, data: quinta, autorEmail: u.email, autor: u.nome });
    closeSheet(); toast('Responsável atualizado');
  } },
    h('p', { class: 'muted hint' }, `Rodízio automático: ${auto?.nome || '—'}. Escolha outra pessoa só se precisar trocar.`),
    field('Quem é nesta quinta', sel),
    h('div', { class: 'actions' },
      atual ? h('button', { type: 'button', class: 'btn danger', onclick: () => { Store.remove('diario', atual.id); closeSheet(); toast('Voltou ao rodízio automático'); } }, 'Voltar ao automático') : null,
      h('button', { type: 'submit', class: 'btn primary' }, 'Salvar')));
  openSheet(`Quinta · ${fmtLong(quinta)}`, f);
}

function viewDiario() {
  const hoje = today(), atual = quintaAte(hoje), lista = Sync.equipe();
  if (Sync.conectado() && (!lista || Date.now() - equipeBuscadaEm > 60000)) {
    equipeBuscadaEm = Date.now();
    Sync.carregarEquipe(true).then(() => { if (location.hash === '#/diario') App.render(); });
  }
  if (!lista) return h('div', { class: 'stack' }, h('p', { class: 'muted' }, Sync.conectado() ? 'Carregando a equipe…' : 'Entre na equipe para ver o diário de bordo.'));
  if (!lista.length) return h('div', { class: 'stack' }, h('p', { class: 'muted' }, 'Ainda não há contas na equipe.'));

  const eu = Sync.email(), admin = Sync.cargo() === 'admin';
  const dono = q => donoDaQuinta(q, lista);
  const trocar = q => admin ? h('button', { class: 'icon-btn sm', type: 'button', 'aria-label': 'Trocar quem é em ' + fmtShort(q), onclick: () => trocarSheet(q, lista) }, icon('pencil', 16)) : null;

  const p0 = dono(atual), minhaVez = p0?.email === eu;
  const destaque = h('section', { class: 'diario-hoje' + (minhaVez ? ' minha' : '') },
    h('p', { class: 'eyebrow' }, atual === hoje ? 'Hoje é quinta' : 'Quinta mais recente'),
    h('h2', {}, fmtLong(atual)),
    h('p', { class: 'diario-quem' }, h('b', {}, minhaVez ? `${p0.nome} (você)` : p0?.nome || '—'), ' ', setorChip(p0?.setor), trocar(atual)));

  const proximas = [1, 2, 3, 4].map(i => somaDias(atual, 7 * i)).map(q => {
    const p = dono(q);
    return h('li', { class: 'diario-linha' + (p?.email === eu ? ' eu' : '') }, h('span', { class: 'diario-data' }, fmtShort(q)), h('b', { class: 'grow' }, p?.email === eu ? `${p.nome} (você)` : p?.nome || '—'), setorChip(p?.setor), trocar(q));
  });

  return h('div', { class: 'stack tight' },
    destaque,
    h('section', {}, h('h3', {}, 'Próximas quintas'), h('p', { class: 'muted hint' }, 'Uma pessoa por quinta-feira, em ordem alfabética.' + (admin ? ' Você pode trocar quem é com o lápis.' : '')), h('ul', { class: 'diario-lista' }, proximas)));
}
