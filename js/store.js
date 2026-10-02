/* Estado do app. Persiste em IndexedDB (aguenta as imagens da revista); se o navegador não oferecer,
   cai para localStorage. A interface pública (get/upsert/remove/move) foi pensada para ser trocada
   por chamadas à API (Cloudflare D1/R2) sem mexer nas telas. Use `await Store.ready` antes de ler. */
const Store = (() => {
  const KEY = 'espro.v1', DB = 'espro', KV = 'kv';
  const COLS = [
    { id: 'todo', nome: 'A fazer' },
    { id: 'doing', nome: 'Fazendo' },
    { id: 'review', nome: 'Revisão' },
    { id: 'done', nome: 'Pronto' },
  ];
  const CORES = ['#4D7C0F', '#2563EB', '#C2410C', '#9333EA', '#0E7490', '#BE123C', '#A16207', '#475569', '#DB2777'];
  const SETORES = [['Moda', '#BE123C'], ['Geek', '#9333EA'], ['Pop', '#DB2777'], ['Eventos', '#0E7490'],
    ['Notícias Gerais', '#2563EB'], ['RH', '#4D7C0F'], ['Marketing', '#A16207']];
  const VERSION = 2;
  const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);

  const seed = () => ({
    v: VERSION,
    empresa: { nome: 'Minha Empresa' },
    setores: SETORES.map(([nome, cor]) => ({ id: uid(), nome, cor })),
    cards: [],
    eventos: [],
    paginas: [
      { id: uid(), tpl: 'capa', titulo: 'Edição nº 1', texto: 'A revista da nossa empresa', img: '' },
      { id: uid(), tpl: 'sumario', titulo: 'Nesta edição', texto: '', img: '' },
      { id: uid(), tpl: 'contracapa', titulo: 'Até a próxima', texto: 'Obrigado por ler.', img: '' },
    ],
  });

  /* hash rápido (cyrb53) para não guardar a mesma imagem duas vezes */
  function hash(str) {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) { const c = str.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36) + str.length.toString(36);
  }
  function addMidia(data) {                         // devolve 'img:<id>' (a imagem fica em state.midia, sem duplicar)
    if (typeof data !== 'string' || !data.startsWith('data:')) return data;
    const id = hash(data); state.midia ||= {};
    if (!state.midia[id]) state.midia[id] = data;
    return 'img:' + id;
  }
  function migrateMidia() {                         // imagens antigas (data-URL dentro da página) → biblioteca
    let mudou = false;
    for (const p of state.paginas) {
      for (const o of (p.objs || p.imgs || [])) if (typeof o.src === 'string' && o.src.startsWith('data:')) { o.src = addMidia(o.src); mudou = true; }
      if (typeof p.img === 'string' && p.img.startsWith('data:')) { p.img = addMidia(p.img); mudou = true; }
    }
    return mudou;
  }

  /* coleções sincronizáveis; cada item guarda `_u` (ms da última alteração) para "último a editar vence" */
  const SYNC_KINDS = ['setores', 'cards', 'eventos', 'paginas', 'comentarios', 'versoes'];
  const STATUS_DE_COL = { todo: 'rascunho', doing: 'rascunho', review: 'revisao', done: 'pronta' };
  const COL_DE_STATUS = { rascunho: 'doing', revisao: 'review', pronta: 'done' };
  const carimba = (kind, item) => { if (SYNC_KINDS.includes(kind) && item) item._u = Date.now(); };
  function tombstone(kind, id) {
    if (!SYNC_KINDS.includes(kind)) return;
    state.apagados = (state.apagados || []).filter(t => !(t.kind === kind && t.id === id));
    state.apagados.push({ kind, id, _u: Date.now() });
    if (state.apagados.length > 600) state.apagados.splice(0, state.apagados.length - 600);
  }
  const semTombstone = (kind, id) => { state.apagados = (state.apagados || []).filter(t => !(t.kind === kind && t.id === id)); };
  /* página.status <-> coluna da tarefa ligada (cardId / paginaId) */
  function sincronizaVinculo(kind, item, antes) {
    if (kind === 'cards' && item.paginaId && antes?.col !== item.col) {
      const p = state.paginas.find(x => x.id === item.paginaId), st = STATUS_DE_COL[item.col];
      if (p && p.status !== st && !(item.col === 'todo' && p.status === 'rascunho')) { p.status = st; carimba('paginas', p); }
    }
    if (kind === 'paginas' && item.cardId && antes?.status !== item.status) {
      const c = state.cards.find(x => x.id === item.cardId);
      if (c && STATUS_DE_COL[c.col] !== item.status) { c.col = COL_DE_STATUS[item.status]; carimba('cards', c); }
    }
  }
  const onCommit = new Set();

  let state = null, db = null;
  const subs = new Set();

  /* ───── persistência ───── */
  const openDB = () => new Promise((res, rej) => {
    if (!window.indexedDB) return rej(new Error('sem IndexedDB'));
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(KV);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  const reqP = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  async function persist() {
    if (!db) { localStorage.setItem(KEY, JSON.stringify(state)); return; }
    const tx = db.transaction(KV, 'readwrite');
    tx.objectStore(KV).put(state, 'state');
    await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });
  }
  let timer = 0, waiters = [];
  function save() {                                  // agrupa gravações; resolve com true/false
    return new Promise(res => {
      waiters.push(res); clearTimeout(timer);
      timer = setTimeout(async () => {
        timer = 0;
        const ws = waiters; waiters = [];
        let ok = true;
        try { await persist(); } catch { ok = false; Store.onError?.(); }
        ws.forEach(f => f(ok));
      }, 150);
    });
  }
  addEventListener('pagehide', () => { if (timer) { clearTimeout(timer); timer = 0; persist().catch(() => {}); } });

  /* v2: setores padrão da revista. Mantém os que têm o mesmo nome; o resto vai para o 1º setor. */
  function migrate() {
    const novos = SETORES.map(([nome, cor]) => ({ id: state.setores.find(s => s.nome === nome)?.id || uid(), nome, cor }));
    const ids = new Set(novos.map(s => s.id));
    const fix = id => (ids.has(id) ? id : novos[0].id);
    state.cards.forEach(c => { c.setor = fix(c.setor); });
    state.eventos.forEach(e => { if (e.setor) e.setor = fix(e.setor); });
    state.setores = novos; state.v = VERSION;
  }

  const ready = (async () => {
    let raw = null, deLS = false;
    try { db = await openDB(); raw = await reqP(db.transaction(KV).objectStore(KV).get('state')); } catch { db = null; }
    if (!raw) { try { raw = JSON.parse(localStorage.getItem(KEY)); deLS = !!raw; } catch { raw = null; } }
    state = raw && Array.isArray(raw.setores) ? raw : seed();
    if (state.v !== VERSION) migrate();
    state.midia ||= {}; state.comentarios ||= []; state.versoes ||= []; state.apagados ||= []; state._metaU ||= {};
    const migrou = migrateMidia();
    if (db && (deLS || !raw || migrou)) {                      // 1ª vez no IndexedDB: grava e só então apaga a cópia antiga
      try { await persist(); if (deLS) localStorage.removeItem(KEY); } catch { /* mantém o localStorage */ }
    }
  })();

  function commit(opts) {
    const p = save();
    onCommit.forEach(fn => fn());
    if (!opts?.silent) subs.forEach(fn => fn());
    return p;
  }

  return {
    COLS, CORES, uid, ready, onError: null, addMidia, touch: () => commit(),
    SYNC_KINDS, onCommit: fn => onCommit.add(fn),
    touchMeta(nome) { state._metaU[nome] = Date.now(); return commit(); },
    /* aplica mudanças vindas do servidor sem carimbar de novo */
    aplicarRemoto(fn) { fn(state); return commit(); },
    carimbarTudo() { const t = Date.now(); for (const k of SYNC_KINDS) for (const it of state[k] || []) if (!it._u) it._u = t; state._metaU.empresa ||= t; state._metaU.marca ||= t; return commit({ silent: true }); },
    get: () => state,
    subscribe: fn => subs.add(fn),
    upsert(kind, item, opts) {
      const list = state[kind];
      const i = list.findIndex(x => x.id === item.id), antes = i >= 0 ? { ...list[i] } : null;
      carimba(kind, item); semTombstone(kind, item.id);
      if (i >= 0) list[i] = item; else list.push(item);
      sincronizaVinculo(kind, item, antes);
      return commit(opts);
    },
    insertAfter(kind, afterId, item, opts) {            // coloca o item logo depois de outro (ordem importa nas páginas)
      const list = state[kind], i = list.findIndex(x => x.id === afterId);
      carimba(kind, item);
      list.splice(i < 0 ? list.length : i + 1, 0, item);
      return commit(opts);
    },
    remove(kind, id, opts) {                         // devolve {item, index} para permitir "Desfazer"
      const list = state[kind], index = list.findIndex(x => x.id === id);
      if (index < 0) return null;
      const [item] = list.splice(index, 1);
      tombstone(kind, id);
      commit(opts);
      return { item, index };
    },
    restore(kind, item, index) {
      carimba(kind, item); semTombstone(kind, item.id);
      state[kind].splice(Math.min(index, state[kind].length), 0, item);
      return commit();
    },
    move(kind, id, dir) {
      const list = state[kind];
      const i = list.findIndex(x => x.id === id), j = i + dir;
      if (i < 0 || j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j], list[i]];
      commit();
    },
    swap(kind, idA, idB) {
      const l = state[kind], i = l.findIndex(x => x.id === idA), j = l.findIndex(x => x.id === idB);
      if (i < 0 || j < 0) return;
      [l[i], l[j]] = [l[j], l[i]];
      commit();
    },
    /* Coloca o cartão na coluna `col`, antes do cartão `beforeId` (ou no fim da coluna). */
    placeCard(id, col, beforeId) {
      const list = state.cards, i = list.findIndex(x => x.id === id);
      if (i < 0) return;
      const [c] = list.splice(i, 1), colAntes = c.col; c.col = col; carimba('cards', c); sincronizaVinculo('cards', c, { col: colAntes });
      let at = beforeId ? list.findIndex(x => x.id === beforeId) : -1;
      if (at < 0) { at = list.length; for (let k = list.length - 1; k >= 0; k--) if (list[k].col === col) { at = k + 1; break; } }
      list.splice(at, 0, c);
      return commit();
    },
    setEmpresa(nome) { state.empresa.nome = nome; state._metaU.empresa = Date.now(); return commit(); },
    exportJSON: () => JSON.stringify(state, null, 2),
    importJSON(text) {
      const d = JSON.parse(text);
      if (!d || !Array.isArray(d.setores) || !Array.isArray(d.cards)) throw new Error('Arquivo inválido');
      state = d;
      if (state.v !== VERSION) migrate();
      state.midia ||= {}; state.comentarios ||= []; state.versoes ||= []; state.apagados ||= []; state._metaU ||= {};
      return commit();
    },
  };
})();
