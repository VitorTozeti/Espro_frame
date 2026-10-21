/* Service worker do ESPRO: só avisos (push com o app fechado). Não guarda o app em cache, para nunca servir versão velha.
   O push chega SEM conteúdo; aqui buscamos o texto em /api/avisos com o token que o app deixou no Cache Storage. */
const CAIXA = 'espro-sw';

async function lerCaixa(chave) {
  try { const r = await (await caches.open(CAIXA)).match(chave); return r ? await r.text() : ''; } catch { return ''; }
}
async function gravarCaixa(chave, valor) {
  try { await (await caches.open(CAIXA)).put(chave, new Response(String(valor))); } catch { /* sem cache */ }
}

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', e => {
  e.waitUntil((async () => {
    const token = await lerCaixa('/__auth'), ultimo = Number(await lerCaixa('/__ultimo')) || 0;
    let novos = [];
    try {
      const r = await fetch('/api/avisos', { headers: { authorization: 'Bearer ' + token }, cache: 'no-store' });
      if (r.ok) novos = ((await r.json()).avisos || []).filter(a => !a.lido && a.id > ultimo);
    } catch { /* sem rede: mostra o aviso genérico */ }
    if (!novos.length) return self.registration.showNotification('ESPRO', { body: 'Você tem novidades no quadro.', icon: 'icon-192.png', tag: 'espro', data: { url: '#/inicio' } });
    await gravarCaixa('/__ultimo', Math.max(...novos.map(a => a.id)));
    const a = novos[0];
    return self.registration.showNotification(novos.length > 1 ? `${a.titulo} (+${novos.length - 1})` : a.titulo,
      { body: a.texto, icon: 'icon-192.png', badge: 'icon-192.png', tag: 'espro', renotify: true, data: { url: a.url || '#/inicio' } });
  })());
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const alvo = new URL('./' + (e.notification.data?.url || ''), self.registration.scope).href;
  e.waitUntil((async () => {
    const abas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of abas) if ('focus' in c) { await c.navigate?.(alvo).catch(() => {}); return c.focus(); }
    return self.clients.openWindow(alvo);
  })());
});
