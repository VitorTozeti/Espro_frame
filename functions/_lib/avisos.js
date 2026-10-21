/* Avisos da equipe: grava na caixa de entrada (tabela `avisos`), manda Web Push (app fechado) e e-mail (Resend).
   - Push SEM conteúdo (não precisa criptografar): o service worker busca o texto em /api/avisos ao receber.
   - Chaves VAPID criadas sozinhas e guardadas no D1 (config 'vapid'); nada para configurar.
   - E-mail só funciona com a variável RESEND_API_KEY (e EMAIL_FROM com domínio verificado no Resend). Sem ela, pula. */

const enc = new TextEncoder();
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export async function vapid(repo) {
  const salvo = await repo.getConfig('vapid');
  if (salvo) return JSON.parse(salvo);
  const par = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const chave = { pub: b64u(await crypto.subtle.exportKey('raw', par.publicKey)), jwk: await crypto.subtle.exportKey('jwk', par.privateKey) };
  await repo.setConfig('vapid', JSON.stringify(chave));
  return JSON.parse(await repo.getConfig('vapid'));               // outra requisição pode ter criado antes: vale a gravada
}

async function jwtVapid(chave, aud, contato) {
  const k = await crypto.subtle.importKey('jwk', chave.jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const cab = b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const corpo = b64u(enc.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: 'mailto:' + contato })));
  const ass = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, k, enc.encode(cab + '.' + corpo));
  return `${cab}.${corpo}.${b64u(ass)}`;
}

/* manda um "toque" para cada aparelho inscrito; inscrição expirada (404/410) é removida */
async function pushPara(repo, emails, contato) {
  const subs = await repo.subsDe(emails);
  if (!subs.length) return;
  const chave = await vapid(repo);
  await Promise.all(subs.map(async s => {
    try {
      const aud = new URL(s.endpoint).origin;
      const r = await fetch(s.endpoint, { method: 'POST', headers: { TTL: '86400', Urgency: 'high', 'Content-Length': '0', Authorization: `vapid t=${await jwtVapid(chave, aud, contato)}, k=${chave.pub}` } });
      if (r.status === 404 || r.status === 410) await repo.removeSub(s.endpoint);
    } catch { /* aparelho fora do ar: tenta na próxima */ }
  }));
}

export const emailAtivo = env => !!env.RESEND_API_KEY;
export async function enviarEmail(env, para, assunto, texto) {
  if (!emailAtivo(env) || !para.length) return { ok: false, erro: 'E-mail não configurado' };
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { authorization: 'Bearer ' + env.RESEND_API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ from: env.EMAIL_FROM || 'ESPRO <onboarding@resend.dev>', to: para.slice(0, 20), subject: assunto.slice(0, 200), text: texto.slice(0, 8000) }),
  });
  return r.ok ? { ok: true } : { ok: false, erro: 'O serviço de e-mail recusou (' + r.status + ')' };
}

/* aviso completo: caixa de entrada + push + (opcional) e-mail */
export async function notificar(repo, env, contato, emails, { titulo, texto, url = '#/quadro', email = false }) {
  const lista = [...new Set(emails.map(e => String(e || '').trim().toLowerCase()).filter(Boolean))];
  if (!lista.length) return;
  const agora = Date.now();
  for (const e of lista) await repo.addAviso(e, titulo.slice(0, 140), String(texto || '').slice(0, 600), url, agora);
  await pushPara(repo, lista, contato);
  if (email) await enviarEmail(env, lista, '[ESPRO] ' + titulo, `${texto}\n\nAbra o ESPRO para ver: ${env.SITE_URL || 'https://espro-frame.pages.dev'}/${url}`);
}

const emailsDe = c => String(c?.respEmail || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
const tituloDe = c => '“' + String(c?.titulo || 'Tarefa').slice(0, 80) + '”';

/* o que mudou num cartão e quem precisa saber (o autor da mudança não é avisado) */
export function eventosDoCartao(antes, depois, autorEmail) {
  const out = [], eu = String(autorEmail || '').toLowerCase();
  if (!depois || depois.arquivado) return out;
  const tira = l => l.filter(e => e !== eu);
  const r = depois.repasse;
  if (r && r.quando && r.quando !== antes?.repasse?.quando) {
    const para = tira(emailsDe(depois));
    if (para.length) out.push({ para, titulo: `Nova tarefa para você: ${tituloDe(depois)}`, texto: `${r.por || 'Alguém'} passou esta tarefa para você${depois.prazo ? ` (prazo ${depois.prazo.split('-').reverse().join('/')})` : ''}.${r.nota ? '\nRecado: ' + r.nota : ''}`, email: true });
  }
  if (depois.col === 'done' && antes && antes.col !== 'done') {
    const para = tira([r?.porEmail].filter(Boolean).map(x => x.toLowerCase()));
    if (para.length) out.push({ para, titulo: `Concluída: ${tituloDe(depois)}`, texto: `${depois.concluidoPor || 'A equipe'} concluiu a tarefa que você passou.${depois.entrega ? '\nEntrega: ' + depois.entrega : ''}` });
  }
  const cobrancas = h => (h || []).filter(e => e.tipo === 'cobranca').length;
  if (cobrancas(depois.historico) > cobrancas(antes?.historico)) {
    const para = tira(emailsDe(depois));
    if (para.length) out.push({ para, titulo: `Cobrança da diretoria: ${tituloDe(depois)}`, texto: 'A diretoria pediu um posicionamento sobre esta tarefa. Atualize o andamento no quadro.' });
  }
  return out;
}

/* lembrete de prazo ("cron preguiçoso"): roda no máximo 1x por dia, puxado pela 1ª requisição do dia */
export async function lembretesDePrazo(repo, env, contato, hojeISO) {
  if ((await repo.getConfig('lembrete_dia')) === hojeISO) return;
  await repo.setConfig('lembrete_dia', hojeISO);
  const amanha = new Date(Date.parse(hojeISO + 'T12:00:00Z') + 864e5).toISOString().slice(0, 10);
  for (const it of await repo.itensDoTipo('cards')) {
    let c; try { c = JSON.parse(it.data); } catch { continue; }
    if (!c || c.arquivado || c.col === 'done' || !c.prazo || (c.prazo !== hojeISO && c.prazo !== amanha)) continue;
    const para = emailsDe(c); if (!para.length) continue;
    await notificar(repo, env, contato, para, { titulo: `${c.prazo === hojeISO ? 'Vence hoje' : 'Vence amanhã'}: ${tituloDe(c)}`, texto: 'Confira o andamento no quadro.', email: true });
  }
}
