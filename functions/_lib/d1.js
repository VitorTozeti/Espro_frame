/* Repositório sobre Cloudflare D1 (binding `DB`). Esquema em /schema.sql (as tabelas também são criadas sozinhas no 1º acesso). */
const ESQUEMA = [
  'CREATE TABLE IF NOT EXISTS items (kind TEXT NOT NULL, id TEXT NOT NULL, u INTEGER NOT NULL, del INTEGER NOT NULL DEFAULT 0, data TEXT, rev INTEGER NOT NULL, PRIMARY KEY (kind, id))',
  'CREATE INDEX IF NOT EXISTS idx_items_rev ON items (rev)',
  'CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v INTEGER NOT NULL)',
  "INSERT OR IGNORE INTO meta (k, v) VALUES ('rev', 0)",
  'CREATE TABLE IF NOT EXISTS midia (id TEXT PRIMARY KEY, data TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS presence (pagina TEXT NOT NULL, nome TEXT NOT NULL, ts INTEGER NOT NULL, PRIMARY KEY (pagina, nome))',
  'CREATE TABLE IF NOT EXISTS publico (id TEXT PRIMARY KEY, nome TEXT NOT NULL, html TEXT NOT NULL, u INTEGER NOT NULL)',
  'CREATE TABLE IF NOT EXISTS config (k TEXT PRIMARY KEY, v TEXT NOT NULL)',
  "CREATE TABLE IF NOT EXISTS usuarios (email TEXT PRIMARY KEY, nome TEXT NOT NULL, cargo TEXT NOT NULL DEFAULT 'membro', salt TEXT NOT NULL, hash TEXT NOT NULL, criado INTEGER NOT NULL)",
];
let pronto = false;
export function repoD1(db) {
  return {
    async preparar() {
      if (pronto) return;
      for (const sql of ESQUEMA) await db.prepare(sql).run();
      try { await db.prepare("ALTER TABLE usuarios ADD COLUMN setor TEXT NOT NULL DEFAULT ''").run(); } catch { /* coluna já existe */ }
      pronto = true;
    },
    async segredo() {                                   // chave que assina os logins; criada sozinha e guardada no D1
      let r = await db.prepare("SELECT v FROM config WHERE k = 'secret'").first();
      if (!r) {
        const v = [...crypto.getRandomValues(new Uint8Array(32))].map(b => b.toString(16).padStart(2, '0')).join('');
        await db.prepare("INSERT OR IGNORE INTO config (k, v) VALUES ('secret', ?1)").bind(v).run();
        r = await db.prepare("SELECT v FROM config WHERE k = 'secret'").first();
      }
      return r.v;
    },
    async getUsuario(email) { return await db.prepare('SELECT email, nome, cargo, setor, salt, hash FROM usuarios WHERE email = ?1').bind(email).first(); },
    async criarUsuario(u) { await db.prepare('INSERT INTO usuarios (email, nome, cargo, salt, hash, criado) VALUES (?1, ?2, ?3, ?4, ?5, ?6)').bind(u.email, u.nome, u.cargo, u.salt, u.hash, u.criado).run(); },
    async listaUsuarios() { return (await db.prepare('SELECT email, nome, cargo, setor FROM usuarios ORDER BY nome').all()).results || []; },
    async setCargo(email, cargo) { await db.prepare('UPDATE usuarios SET cargo = ?2 WHERE email = ?1').bind(email, cargo).run(); },
    async setSetor(email, setor) { await db.prepare('UPDATE usuarios SET setor = ?2 WHERE email = ?1').bind(email, setor).run(); },
    async removeUsuario(email) { await db.prepare('DELETE FROM usuarios WHERE email = ?1').bind(email).run(); },
    /* "último a editar vence": só grava se o carimbo for mais novo que o existente */
    async aplicar(it) {
      const atual = await db.prepare('SELECT u FROM items WHERE kind = ?1 AND id = ?2').bind(it.kind, it.id).first();
      if (atual && atual.u >= it.u) return false;
      const row = await db.prepare("UPDATE meta SET v = v + 1 WHERE k = 'rev' RETURNING v").first();
      await db.prepare(
        'INSERT INTO items (kind, id, u, del, data, rev) VALUES (?1, ?2, ?3, ?4, ?5, ?6) ' +
        'ON CONFLICT(kind, id) DO UPDATE SET u = excluded.u, del = excluded.del, data = excluded.data, rev = excluded.rev'
      ).bind(it.kind, it.id, it.u, it.del, it.data, row.v).run();
      return true;
    },
    async getItem(kind, id) { return await db.prepare('SELECT u, del, data FROM items WHERE kind = ?1 AND id = ?2').bind(kind, id).first(); },
    async mudancasDesde(cursor, limite) {
      const rs = await db.prepare('SELECT kind, id, u, del, data, rev FROM items WHERE rev > ?1 ORDER BY rev LIMIT ?2').bind(cursor, limite).all();
      const itens = rs.results || [];
      return { cursor: itens.length ? itens[itens.length - 1].rev : cursor, itens: itens.map(r => ({ kind: r.kind, id: r.id, u: r.u, del: r.del, data: r.data })) };
    },
    async getMidia(id) { const r = await db.prepare('SELECT data FROM midia WHERE id = ?1').bind(id).first(); return r?.data || null; },
    async putMidia(id, data) { await db.prepare('INSERT INTO midia (id, data) VALUES (?1, ?2) ON CONFLICT(id) DO NOTHING').bind(id, data).run(); },
    async listaMidia() { const rs = await db.prepare('SELECT id FROM midia').all(); return (rs.results || []).map(r => r.id); },
    async publicar(id, nome, html, u) {
      await db.prepare('INSERT INTO publico (id, nome, html, u) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(id) DO UPDATE SET nome = excluded.nome, html = excluded.html, u = excluded.u').bind(id, nome, html, u).run();
    },
    async despublicar(id) { await db.prepare('DELETE FROM publico WHERE id = ?1').bind(id).run(); },
    async getPublico(id) { return await db.prepare('SELECT nome, html FROM publico WHERE id = ?1').bind(id).first(); },
    async presenca(pagina, nome, ts) {
      await db.prepare('INSERT INTO presence (pagina, nome, ts) VALUES (?1, ?2, ?3) ON CONFLICT(pagina, nome) DO UPDATE SET ts = excluded.ts').bind(pagina, nome, ts).run();
    },
    async presentes(pagina, desde) {
      const rs = await db.prepare('SELECT nome FROM presence WHERE pagina = ?1 AND ts > ?2').bind(pagina, desde).all();
      return (rs.results || []).map(r => r.nome);
    },
  };
}
