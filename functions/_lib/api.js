/* API da equipe (Cloudflare Pages Functions + D1).
   Este arquivo é PURO: recebe `repo` (D1 em produção, memória nos testes). Sem imports. */

const enc = new TextEncoder();
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
async function hmac(secret, data) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64u(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
}
function iguais(a, b) {                                // comparação em tempo constante
  a = String(a); b = String(b);
  let r = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) r |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return r === 0;
}
export async function criarToken(nome, secret, dias = 30) {
  const payload = b64u(enc.encode(JSON.stringify({ n: nome, e: Date.now() + dias * 864e5 })));
  return payload + '.' + await hmac(secret, payload);
}
export async function lerToken(token, secret) {
  const [p, sig] = String(token || '').split('.');
  if (!p || !sig || !secret) return null;
  if (!iguais(sig, await hmac(secret, p))) return null;
  try { const d = JSON.parse(new TextDecoder().decode(fromB64u(p))); return d.e > Date.now() ? d : null; } catch { return null; }
}

const KINDS = new Set(['setores', 'cards', 'eventos', 'paginas', 'comentarios', 'versoes', 'edicoes', 'meta', 'ordem']);
const ID_PUB = /^[a-z0-9]{8,40}$/, MAX_PUB = 1_800_000;
const MAX_ITEM = 1_500_000, MAX_MIDIA = 3_000_000, TAM_PAGINA = 500;

export async function handle(request, env, repo) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
  const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
  try {
    if (path[0] === 'login' && request.method === 'POST') {
      if (!env.TEAM_CODE || !env.TOKEN_SECRET) return json({ erro: 'Servidor sem TEAM_CODE/TOKEN_SECRET configurados' }, 500);
      const { nome, codigo } = await request.json();
      if (!String(nome || '').trim() || !iguais(codigo || '', env.TEAM_CODE)) return json({ erro: 'Nome ou código da equipe inválido' }, 401);
      const limpo = String(nome).trim().slice(0, 40);
      return json({ token: await criarToken(limpo, env.TOKEN_SECRET), nome: limpo });
    }
    /* leitura pública de uma edição publicada (sem login): página HTML e suas imagens */
    if (path[0] === 'p' && path[1] && request.method === 'GET') {
      const r = ID_PUB.test(path[1]) ? await repo.getPublico(path[1]) : null;
      if (!r) return new Response('Revista não encontrada', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
      return new Response(r.html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=60', 'x-content-type-options': 'nosniff',
        'content-security-policy': "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'" } });
    }
    if (path[0] === 'pm' && path[1] && request.method === 'GET') {
      const d = path[1].length <= 80 ? await repo.getMidia(path[1]) : null;
      const m = d && /^data:(image\/[a-z0-9.+-]+)((?:;[a-z0-9=-]+)*),([\s\S]*)$/i.exec(d);
      if (!m) return new Response('Imagem não encontrada', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
      const corpo = /;base64/i.test(m[2]) ? Uint8Array.from(atob(m[3]), c => c.charCodeAt(0)) : decodeURIComponent(m[3]);
      return new Response(corpo, { headers: { 'content-type': m[1], 'cache-control': 'public, max-age=31536000, immutable', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; sandbox" } });
    }
    const auth = await lerToken((request.headers.get('authorization') || '').replace(/^Bearer\s+/i, ''), env.TOKEN_SECRET);
    if (!auth) return json({ erro: 'Não autorizado' }, 401);

    if (path[0] === 'sync' && request.method === 'POST') {
      const body = await request.json();
      const push = Array.isArray(body.push) ? body.push.slice(0, 2000) : [];
      let aplicados = 0;
      for (const it of push) {
        if (!it || !KINDS.has(it.kind) || typeof it.id !== 'string' || it.id.length > 80 || !Number.isFinite(it.u)) continue;
        if (it.data != null && (typeof it.data !== 'string' || it.data.length > MAX_ITEM)) continue;
        if (await repo.aplicar({ kind: it.kind, id: it.id, u: Math.floor(it.u), del: it.del ? 1 : 0, data: it.del ? null : it.data })) aplicados++;
      }
      const r = await repo.mudancasDesde(Number(body.cursor) || 0, TAM_PAGINA);
      return json({ cursor: r.cursor, pull: r.itens, mais: r.itens.length >= TAM_PAGINA, aplicados });
    }
    if (path[0] === 'midia') {
      if (request.method === 'GET' && !path[1]) return json({ ids: await repo.listaMidia() });
      const id = path[1];
      if (!id || id.length > 80) return json({ erro: 'id inválido' }, 400);
      if (request.method === 'GET') { const d = await repo.getMidia(id); return d ? new Response(d, { headers: { 'content-type': 'text/plain', 'cache-control': 'private, max-age=31536000, immutable' } }) : json({ erro: 'não encontrada' }, 404); }
      if (request.method === 'PUT') {
        const d = await request.text();
        if (!/^data:image\/[a-z0-9.+-]+[;,]/i.test(d) || d.length > MAX_MIDIA) return json({ erro: 'imagem inválida ou grande demais' }, 400);
        await repo.putMidia(id, d); return json({ ok: true });
      }
    }
    if (path[0] === 'publicar') {
      const id = path[1] || '';
      if (request.method === 'DELETE' && ID_PUB.test(id)) { await repo.despublicar(id); return json({ ok: true }); }
      if (request.method === 'POST') {
        const b = await request.json();
        if (!ID_PUB.test(String(b.id || '')) || typeof b.html !== 'string' || b.html.length > MAX_PUB) return json({ erro: 'publicação inválida ou grande demais' }, 400);
        await repo.publicar(b.id, String(b.nome || '').slice(0, 120), b.html, Date.now());
        return json({ ok: true, id: b.id });
      }
    }
    if (path[0] === 'presence' && request.method === 'POST') {
      const { pagina } = await request.json();
      if (typeof pagina !== 'string' || pagina.length > 80) return json({ erro: 'pagina inválida' }, 400);
      const agora = Date.now();
      await repo.presenca(pagina, auth.n, agora);
      return json({ editando: (await repo.presentes(pagina, agora - 45000)).filter(n => n !== auth.n) });
    }
    if (path[0] === 'ping') return json({ ok: true, nome: auth.n });
    return json({ erro: 'Rota inexistente' }, 404);
  } catch (e) {
    return json({ erro: String(e?.message || e) }, 500);
  }
}
