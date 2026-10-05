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
  function aplicar(pull) {
    const ordens = {};
    Store.aplicarRemoto(S => {
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
  async function entrar(nome, codigo) {
    const r = await api('login', { method: 'POST', body: { nome, codigo } });
    auth = { token: r.token, nome: r.nome }; gravaLS(AUTH, auth);
    meta = { cursor: 0, lastPush: 0, ordem: {}, midia: [] }; salvaMeta();
    await Store.carimbarTudo();
    estado = 'ocioso'; agendar(); notifica();
    return run();
  }
  function sair() {
    auth = null; estado = 'off'; clearInterval(timer);
    try { localStorage.removeItem(AUTH); localStorage.removeItem(META); } catch { /* ok */ }
    meta = { cursor: 0, lastPush: 0, ordem: {}, midia: [] }; notifica();
  }
  async function presenca(pid) {
    if (!auth) return [];
    try { return (await api('presence', { method: 'POST', body: { pagina: pid } })).editando || []; } catch { return []; }
  }

  Store.ready.then(() => {
    Store.onCommit(() => { if (!auth) return; clearTimeout(deb); deb = setTimeout(run, 4000); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) run(); });
    if (auth) { agendar(); run(); }
  });

  return {
    conectado: () => !!auth, usuario: () => auth?.nome || '',
    estado: () => ({ estado, ultimo, erro, nome: auth?.nome || '' }),
    entrar, sair, run, presenca, api, onChange: fn => ouvintes.add(fn), offChange: fn => ouvintes.delete(fn),
    /* só para testes */ _meta: () => meta,
  };
})();

/* Bloco "Equipe na nuvem" do menu Empresa */
function equipeSecao() {
  const box = h('div', { class: 'equipe' });
  const draw = () => {
    if (!box.isConnected && box._ligado) return Sync.offChange(draw);
    box._ligado = true;
    const e = Sync.estado();
    const status = { off: '', ocioso: 'Aguardando…', sync: 'Sincronizando…', ok: `Sincronizado ${quando(e.ultimo)}`, erro: 'Erro: ' + e.erro }[e.estado];
    if (!Sync.conectado()) {
      const f = h('form', { class: 'form', onsubmit: async ev => {
        ev.preventDefault();
        const d = Object.fromEntries(new FormData(f)), b = f.querySelector('button');
        b.disabled = true; b.textContent = 'Entrando…';
        try { await Sync.entrar(d.nome, d.codigo); toast('Conectado à equipe'); } catch (er) { toast(er.message); }
        draw();
      } },
        h('p', { class: 'muted hint' }, 'Para trabalhar em equipe (todos veem e editam a mesma revista), entre com seu nome e o código da equipe. Precisa do servidor publicado na Cloudflare.'),
        h('div', { class: 'row' }, field('Seu nome', input('nome', perfil(), { required: true })), field('Código da equipe', input('codigo', '', { type: 'password', required: true, autocomplete: 'current-password' }))),
        h('button', { class: 'btn primary', type: 'submit' }, 'Entrar na equipe'));
      box.replaceChildren(h('h4', {}, 'Equipe na nuvem'), f);
      return;
    }
    box.replaceChildren(h('h4', {}, 'Equipe na nuvem'),
      h('p', {}, h('b', {}, `Conectado como ${e.nome}`)), h('p', { class: 'muted' }, status),
      h('div', { class: 'row-btn' },
        h('button', { type: 'button', class: 'btn small', onclick: () => Sync.run() }, 'Sincronizar agora'),
        h('button', { type: 'button', class: 'btn ghost small', onclick: () => { Sync.sair(); draw(); } }, 'Sair da equipe'),
        'Notification' in window && Notification.permission === 'default'
          ? h('button', { type: 'button', class: 'btn small', onclick: async () => { await Notification.requestPermission(); draw(); } }, 'Ativar avisos do navegador') : null));
  };
  Sync.onChange(draw); draw();
  return box;
}
