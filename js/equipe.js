/* Trabalho em equipe: perfil, vínculo página↔tarefa, comentários, revisão/aprovação, histórico de versões, alertas. */

/* ───────────── perfil (nome de quem usa este aparelho) ───────────── */
const perfil = () => { try { return localStorage.getItem('espro.user') || ''; } catch { return ''; } };
const salvarPerfil = nome => { try { localStorage.setItem('espro.user', nome.trim().slice(0, 40)); } catch { /* ok */ } };
const autorAtual = () => (window.Sync?.conectado?.() ? Sync.usuario() : '') || perfil() || 'Alguém da equipe';

function quando(ts) {
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return 'agora'; if (m < 60) return `há ${m} min`;
  const hh = Math.round(m / 60); if (hh < 24) return `há ${hh} h`;
  return new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '');
}

/* ───────────── comentários ───────────── */
const comentariosDe = pid => (Store.get().comentarios || []).filter(c => c.paginaId === pid).sort((a, b) => a.quando - b.quando);
const abertosDe = pid => comentariosDe(pid).filter(c => !c.resolvido).length;
function comentar(pid, texto, extra = {}) {
  const c = { id: Store.uid(), paginaId: pid, autor: autorAtual(), texto: texto.trim(), quando: Date.now(), resolvido: false, ...extra };
  Store.upsert('comentarios', c, { silent: true });
  return c;
}
function comentariosSheet(pid, aoFechar) {
  const draw = () => {
    const lista = comentariosDe(pid);
    const f = h('form', { class: 'form', onsubmit: e => {
      e.preventDefault();
      const nome = f.elements.nome?.value?.trim(); if (nome) salvarPerfil(nome);
      const t = f.elements.texto.value.trim(); if (!t) return;
      comentar(pid, t); draw(); aoFechar?.();
    } },
      !perfil() && !window.Sync?.conectado?.() ? field('Seu nome', input('nome', '', { required: true, placeholder: 'Para assinar os comentários' })) : null,
      field('Novo comentário', textarea('texto', '', 3)),
      h('div', { class: 'actions' }, h('button', { type: 'submit', class: 'btn primary' }, 'Comentar')));
    openSheet(`Comentários${lista.length ? ` (${lista.filter(c => !c.resolvido).length} aberto${lista.filter(c => !c.resolvido).length === 1 ? '' : 's'})` : ''}`, h('div', {},
      lista.length ? h('ul', { class: 'list com-list' }, lista.map(c => h('li', { class: 'com' + (c.resolvido ? ' ok' : '') },
        h('div', { class: 'com-head' }, h('b', {}, c.autor), h('small', {}, quando(c.quando))),
        h('p', {}, c.texto),
        h('div', { class: 'row-btn' },
          h('button', { type: 'button', class: 'btn small', onclick: () => { Store.upsert('comentarios', { ...c, resolvido: !c.resolvido }, { silent: true }); draw(); aoFechar?.(); } }, c.resolvido ? 'Reabrir' : 'Marcar como resolvido'),
          h('button', { type: 'button', class: 'btn ghost small', onclick: () => { Store.remove('comentarios', c.id, { silent: true }); draw(); aoFechar?.(); } }, 'Excluir')))))
        : h('p', { class: 'empty' }, 'Nenhum comentário ainda. Use para pedir ajustes ou deixar recados para o setor.'),
      f));
  };
  draw();
}

/* ───────────── vínculo página ↔ tarefa ───────────── */
function tarefaDaPagina(p) { return p?.cardId ? Store.get().cards.find(c => c.id === p.cardId) : null; }
function paginaDaTarefa(c) { return c?.paginaId ? Store.get().paginas.find(p => p.id === c.paginaId) : null; }
function vincularPaginaTarefa(pid, cid) {            // grava os dois lados (cardId na página / paginaId na tarefa)
  const S = Store.get();
  for (const c of S.cards) if (c.paginaId === pid && c.id !== cid) { delete c.paginaId; Store.upsert('cards', c, { silent: true }); }
  if (cid) { const c = S.cards.find(x => x.id === cid); if (c) { c.paginaId = pid; Store.upsert('cards', c, { silent: true }); } }
}
function criarTarefaDaPagina(p, setorId) {
  const c = { id: Store.uid(), titulo: 'Página: ' + (p.titulo || 'sem título'), setor: setorId || Store.get().setores[0].id, col: { rascunho: 'doing', revisao: 'review', pronta: 'done' }[p.status] || 'todo', prazo: '', resp: '', desc: '', paginaId: p.id };
  Store.upsert('cards', c, { silent: true });
  return c;
}

/* ───────────── histórico de versões ───────────── */
const versoesDe = pid => (Store.get().versoes || []).filter(v => v.paginaId === pid).sort((a, b) => b.quando - a.quando);
const conteudoSnap = p => { const c = JSON.parse(JSON.stringify(p)); delete c._u; delete c.novo; return JSON.stringify(c); };
function snapshotPagina(p, motivo = '') {
  if (!p || p.novo) return;
  const lista = versoesDe(p.id), ultimo = lista[0], json = conteudoSnap(p);
  if (ultimo && conteudoSnap(ultimo.snap) === json) return;
  const vazia = !(p.titulo || '').trim() && !(p.html || '').replace(/<[^>]*>/g, '').trim() && !(p.objs || []).length;
  if (vazia) return;
  Store.upsert('versoes', { id: Store.uid(), paginaId: p.id, quando: Date.now(), autor: autorAtual(), motivo, snap: JSON.parse(json) }, { silent: true });
  for (const v of lista.slice(14)) Store.remove('versoes', v.id, { silent: true });      // guarda as 15 últimas
}

/* ───────────── alertas (Início) ───────────── */
function alertas() {
  const S = Store.get(), t = today(), out = [];
  const atrasadas = S.cards.filter(c => c.prazo && c.prazo < t && c.col !== 'done').length;
  if (atrasadas) out.push({ nivel: 'erro', texto: `${atrasadas} tarefa(s) atrasada(s)`, ir: () => { Views.filtro = 'all'; location.hash = '#/quadro'; } });
  const fech = S.eventos.filter(e => e.tipo === 'prazo' && e.data >= t).sort((a, b) => a.data.localeCompare(b.data))[0];
  const naoProntas = Store.paginasEd().filter(p => !FIXAS.includes(p.tpl) && p.status !== 'pronta').length;
  if (fech && naoProntas) {
    const dias = Math.round((parseISO(fech.data) - parseISO(t)) / 864e5);
    if (dias <= 7) out.push({ nivel: dias <= 2 ? 'erro' : 'aviso', texto: `${dias === 0 ? 'Hoje' : `Faltam ${dias} dia(s)`}: "${fech.titulo}" e ${naoProntas} página(s) ainda não estão prontas`, ir: () => { Views.revTab = 'edicao'; location.hash = '#/revista'; } });
  }
  const rev = Store.paginasEd().filter(p => p.status === 'revisao').length;
  if (rev) out.push({ nivel: 'aviso', texto: `${rev} página(s) esperando revisão`, ir: () => { Views.revTab = 'edicao'; location.hash = '#/revista'; } });
  const com = (S.comentarios || []).filter(c => !c.resolvido).length;
  if (com) out.push({ nivel: 'info', texto: `${com} comentário(s) em aberto`, ir: () => { Views.revTab = 'edicao'; location.hash = '#/revista'; } });
  return out;
}
function secaoAlertas() {
  const a = alertas(); if (!a.length) return null;
  return h('section', {}, h('div', { class: 'sec-head' }, h('h3', {}, 'Atenção')),
    h('ul', { class: 'list' }, a.map(x => h('li', {}, h('button', { class: 'item alerta ' + x.nivel, onclick: x.ir }, h('span', { class: 'prob-ic' }, icon(x.nivel === 'info' ? 'chat' : 'alert', 18)), h('span', { class: 'grow' }, h('b', {}, x.texto)))))));
}
/* aviso do navegador (opcional): no máximo 1 por dia, só se a permissão foi dada */
function avisarNavegador() {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted' || localStorage.getItem('espro.notif') === today()) return;
    const a = alertas().filter(x => x.nivel !== 'info'); if (!a.length) return;
    localStorage.setItem('espro.notif', today());
    new Notification('ESPRO — Revista', { body: a.map(x => x.texto).slice(0, 3).join('\n'), icon: 'icon.svg' });
  } catch { /* sem suporte */ }
}
