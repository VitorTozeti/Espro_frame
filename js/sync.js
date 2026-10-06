/* Sincronização da equipe com o servidor (Cloudflare Pages Functions + D1).
   Protocolo: cada item tem `_u` (ms da última alteração) e vale "o último a editar vence".
   Itens apagados viram "tombstones"; a ordem das listas é sincronizada como um item `ordem`. */
const Sync = (() => {
  const AUTH = 'espro.auth', META = 'espro.sync';
  const lerLS = k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
  const gravaLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ok */ } };
  const ORDENAVEIS = ['setores', 'cards', 'eventos', 'paginas', 'edicoes'];

  let auth = lerLS(AUTH), meta = lerLS(META) || { cursor: 0, lastPush: 0, ordem: {}, midia: [] };
  let estado = auth ? 'ocioso' : 'off', ultimo = 0, erro = '', rodando = false, timer = 0, deb = 0;
  const ouvintes = new Set();
  const notifica = () => ouvintes.forEach(f => f());
  const salvaMeta = () => gravaLS(META, meta);

  async function api(caminho, { method = 'GET', body, texto } = {}) {
    const r = await fetch('/api/' + caminho, {
      method, headers: { ...(auth ? { authorization: 'Bearer ' + auth.token } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : texto,
    });
    const ct = r.headers.get('content-type') || '';
    const dados = ct.includes('json') ? await r.json() : await r.text();
    if (r.status === 401 && auth && caminho !== 'login') { sair(); throw new Error('Sessão expirada — entre de novo'); }
    if (!r.ok) throw new Error(dados?.erro || (r.status === 404 ? 'Servidor da equipe não encontrado (o site precisa estar na Cloudflare, com D1)' : 'Erro ' + r.status));
    return dados;
  }

  /* ───── enviar ───── */
  function itensParaEnviar() {
    const S = Store.get(), itens = [], ordemPend = {};
    for (const k of Store.SYNC_KINDS) for (const it of S[k] || []) if ((it._u || 0) >= meta.lastPush) itens.push({ kind: k, id: it.id, u: it._u || 0, del: 0, data: JSON.stringify(it) });
    for (const t of S.apagados || []) if (t._u >= meta.lastPush) itens.push({ kind: t.kind, id: t.id, u: t._u, del: 1, data: null });
    for (const m of ['empresa', 'marca']) if (S[m] && (S._metaU?.[m] || 0) >= meta.lastPush) itens.push({ kind: 'meta', id: m, u: S._metaU?.[m] || 0, del: 0, data: JSON.stringify(S[m]) });
    for (const k of ORDENAVEIS) {
      const sig = JSON.stringify((S[k] || []).map(x => x.id));
      if (meta.ordem[k]?.sig !== sig) { const u = Date.now(); itens.push({ kind: 'ordem', id: k, u, del: 0, data: sig }); ordemPend[k] = { sig, u }; }
    }
    return { itens, ordemPend };
  }

  /* ───── receber ───── */
  function aplicar(pull, limpar) {
    const ordens = {};
    Store.aplicarRemoto(S => {
      if (limpar) {                                        // aparelho virgem: troca os dados padrão pelos do servidor
        S.setores = []; S.paginas = []; S.edicoes = []; S.apagados = []; S._metaU = {}; delete S.edicaoAtiva; delete S.marca;
        S.empresa = { nome: 'Minha Empresa' };
      }
      S._metaU ||= {};
      for (const it of pull) {
        if (it.kind === 'meta') { if ((S._metaU[it.id] || 0) < it.u && it.data) { S[it.id] = JSON.parse(it.data); S._metaU[it.id] = it.u; } continue; }
        if (it.kind === 'ordem') { if ((meta.ordem[it.id]?.u || 0) < it.u && it.data) ordens[it.id] = { u: it.u, ids: JSON.parse(it.data) }; continue; }
        const lista = S[it.kind]; if (!lista) continue;
        const i = lista.findIndex(x => x.id === it.id), tomb = (S.apagados || []).find(t => t.kind === it.kind && t.id === it.id);
        if (it.del) {
          if (i >= 0 && (lista[i]._u || 0) < it.u) lista.splice(i, 1);
          if (!tomb || tomb._u < it.u) { S.apagados = (S.apagados || []).filter(t => !(t.kind === it.kind && t.id === it.id)); S.apagados.push({ kind: it.kind, id: it.id, _u: it.u }); }
        } else if (it.data) {
          if (tomb && tomb._u >= it.u) continue;                 // apagado aqui depois dessa edição
          const obj = JSON.parse(it.data); obj._u = it.u;
          if (i < 0) lista.push(obj); else if ((lista[i]._u || 0) < it.u) lista[i] = obj;
          if (tomb) S.apagados = S.apagados.filter(t => t !== tomb);
        }
      }
      for (const [k, { u, ids }] of Object.entries(ordens)) {
        const lista = S[k], pos = new Map(ids.map((id, i) => [id, i]));
        lista.sort((a, b) => (pos.has(a.id) ? pos.get(a.id) : 1e9) - (pos.has(b.id) ? pos.get(b.id) : 1e9));
        meta.ordem[k] = { sig: JSON.stringify(lista.map(x => x.id)), u };
      }
      if (limpar && !S.edicoes.length) S.edicoes.push({ id: Store.uid(), numero: 1, nome: '', data: new Date().toISOString().slice(0, 10), status: 'andamento', _u: 0 });
      if (!S.edicoes.some(e => e.id === S.edicaoAtiva)) S.edicaoAtiva = (S.edicoes.find(e => e.status !== 'publicada') || S.edicoes[S.edicoes.length - 1])?.id;
    });
  }
  async function baixarMidiaFaltante() {
    const S = Store.get();
    const json = JSON.stringify([S.paginas, S.versoes]);
    const refs = new Set([...json.matchAll(/img:([a-z0-9]+)/g)].map(m => m[1]));
    for (const id of refs) {
      if (id === 'ph' || S.midia[id]) continue;
      try { const d = await api('midia/' + encodeURIComponent(id)); if (typeof d === 'string') { S.midia[id] = d; if (!meta.midia.includes(id)) meta.midia.push(id); } } catch { /* tenta de novo na próxima */ }
    }
  }

  async function run() {
    if (!auth || rodando || !Store.get()) return;
    rodando = true; estado = 'sync'; notifica();
    try {
      const t0 = Date.now(), S = Store.get();
      for (const id of Object.keys(S.midia || {})) {                                 // 1) imagens novas
        if (id === 'ph' || meta.midia.includes(id)) continue;
        await api('midia/' + encodeURIComponent(id), { method: 'PUT', texto: S.midia[id] });
        meta.midia.push(id);
      }
      const { itens, ordemPend } = itensParaEnviar();                                // 2) alterações locais
      const pull = []; let cursor = meta.cursor, mais = true, primeira = true;
      while (mais) {
        const r = await api('sync', { method: 'POST', body: { cursor, push: primeira ? itens : [] } });
        primeira = false; cursor = r.cursor; pull.push(...r.pull); mais = r.mais;
      }
      meta.lastPush = t0; Object.assign(meta.ordem, ordemPend); meta.cursor = cursor;
      if (pull.length) aplicar(pull);                                                // 3) alterações dos colegas
      await baixarMidiaFaltante();
      salvaMeta(); ultimo = Date.now(); estado = 'ok'; erro = '';
    } catch (e) { estado = 'erro'; erro = e.message; }
    finally { rodando = false; notifica(); }
  }

  function agendar() {
    clearInterval(timer); timer = setInterval(run, 25000);
  }
  async function conectar(caminho, body) {
    const r = await api(caminho, { method: 'POST', body });
    auth = { token: r.token, nome: r.nome, email: r.email, cargo: r.cargo, setor: r.setor || '' }; gravaLS(AUTH, auth);
    meta = { cursor: 0, lastPush: 0, ordem: {}, midia: [] }; salvaMeta();
    /* 1º login: se este aparelho só tem os dados padrão e o servidor já tem dados, adota os do servidor (evita duplicar setores/edições e sobrescrever o nome da empresa) */
    let adotou = false;
    try {
      const pull = []; let cursor = 0, mais = true;
      while (mais) { const p = await api('sync', { method: 'POST', body: { cursor, push: [] } }); cursor = p.cursor; pull.push(...p.pull); mais = p.mais; }
      if (pull.length && Store.ehNovo()) { aplicar(pull, true); meta.cursor = cursor; meta.lastPush = Date.now(); salvaMeta(); adotou = true; }
    } catch { /* segue o caminho normal; o erro aparece na sincronização */ }
    if (!adotou) await Store.carimbarTudo();
    estado = 'ocioso'; agendar(); notifica();
    return run();
  }
  const entrar = (email, senha) => conectar('login', { email, senha });
  const criarConta = (nome, email, senha) => conectar('registrar', { nome, email, senha });
  async function atualizarCargo() {                       // o admin pode ter mudado o cargo desde o último acesso
    if (!auth) return;
    try { const r = await api('ping'); if (auth && (auth.cargo !== r.cargo || auth.nome !== r.nome || (auth.setor || '') !== (r.setor || ''))) { auth.cargo = r.cargo; auth.nome = r.nome; auth.setor = r.setor || ''; gravaLS(AUTH, auth); notifica(); } } catch { /* ok */ }
  }
  function sair() {
    auth = null; estado = 'off'; clearInterval(timer);
    try { localStorage.removeItem(AUTH); localStorage.removeItem(META); } catch { /* ok */ }
    meta = { cursor: 0, lastPush: 0, ordem: {}, midia: [] }; equipeLista = null; equipeBusca = null; notifica();
  }
  async function presenca(pid) {
    if (!auth) return [];
    try { return (await api('presence', { method: 'POST', body: { pagina: pid } })).editando || []; } catch { return []; }
  }

  /* lista de contas da equipe (qualquer pessoa logada lê): base do rodízio do Diário de bordo */
  let equipeLista = null, equipeBusca = null;
  const carregarEquipe = (forcar) => {
    if (!auth) return Promise.resolve([]);
    if (forcar || !equipeBusca) equipeBusca = api('equipe').then(r => { equipeLista = r.usuarios; notifica(); return equipeLista; }).catch(() => { equipeBusca = null; return equipeLista || []; });
    return equipeBusca;
  };

  Store.ready.then(() => {
    Store.onCommit(() => { if (!auth) return; clearTimeout(deb); deb = setTimeout(run, 4000); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) run(); else if (auth) { clearTimeout(deb); run(); } });   // ao sair da aba, envia o que falta
    if (auth) { agendar(); run(); atualizarCargo(); }
  });

  return {
    conectado: () => !!auth, usuario: () => auth?.nome || '', email: () => auth?.email || '', setor: () => auth?.setor || '', equipe: () => equipeLista, carregarEquipe, cargo: () => auth?.cargo || '', gestor: () => ['admin', 'gestor'].includes(auth?.cargo),
    estado: () => ({ estado, ultimo, erro, nome: auth?.nome || '' }),
    entrar, criarConta, sair, run, presenca, api, onChange: fn => ouvintes.add(fn), offChange: fn => ouvintes.delete(fn),
    /* só para testes */ _meta: () => meta,
  };
})();

/* Bloco "Equipe na nuvem" do menu Empresa */
const CARGO_ROTULO = { admin: 'Administrador', gestor: 'Gestor(a)', membro: 'Sem cargo' };
function equipeSecao() {
  const box = h('div', { class: 'equipe' });
  let modo = 'entrar', lista = null, carregando = false;
  const carregaLista = async () => {
    if (carregando) return; carregando = true;
    try { lista = (await Sync.api('equipe')).usuarios; } catch { lista = []; }
    carregando = false; draw();
  };
  const painelAdmin = () => {
    if (lista === null) { carregaLista(); return h('p', { class: 'muted' }, 'Carregando equipe…'); }
    const linhas = lista.map(u => {
      const fixo = u.cargo === 'admin';
      const sel = h('select', { class: 'input', 'aria-label': 'Cargo de ' + u.nome, disabled: fixo, onchange: async ev => {
        try { await Sync.api('equipe', { method: 'PUT', body: { email: u.email, cargo: ev.target.value } }); toast('Cargo atualizado'); } catch (er) { toast(er.message); }
        lista = null; draw();
      } }, ...(fixo ? ['admin'] : ['membro', 'gestor']).map(c => h('option', { value: c, selected: c === u.cargo }, CARGO_ROTULO[c])));
      const setorSel = h('select', { class: 'input', 'aria-label': 'Setor de ' + u.nome, onchange: async ev => {
        try { await Sync.api('equipe', { method: 'PUT', body: { email: u.email, setor: ev.target.value } }); toast('Setor atualizado'); Sync.carregarEquipe(true); } catch (er) { toast(er.message); }
        lista = null; draw();
      } }, h('option', { value: '' }, 'Sem setor'), ...Store.get().setores.map(s => h('option', { value: s.id, selected: s.id === u.setor }, s.nome)));
      return h('li', { class: 'equipe-item' }, h('div', {}, h('b', {}, u.nome), h('div', { class: 'muted' }, u.email)), sel, setorSel,
        fixo ? null : h('button', { type: 'button', class: 'btn ghost small', 'aria-label': 'Remover ' + u.nome, onclick: async () => {
          if (!confirm('Remover ' + u.nome + ' da equipe? A conta será apagada.')) return;
          try { await Sync.api('equipe/' + encodeURIComponent(u.email), { method: 'DELETE' }); toast('Removido'); } catch (er) { toast(er.message); }
          lista = null; draw();
        } }, 'Remover'));
    });
    return h('div', {}, h('h4', {}, 'Gerenciar cargos'), h('p', { class: 'muted hint' }, 'Quem cria uma conta entra sem cargo e sem setor. Defina aqui quem é gestor(a) e o setor de cada pessoa.'), h('ul', { class: 'equipe-lista' }, ...linhas));
  };
  const draw = () => {
    if (!box.isConnected && box._ligado) return Sync.offChange(draw);
    box._ligado = true;
    const e = Sync.estado();
    const status = { off: '', ocioso: 'Aguardando…', sync: 'Sincronizando…', ok: `Sincronizado ${quando(e.ultimo)}`, erro: 'Erro: ' + e.erro }[e.estado];
    if (!Sync.conectado()) {
      const novo = modo === 'criar';
      const f = h('form', { class: 'form', onsubmit: async ev => {
        ev.preventDefault();
        const d = Object.fromEntries(new FormData(f)), b = f.querySelector('button[type=submit]');
        b.disabled = true; b.textContent = novo ? 'Criando…' : 'Entrando…';
        try { await (novo ? Sync.criarConta(d.nome, d.email, d.senha) : Sync.entrar(d.email, d.senha)); toast(novo ? 'Conta criada' : 'Conectado à equipe'); } catch (er) { toast(er.message); }
        draw();
      } },
        h('p', { class: 'muted hint' }, novo ? 'Crie sua conta para trabalhar em equipe. Você entra sem cargo; o administrador pode torná-lo(a) gestor(a).' : 'Entre com seu e-mail e senha para trabalhar em equipe (todos veem e editam a mesma revista).'),
        novo ? field('Seu nome', input('nome', perfil(), { required: true, autocomplete: 'name' })) : null,
        field('E-mail', input('email', '', { type: 'email', required: true, autocomplete: 'email' })),
        field('Senha', input('senha', '', { type: 'password', required: true, minlength: 6, autocomplete: novo ? 'new-password' : 'current-password' })),
        h('button', { class: 'btn primary', type: 'submit' }, novo ? 'Criar conta' : 'Entrar'),
        h('button', { class: 'btn ghost', type: 'button', onclick: () => { modo = novo ? 'entrar' : 'criar'; draw(); } }, novo ? 'Já tenho conta' : 'Criar conta'));
      box.replaceChildren(h('h4', {}, 'Equipe na nuvem'), f);
      return;
    }
    box.replaceChildren(h('h4', {}, 'Equipe na nuvem'),
      h('p', {}, h('b', {}, `Conectado como ${e.nome}`), ' · ', CARGO_ROTULO[Sync.cargo()] || 'Sem cargo', Sync.setor() ? ' · ' + nomeSetor(Sync.setor()) : ''), h('p', { class: 'muted' }, status),
      h('div', { class: 'row-btn' },
        h('button', { type: 'button', class: 'btn small', onclick: () => Sync.run() }, 'Sincronizar agora'),
        h('button', { type: 'button', class: 'btn ghost small', onclick: () => { Sync.sair(); lista = null; draw(); } }, 'Sair da equipe'),
        'Notification' in window && Notification.permission === 'default'
          ? h('button', { type: 'button', class: 'btn small', onclick: async () => { await Notification.requestPermission(); draw(); } }, 'Ativar avisos do navegador') : null),
      Sync.cargo() === 'admin' ? painelAdmin() : null);
  };
  Sync.onChange(draw); draw();
  return box;
}
