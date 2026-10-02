/* Roteador por hash + casca do app (header, navegação inferior). */
const App = (() => {
  const ROUTES = [
    ['inicio', 'Início', 'home'],
    ['quadro', 'Quadro', 'kanban'],
    ['agenda', 'Agenda', 'calendar'],
    ['revista', 'Revista', 'book'],
  ];
  const current = () => ROUTES.find(r => '#/' + r[0] === location.hash) || ROUTES[0];
  let lastRoute;

  let editorId = null;
  function render() {
    const view = $('#view'), m = location.hash.match(/^#\/editor\/(.+)$/);
    if (m) {                                   // editor de página (tela cheia)
      if (editorId === m[1] && $('.ed', view)) return;       // já aberto: não reconstrói
      editorId = m[1];
      view.replaceChildren(Editor.open(m[1]));
      lastRoute = null;
      return;
    }
    if (editorId) { Editor.close(); editorId = null; lastRoute = null; }
    const [id, label] = current();
    const keep = lastRoute === id ? $('.board', view)?.scrollLeft : 0;
    view.replaceChildren(Views[id]());
    const b = $('.board', view); if (b && keep) b.scrollLeft = keep;
    if (lastRoute !== id) { window.scrollTo(0, 0); lastRoute = id; }
    $('#page-title').textContent = label;
    $('#brand').textContent = Store.get().empresa.nome;
    document.title = `${label} · ESPRO`;
    $('#tabs').replaceChildren(...ROUTES.map(([rid, rl, ic]) =>
      h('a', { href: '#/' + rid, 'aria-current': rid === id ? 'page' : null }, icon(ic, 22), h('span', {}, rl))));
  }

  Store.subscribe(() => { if (Store.get()) render(); });
  window.addEventListener('hashchange', () => { if (Store.get()) render(); });
  document.addEventListener('DOMContentLoaded', () => {
    $('#brand').addEventListener('click', empresaSheet);
    $('#search').append(icon('search', 22)); $('#search').addEventListener('click', () => Store.get() && abrirPaleta());
    Store.ready.then(() => { render(); avisarNavegador(); });
    const dot = $('#sync-dot'), pinta = () => { const e = Sync.estado(); dot.hidden = !Sync.conectado(); dot.dataset.s = e.estado; dot.title = e.estado === 'erro' ? 'Equipe: ' + e.erro : e.estado === 'ok' ? 'Equipe: sincronizado' : 'Equipe: ' + e.estado; };
    Sync.onChange(pinta); pinta();
  });
  return { render };
})();
