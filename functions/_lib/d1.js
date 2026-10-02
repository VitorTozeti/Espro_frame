/* Repositório sobre Cloudflare D1 (binding `DB`). Esquema em /schema.sql. */
export function repoD1(db) {
  return {
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
    async mudancasDesde(cursor, limite) {
      const rs = await db.prepare('SELECT kind, id, u, del, data, rev FROM items WHERE rev > ?1 ORDER BY rev LIMIT ?2').bind(cursor, limite).all();
      const itens = rs.results || [];
      return { cursor: itens.length ? itens[itens.length - 1].rev : cursor, itens: itens.map(r => ({ kind: r.kind, id: r.id, u: r.u, del: r.del, data: r.data })) };
    },
    async getMidia(id) { const r = await db.prepare('SELECT data FROM midia WHERE id = ?1').bind(id).first(); return r?.data || null; },
    async putMidia(id, data) { await db.prepare('INSERT INTO midia (id, data) VALUES (?1, ?2) ON CONFLICT(id) DO NOTHING').bind(id, data).run(); },
    async listaMidia() { const rs = await db.prepare('SELECT id FROM midia').all(); return (rs.results || []).map(r => r.id); },
    async presenca(pagina, nome, ts) {
      await db.prepare('INSERT INTO presence (pagina, nome, ts) VALUES (?1, ?2, ?3) ON CONFLICT(pagina, nome) DO UPDATE SET ts = excluded.ts').bind(pagina, nome, ts).run();
    },
    async presentes(pagina, desde) {
      const rs = await db.prepare('SELECT nome FROM presence WHERE pagina = ?1 AND ts > ?2').bind(pagina, desde).all();
      return (rs.results || []).map(r => r.nome);
    },
  };
}
