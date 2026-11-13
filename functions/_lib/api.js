/* API da equipe (Cloudflare Pages Functions + D1).
   Recebe `repo` (D1 em produção, memória nos testes). Avisos/push/e-mail em ./avisos.js. */
import { vapid, notificar, eventosDoCartao, lembretesDePrazo, enviarEmail, emailAtivo } from './avisos.js';

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
export async function criarToken(nome, email, secret, dias = 30) {
  const payload = b64u(enc.encode(JSON.stringify({ n: nome, m: email, e: Date.now() + dias * 864e5 })));
  return payload + '.' + await hmac(secret, payload);
}
export async function lerToken(token, secret) {
  const [p, sig] = String(token || '').split('.');
  if (!p || !sig || !secret) return null;
  if (!iguais(sig, await hmac(secret, p))) return null;
  try { const d = JSON.parse(new TextDecoder().decode(fromB64u(p))); return d.e > Date.now() ? d : null; } catch { return null; }
}

/* contas: e-mail + senha (PBKDF2 100 mil voltas). O admin é fixo pelo e-mail; os demais são 'gestor' ou 'membro' (sem cargo). */
const ADMIN_PADRAO = 'vitortozeti@gmail.com', EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/* Cargos são dados (kind 'cargos', editáveis pela gerência); cada cargo aponta para um NÍVEL fixo de acesso:
   gerencia = tudo · ti = tudo menos cargos e contas da gerência · lider = o(s) próprio(s) setor(es) + gestão · membro = o próprio setor */
const NIVEIS = new Set(['gerencia', 'ti', 'lider', 'membro']);
export const CARGOS_PADRAO = {
  admin: { nome: 'ADM', nivel: 'gerencia' }, diretor: { nome: 'Diretor(a)', nivel: 'gerencia' }, instrutor: { nome: 'Instrutor(a)', nivel: 'gerencia' },
  ti: { nome: 'TI', nivel: 'ti' }, gestor: { nome: 'Gestor(a)', nivel: 'lider' }, cogestor: { nome: 'Co-gestor(a)', nivel: 'lider' }, membro: { nome: 'Membro', nivel: 'membro' },
};
/* id -> {nome, nivel}: padrões + o que está gravado (cargo apagado some do mapa) */
async function mapaCargos(repo) {
  const m = Object.fromEntries(Object.entries(CARGOS_PADRAO).map(([k, v]) => [k, { ...v }]));
  for (const it of (await repo.cargosGravados?.()) || []) {
    if (it.del) { if (it.id !== 'admin' && it.id !== 'membro') delete m[it.id]; continue; }
    try { const d = JSON.parse(it.data); m[it.id] = { nome: String(d.nome || it.id), nivel: NIVEIS.has(d.nivel) ? d.nivel : 'membro' }; } catch { /* ignora */ }
  }
  m.admin.nivel = 'gerencia';
  return m;
}
const normEmail = e => String(e || '').trim().toLowerCase().slice(0, 120);
const ehAdmin = (email, env) => email === String(env.ADMIN_EMAIL || ADMIN_PADRAO).trim().toLowerCase();
async function derivar(senha, salt) {
  const k = await crypto.subtle.importKey('raw', enc.encode(senha), 'PBKDF2', false, ['deriveBits']);
  return b64u(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100000 }, k, 256));
}

const KINDS = new Set(['cargos', 'setores', 'cards', 'eventos', 'paginas', 'comentarios', 'versoes', 'edicoes', 'meta', 'ordem', 'diario']);
/* uma pessoa pode estar em mais de um setor: a coluna guarda os ids separados por vírgula ("moda,geek") */
const listaSetores = v => [...new Set(String(v || '').split(',').map(x => x.trim()).filter(Boolean))];
const ID_PUB = /^[a-z0-9]{8,40}$/, MAX_PUB = 1_800_000;
const MAX_ITEM = 1_500_000, MAX_MIDIA = 3_000_000, TAM_PAGINA = 500;

export async function handle(request, env, repo, waitUntil = p => p) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
  const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
  try {
    await repo.preparar?.();
    const segredo = env.TOKEN_SECRET || await repo.segredo();
    const cargos = await mapaCargos(repo), nivelDe = c => cargos[c]?.nivel || 'membro';
    /* Gestora / co-gestoras são PAPÉIS no setor (gravados no próprio setor: `gestora`, `cogestoras`) */
    const lideresSetor = new Map();                                    // email -> [ids de setor que lidera]
    for (const it of (await repo.itensDoTipo?.('setores')) || []) {
      let d; try { d = JSON.parse(it.data); } catch { continue; }
      for (const e of [d.gestora, ...(Array.isArray(d.cogestoras) ? d.cogestoras : [])].filter(Boolean)) lideresSetor.set(e, [...(lideresSetor.get(e) || []), it.id]);
    }
    /* nível efetivo: tag Gerência (ou ADM) > cargo de TI > papel de gestora/co-gestora > colaborador */
    const nivelConta = u => {
      if (!u) return 'membro';
      const c = ehAdmin(u.email, env) ? 'admin' : u.cargo, n = nivelDe(c);
      if (c === 'admin' || Number(u.gerencia) === 1 || n === 'gerencia') return 'gerencia';
      if (n === 'ti') return 'ti';
      return n === 'lider' || lideresSetor.has(u.email) ? 'lider' : 'membro';
    };
    const sessao = (u, cargo) => criarToken(u.nome, u.email, segredo).then(token => ({ token, nome: u.nome, email: u.email, cargo, nivel: nivelConta({ ...u, cargo }), gerencia: nivelConta({ ...u, cargo }) === 'gerencia', setor: u.setor || '' }));
    if (path[0] === 'registrar' && request.method === 'POST') {
      const b = await request.json(), email = normEmail(b.email), nome = String(b.nome || '').trim().slice(0, 40), senha = String(b.senha || '');
      if (!nome || !EMAIL.test(email)) return json({ erro: 'Informe seu nome e um e-mail válido' }, 400);
      if (senha.length < 6 || senha.length > 100) return json({ erro: 'A senha precisa ter de 6 a 100 caracteres' }, 400);
      if (await repo.getUsuario(email)) return json({ erro: 'Este e-mail já tem conta — entre com a senha' }, 409);
      const salt = crypto.getRandomValues(new Uint8Array(16)), cargo = ehAdmin(email, env) ? 'admin' : 'membro';
      await repo.criarUsuario({ email, nome, cargo, salt: b64u(salt), hash: await derivar(senha, salt), criado: Date.now() });
      return json(await sessao({ nome, email }, cargo));
    }
    if (path[0] === 'login' && request.method === 'POST') {
      const b = await request.json(), u = await repo.getUsuario(normEmail(b.email)), senha = String(b.senha || '').slice(0, 100);
      const hash = await derivar(senha, u ? fromB64u(u.salt) : new Uint8Array(16));   // gasta o mesmo tempo mesmo sem conta
      if (!u || !iguais(hash, u.hash)) return json({ erro: 'E-mail ou senha incorretos' }, 401);
      return json(await sessao(u, ehAdmin(u.email, env) ? 'admin' : u.cargo));
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
    const tk = await lerToken((request.headers.get('authorization') || '').replace(/^Bearer\s+/i, ''), segredo);
    const conta = tk?.m ? await repo.getUsuario(tk.m) : null;
    if (!conta) return json({ erro: 'Não autorizado' }, 401);
    const cargo = ehAdmin(conta.email, env) ? 'admin' : conta.cargo, auth = { n: conta.nome, m: conta.email, cargo };
    const nivel = nivelConta(conta), gerencia = nivel === 'gerencia', ti = nivel === 'ti';
    const amplo = gerencia || ti;                                     // vê todos os setores (gerência e TI)
    const gestao = amplo || nivel === 'lider';
    const meusSetores = listaSetores(conta.setor);
    /* Quadro por setor: quem não é "amplo" só enxerga/grava cartões do próprio setor */
    const dadosDe = it => { try { return JSON.parse(it.data); } catch { return null; } };
    const lidera = nivel === 'lider';
    /* Quadro da Gestão (`gestao:true`): só admin/diretor(a)/instrutor(a) criam e cobram; o gestor do setor vê e atua; membro nem vê */
    const veCartao = it => { if (amplo || it.kind !== 'cards' || it.del) return true; const d = dadosDe(it); return meusSetores.includes(d?.setor) && (!d?.gestao || lidera); };
    const podeGravar = async it => {
      if (it.kind === 'setores' || (it.kind === 'ordem' && it.id === 'setores')) return amplo;     // gerência e TI criam/editam/apagam setores
      if (it.kind === 'diario') return amplo;                                                      // gerência e TI trocam a pessoa da quinta
      if (it.kind === 'ordem' && it.id === 'cargos') return gerencia;
      if (it.kind === 'cargos') {                                                                  // só a gerência mexe em cargos
        if (!gerencia || !/^[a-z0-9_-]{1,40}$/.test(it.id)) return false;
        if (it.del) return it.id !== 'admin' && it.id !== 'membro' && !(await repo.listaUsuarios()).some(u => u.cargo === it.id);   // cargo em uso não é apagado
        const d = dadosDe(it); if (!d || !String(d.nome || '').trim() || !NIVEIS.has(d.nivel)) return false;
        return it.id !== 'admin' || d.nivel === 'gerencia';
      }
      if (it.kind === 'edicoes' && !gestao) {                                                     // edição lançada: só gestores mexem
        const antes = await repo.getItem('edicoes', it.id), a = antes && !antes.del ? dadosDe(antes) : null, d = it.del ? null : dadosDe(it);
        if (a?.status === 'publicada' || d?.status === 'publicada' || a?.pdf || d?.pdf) return false;
      }
      if (it.kind === 'paginas' && !gestao) {
        const antes = await repo.getItem('paginas', it.id), ed = (it.del ? (antes && dadosDe(antes)) : dadosDe(it))?.ed;
        const e = ed ? await repo.getItem('edicoes', ed) : null;
        if (e && !e.del && dadosDe(e)?.status === 'publicada') return false;
      }
      if (it.kind === 'cards' && !amplo) {
        if (!meusSetores.length) return false;
        const antes = await repo.getItem('cards', it.id), setorAntes = antes && !antes.del ? dadosDe(antes)?.setor : null;
        /* pedido a outro setor: qualquer pessoa ABRE uma demanda nova para outro setor, vinda de um setor seu (depois quem trata é o destino) */
        if (!antes && !it.del) { const d = dadosDe(it); if (d && !d.gestao && d.deSetor && meusSetores.includes(d.deSetor) && typeof d.setor === 'string' && d.setor) return true; }
        if (setorAntes && !meusSetores.includes(setorAntes)) return false;
        const eraGestao = !!(antes && !antes.del && dadosDe(antes)?.gestao), agora = it.del ? null : dadosDe(it);
        if (eraGestao && !lidera) return false;                                   // membro não mexe em tarefa da gestão
        if (agora && !!agora.gestao !== eraGestao) return false;                  // só amplos criam/convertem tarefa da gestão
        if (it.del && eraGestao) return false;                                    // gestor não apaga tarefa da gestão
        return it.del ? true : meusSetores.includes(agora?.setor);
      }
      return true;
    };

    const contato = String(env.ADMIN_EMAIL || ADMIN_PADRAO).trim().toLowerCase();
    const emSegundoPlano = p => waitUntil(Promise.resolve(p).catch(() => { /* aviso falhou: não derruba a requisição */ }));
    emSegundoPlano(lembretesDePrazo(repo, env, contato, new Date(Date.now() - 3 * 36e5).toISOString().slice(0, 10)));   // dia no fuso de Brasília

    if (path[0] === 'equipe') {
      const cargoDe = u => ehAdmin(u.email, env) ? 'admin' : (cargos[u.cargo] ? u.cargo : 'membro');
      if (request.method === 'GET' && !path[1]) return json({ usuarios: (await repo.listaUsuarios()).map(u => ({ email: u.email, nome: u.nome, cargo: cargoDe(u), nivel: nivelConta(u), gerencia: nivelConta(u) === 'gerencia', tagGerencia: Number(u.gerencia) === 1 || ehAdmin(u.email, env), setor: u.setor || '', funcao: u.funcao || '', bio: u.bio || '', foto: u.foto || '' })) });
      if (!amplo) return json({ erro: 'Só a gerência e o TI gerenciam a equipe' }, 403);
      if (request.method === 'PUT') {
        const b = await request.json(), email = normEmail(b.email), alvo = await repo.getUsuario(email);
        if (!alvo) return json({ erro: 'Usuário inválido' }, 400);
        if (ti && nivelConta(alvo) === 'gerencia') return json({ erro: 'O TI não altera contas da gerência' }, 403);
        if (b.gerencia !== undefined) {                               // tag Gerência: só a gerência dá ou tira
          if (!gerencia) return json({ erro: 'Só a gerência define quem é da gerência' }, 403);
          if (ehAdmin(email, env)) return json({ erro: 'O ADM é sempre da gerência' }, 400);
          await repo.setGerencia(email, b.gerencia ? 1 : 0);
        }
        if (b.cargo !== undefined && !gerencia) return json({ erro: 'Só a gerência muda cargos' }, 403);
        if (b.setor !== undefined) {                                  // setor vale para qualquer pessoa, inclusive o admin
          const ids = Array.isArray(b.setor) ? b.setor.map(String) : listaSetores(b.setor);   // aceita lista ou texto "a,b"
          if ((typeof b.setor !== 'string' && !Array.isArray(b.setor)) || ids.length > 12 || ids.some(x => x.length > 80 || x.includes(','))) return json({ erro: 'Setor inválido' }, 400);
          await repo.setSetor(email, listaSetores(ids.join(',')).join(','));
        }
        if (b.cargo !== undefined) {
          if (ehAdmin(email, env)) return json({ erro: 'O cargo do administrador não pode ser alterado' }, 400);
          if (b.cargo === 'admin' || !cargos[b.cargo]) return json({ erro: 'Cargo inválido' }, 400);
          await repo.setCargo(email, b.cargo);
        }
        return json({ ok: true });
      }
      if (request.method === 'DELETE' && path[1]) {
        const email = normEmail(decodeURIComponent(path[1]));
        if (ehAdmin(email, env)) return json({ erro: 'O administrador não pode ser removido' }, 400);
        if (email === conta.email) return json({ erro: 'Você não pode apagar a própria conta por aqui' }, 400);
        const alvo = await repo.getUsuario(email);
        if (!alvo) return json({ erro: 'Usuário inválido' }, 400);
        if (!gerencia && nivelConta(alvo) === 'gerencia') return json({ erro: 'Só a gerência remove contas da gerência' }, 403);
        await repo.removeUsuario(email); return json({ ok: true });
      }
    }

    if (path[0] === 'sync' && request.method === 'POST') {
      const body = await request.json();
      const push = Array.isArray(body.push) ? body.push.slice(0, 2000) : [];
      let aplicados = 0;
      const eventos = [];
      for (const it of push) {
        if (!it || !KINDS.has(it.kind) || typeof it.id !== 'string' || it.id.length > 80 || !Number.isFinite(it.u)) continue;
        if (it.data != null && (typeof it.data !== 'string' || it.data.length > MAX_ITEM)) continue;
        if (!(await podeGravar(it))) continue;
        const antes = it.kind === 'cards' && !it.del ? await repo.getItem('cards', it.id) : null;
        if (await repo.aplicar({ kind: it.kind, id: it.id, u: Math.floor(it.u), del: it.del ? 1 : 0, data: it.del ? null : it.data })) {
          aplicados++;
          if (it.kind === 'cards' && !it.del) eventos.push(...eventosDoCartao(antes && !antes.del ? dadosDe(antes) : null, dadosDe(it), auth.m));
        }
      }
      if (eventos.length) emSegundoPlano((async () => { for (const e of eventos.slice(0, 50)) await notificar(repo, env, contato, e.para, e); })());
      const r = await repo.mudancasDesde(Number(body.cursor) || 0, TAM_PAGINA);
      /* cartão de outro setor (ou que mudou de setor) chega como "apagado": some do aparelho sem vazar o conteúdo */
      const pull = r.itens.map(it => veCartao(it) ? it : { kind: it.kind, id: it.id, u: it.u, del: 1, data: null });
      return json({ cursor: r.cursor, pull, mais: r.itens.length >= TAM_PAGINA, aplicados });
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
    /* PDF da edição no Cloudflare R2 (binding ARQUIVOS): todos os logados leem; só gestão envia/troca/remove */
    if (path[0] === 'pdf') {
      if (!env.ARQUIVOS) return json({ erro: 'Armazenamento de PDF (R2) ainda não configurado no Cloudflare' }, 503);
      const chave = decodeURIComponent(path.slice(1).join('/'));
      if (request.method === 'GET' && /^pdf\/[a-z0-9-]{1,90}\.pdf$/.test(chave)) {
        const o = await env.ARQUIVOS.get(chave);
        if (!o) return json({ erro: 'PDF não encontrado' }, 404);
        return new Response(o.body, { headers: { 'content-type': 'application/pdf', 'cache-control': 'private, max-age=3600', 'x-content-type-options': 'nosniff' } });
      }
      if (!gestao) return json({ erro: 'Só gestores(as), a gerência e o TI mexem nas edições' }, 403);
      if (request.method === 'PUT' && /^[a-z0-9]{1,40}$/.test(path[1] || '')) {
        if (Number(request.headers.get('content-length') || 0) > 95 * 1024 * 1024) return json({ erro: 'PDF maior que 95 MB' }, 400);
        const corpo = await request.arrayBuffer(), ini = new Uint8Array(corpo.slice(0, 5));
        if (!corpo.byteLength || corpo.byteLength > 95 * 1024 * 1024) return json({ erro: 'PDF vazio ou maior que 95 MB' }, 400);
        if (String.fromCharCode(...ini) !== '%PDF-') return json({ erro: 'O arquivo não é um PDF' }, 400);
        const nova = `pdf/${path[1]}-${Date.now().toString(36)}.pdf`;
        await env.ARQUIVOS.put(nova, corpo, { httpMetadata: { contentType: 'application/pdf' } });
        return json({ ok: true, chave: nova, tamanho: corpo.byteLength });
      }
      if (request.method === 'DELETE' && /^pdf\/[a-z0-9-]{1,90}\.pdf$/.test(chave)) { await env.ARQUIVOS.delete(chave); return json({ ok: true }); }
    }
    if (path[0] === 'publicar') {
      if (!gestao) return json({ erro: 'Só líderes de setor, a gerência e o TI publicam o link público' }, 403);
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
    /* caixa de entrada de avisos (também lida pelo service worker quando chega um push) */
    if (path[0] === 'avisos') {
      if (request.method === 'GET') { const l = await repo.avisosDe(auth.m); return json({ avisos: l, naoLidos: l.filter(a => !a.lido).length }); }
      if (request.method === 'POST' && path[1] === 'lidos') { await repo.marcarLidos(auth.m); return json({ ok: true }); }
    }
    if (path[0] === 'push') {
      if (request.method === 'GET' && path[1] === 'chave') return json({ chave: (await vapid(repo)).pub });
      if (path[1] === 'inscrever') {
        const b = await request.json(), ep = String(b.endpoint || '');
        if (!/^https:\/\//.test(ep) || ep.length > 800) return json({ erro: 'inscrição inválida' }, 400);
        if (request.method === 'POST') { await repo.addSub(ep, auth.m, Date.now()); return json({ ok: true }); }
        if (request.method === 'DELETE') { await repo.removeSub(ep); return json({ ok: true }); }
      }
      if (request.method === 'POST' && path[1] === 'teste') { await notificar(repo, env, contato, [auth.m], { titulo: 'Avisos ativados ✓', texto: 'Você vai receber os avisos do ESPRO neste aparelho.', url: '#/inicio' }); return json({ ok: true }); }
    }
    /* cobrança formal enviada pelo próprio sistema (só admin/diretor(a)/instrutor(a)); o destino vem do cartão gravado, não do cliente */
    if (path[0] === 'cobrar' && request.method === 'POST') {
      if (!amplo) return json({ erro: 'Só a gerência e o TI cobram por e-mail' }, 403);
      const b = await request.json(), it = await repo.getItem('cards', String(b.id || '').slice(0, 80)), c = it && !it.del ? dadosDe(it) : null;
      if (!c) return json({ erro: 'Tarefa não encontrada (sincronize e tente de novo)' }, 404);
      const para = String(c.respEmail || '').split(',').map(x => x.trim().toLowerCase()).filter(x => EMAIL.test(x));
      if (!para.length) return json({ erro: 'Os responsáveis desta tarefa não têm e-mail cadastrado' }, 400);
      const r = await enviarEmail(env, para, String(b.assunto || 'Cobrança de tarefa'), String(b.corpo || ''));
      return r.ok ? json({ ok: true, para }) : json({ erro: r.erro }, 502);
    }
    /* perfil da própria pessoa: nome, função, bio e foto (miniatura em data-URL) */
    if (path[0] === 'perfil' && request.method === 'PUT') {
      const b = await request.json(), nome = String(b.nome ?? conta.nome).trim().slice(0, 40), foto = String(b.foto ?? '');
      if (!nome) return json({ erro: 'O nome não pode ficar vazio' }, 400);
      if (foto && (!/^data:image\/(jpeg|png|webp);base64,/.test(foto) || foto.length > 80000)) return json({ erro: 'Foto inválida ou grande demais' }, 400);
      await repo.setPerfil(auth.m, { nome, funcao: String(b.funcao || '').trim().slice(0, 60), bio: String(b.bio || '').trim().slice(0, 300), foto });
      return json({ ok: true, nome });
    }
    if (path[0] === 'ping') return json({ ok: true, nome: auth.n, email: auth.m, cargo, nivel, gerencia, setor: conta.setor || '', recursos: { r2: !!env.ARQUIVOS, email: emailAtivo(env), push: true } });
    return json({ erro: 'Rota inexistente' }, 404);
  } catch (e) {
    return json({ erro: String(e?.message || e) }, 500);
  }
}
