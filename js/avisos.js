/* Central de avisos: sino no topo, caixa de entrada vinda do servidor e avisos no celular com o app fechado (Web Push).
   O servidor (functions/_lib/avisos.js) cria os avisos quando alguém repassa, conclui ou cobra uma tarefa, e lembra prazos. */
const Avisos = (() => {
  let lista = [], naoLidos = 0, timer = 0;
  const suportaPush = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const ehIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
  const instalado = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const b64uParaBytes = s => { const b = atob((s + '='.repeat((4 - s.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(b, c => c.charCodeAt(0)); };

  /* o service worker não lê o localStorage: deixamos o token no Cache Storage para ele buscar o texto do aviso */
  async function entregarToken() {
    try { const c = await caches.open('espro-sw'); await c.put('/__auth', new Response(Sync.token())); } catch { /* sem Cache Storage */ }
  }
  async function registro() {
    if (!suportaPush()) return null;
    try { return await navigator.serviceWorker.register('sw.js'); } catch { return null; }
  }
  async function inscrito() {
    const reg = suportaPush() ? await navigator.serviceWorker.getRegistration() : null;
    return !!(reg && await reg.pushManager.getSubscription());
  }

  async function ativar() {
    if (!Sync.conectado()) return toast('Entre na equipe para receber avisos');
    if (!suportaPush()) return toast(ehIOS() && !instalado() ? 'No iPhone: toque em Compartilhar → "Adicionar à Tela de Início" e abra o ESPRO por lá' : 'Este navegador não recebe avisos com o app fechado');
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return toast('Avisos bloqueados: libere as notificações do site nas configurações do navegador');
    try {
      const reg = await registro(); await navigator.serviceWorker.ready;
      const { chave } = await Sync.api('push/chave');
      const sub = await reg.pushManager.getSubscription() || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uParaBytes(chave) });
      await entregarToken();
      await Sync.api('push/inscrever', { method: 'POST', body: sub.toJSON() });
      await Sync.api('push/teste', { method: 'POST', body: {} });
      toast('Avisos ativados neste aparelho');
    } catch (e) { toast('Não foi possível ativar: ' + e.message); }
    App.render();
  }
  async function desativar() {
    try {
      const reg = await navigator.serviceWorker.getRegistration(), sub = await reg?.pushManager.getSubscription();
      if (sub) { await Sync.api('push/inscrever', { method: 'DELETE', body: { endpoint: sub.endpoint } }).catch(() => {}); await sub.unsubscribe(); }
      toast('Avisos desligados neste aparelho');
    } catch { /* ok */ }
    App.render();
  }

  async function carregar() {
    if (!Sync.conectado()) { lista = []; naoLidos = 0; pinta(); return; }
    try { const r = await Sync.api('avisos'); lista = r.avisos || []; naoLidos = r.naoLidos || 0; } catch { /* offline: mantém */ }
    pinta();
  }
  function pinta() {
    const b = $('#avisos-btn'); if (!b) return;
    b.hidden = !Sync.conectado();
    b.querySelector('.badge')?.remove();
    if (naoLidos) b.append(h('span', { class: 'badge' }, naoLidos > 9 ? '9+' : String(naoLidos)));
    b.setAttribute('aria-label', naoLidos ? `Avisos: ${naoLidos} novo(s)` : 'Avisos');
  }

  async function abrir() {
    await carregar();
    const ativo = await inscrito();
    const corpo = h('div', { class: 'stack tight' },
      h('div', { class: 'aviso-push ' + (ativo ? 'ok' : '') },
        h('p', {}, h('b', {}, ativo ? 'Avisos no celular ligados' : 'Receba os avisos com o app fechado'),
          h('br'), h('small', { class: 'muted' }, ativo ? 'Tarefas repassadas, conclusões, cobranças e prazos chegam como notificação.' : (ehIOS() && !instalado() ? 'No iPhone, primeiro adicione o ESPRO à Tela de Início.' : 'Como uma mensagem de WhatsApp, só que ligada à tarefa.'))),
        h('div', { class: 'row-btn' }, ativo
          ? [h('button', { class: 'btn small', type: 'button', onclick: () => Sync.api('push/teste', { method: 'POST', body: {} }).then(() => toast('Aviso de teste enviado')).catch(e => toast(e.message)) }, 'Enviar teste'),
             h('button', { class: 'btn ghost small', type: 'button', onclick: () => { closeSheet(); desativar(); } }, 'Desligar')]
          : h('button', { class: 'btn primary small', type: 'button', onclick: () => { closeSheet(); ativar(); } }, icon('alert', 14), 'Ativar avisos'))),
      lista.length ? h('ul', { class: 'list avisos-lista' }, lista.map(a => h('li', {},
        h('button', { class: 'item aviso-item' + (a.lido ? '' : ' novo'), type: 'button', onclick: () => { closeSheet(); location.hash = a.url || '#/inicio'; } },
          h('span', { class: 'grow' }, h('b', {}, a.titulo), a.texto ? h('small', { class: 'aviso-txt' }, a.texto) : null, h('small', { class: 'muted' }, quando(a.criado)))))))
        : h('p', { class: 'empty' }, 'Nenhum aviso ainda. Quando alguém passar uma tarefa para você, ela aparece aqui.'));
    openSheet('Avisos', corpo);
    if (naoLidos) { naoLidos = 0; pinta(); Sync.api('avisos/lidos', { method: 'POST', body: {} }).catch(() => {}); }
  }

  /* faixa no Início enquanto o aparelho não recebe avisos */
  function faixaInicio() {
    if (!Sync.conectado() || !suportaPush() && !ehIOS()) return null;
    const el = h('div', { hidden: true });
    inscrito().then(ok => {
      if (ok || localStorage.getItem('espro.pushDispensado')) return;
      el.replaceWith(h('section', { class: 'aviso-push' },
        h('p', {}, h('b', {}, 'Receba as tarefas no celular'), h('br'), h('small', { class: 'muted' }, 'Avisos de repasse, cobrança e prazo mesmo com o app fechado.')),
        h('div', { class: 'row-btn' }, h('button', { class: 'btn primary small', onclick: ativar }, 'Ativar'),
          h('button', { class: 'btn ghost small', onclick: ev => { try { localStorage.setItem('espro.pushDispensado', '1'); } catch { /* ok */ } ev.target.closest('section').remove(); } }, 'Agora não'))));
    });
    return el;
  }

  function aoSair() {
    lista = []; naoLidos = 0; pinta(); clearInterval(timer);
    caches.delete('espro-sw').catch(() => {});
    navigator.serviceWorker?.getRegistration().then(r => r?.pushManager.getSubscription()).then(s => s?.unsubscribe()).catch(() => {});
  }

  document.addEventListener('DOMContentLoaded', () => {
    const b = $('#avisos-btn'); if (!b) return;
    b.append(icon('alert', 22)); b.addEventListener('click', abrir);
    Store.ready.then(async () => {
      pinta();
      if (!Sync.conectado()) return;
      carregar(); timer = setInterval(carregar, 60000);
      if (suportaPush() && Notification.permission === 'granted') { await registro(); entregarToken(); }   // renova o token que o SW usa
    });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) carregar(); });
    navigator.serviceWorker?.addEventListener('message', carregar);
  });
  let antes = null;
  Store.ready.then(() => Sync.onChange(() => { const c = Sync.conectado(); if (c !== antes) { antes = c; if (c) { carregar(); clearInterval(timer); timer = setInterval(carregar, 60000); if (typeof Notification !== 'undefined' && Notification.permission === 'granted') entregarToken(); } else pinta(); } }));

  return { ativar, desativar, abrir, carregar, faixaInicio, aoSair };
})();
window.Avisos = Avisos;
