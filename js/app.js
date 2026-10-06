/* Roteador por hash + casca do app (header, navegação inferior). */
const App = (() => {
  const ROUTES = [
    ['inicio', 'Início', 'home'],
    ['quadro', 'Quadro', 'kanban'],
    ['agenda', 'Agenda', 'calendar'],
    ['revista', 'Revista', 'book'],
    ['edicoes', 'Edições', 'shelf'],
    ['diario', 'Diário', 'journal'],
  ];
  const current = () => ROUTES.find(r => '#/' + r[0] === location.hash) || ROUTES[0];
  let lastRoute;

  let editorId = null;
  function render() {
    aplicarMarca();
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
    $('#brand').replaceChildren(marcaLogoEl(26), h('span', {}, Store.get().empresa.nome));
    document.title = `${label} · ${Store.get().empresa.nome}`;
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
  /* Portão de login: o app só abre depois de entrar com e-mail e senha (ou criar a conta). */
  let portaoEl = null, modoPortao = 'entrar';
  function portao() {
    const dentro = Sync.conectado();
    if (dentro) { portaoEl?.remove(); portaoEl = null; return; }
    if (portaoEl) return;
    portaoEl = h('div', { class: 'portao', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Entrar no ESPRO' });
    document.body.append(portaoEl);
    const draw = () => {
      const novo = modoPortao === 'criar';
      const f = h('form', { class: 'form', onsubmit: async ev => {
        ev.preventDefault();
        const d = Object.fromEntries(new FormData(f)), b = f.querySelector('button[type=submit]');
        b.disabled = true; b.textContent = novo ? 'Criando…' : 'Entrando…';
        try { await (novo ? Sync.criarConta(d.nome, d.email, d.senha) : Sync.entrar(d.email, d.senha)); }
        catch (er) { toast(er.message); b.disabled = false; b.textContent = novo ? 'Criar conta' : 'Entrar'; }
      } },
        novo ? field('Nome de usuário', input('nome', '', { required: true, autocomplete: 'name', maxlength: 40 })) : null,
        field('E-mail', input('email', '', { type: 'email', required: true, autocomplete: 'email' })),
        field('Senha', input('senha', '', { type: 'password', required: true, minlength: 6, autocomplete: novo ? 'new-password' : 'current-password' })),
        h('button', { class: 'btn primary', type: 'submit' }, novo ? 'Criar conta' : 'Entrar'),
        h('button', { class: 'btn ghost', type: 'button', onclick: () => { modoPortao = novo ? 'entrar' : 'criar'; draw(); } }, novo ? 'Já tenho conta' : 'Criar conta'));
      portaoEl.replaceChildren(h('div', { class: 'portao-card' },
        h('h1', {}, 'ESPRO'),
        h('p', { class: 'muted' }, novo ? 'Crie sua conta com nome de usuário, e-mail e senha.' : 'Entre com seu e-mail e senha para continuar.'), f));
      f.querySelector('input')?.focus();
    };
    draw();
  }

  document.addEventListener('DOMContentLoaded', () => { Store.ready.then(portao); Sync.onChange(portao); });
  return { render };
})();
