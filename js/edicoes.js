/* Edições da revista: estante com todas as edições (nº 1, nº 2…), criar/duplicar/excluir, trocar a edição ativa
   e publicar um link público de leitura (com QR code). Cada página guarda `ed` (id da edição). */
const nomeEdicao = e => `Edição nº ${e.numero}`;
const tituloEdicao = e => (e.nome ? `${nomeEdicao(e)} — ${e.nome}` : nomeEdicao(e));
const STATUS_ED = [['andamento', 'Em andamento'], ['publicada', 'Publicada']];
const clonar = o => JSON.parse(JSON.stringify(o));

function statsEdicao(e) {
  const ps = Store.paginasEd(e.id), prontas = ps.filter(p => p.status === 'pronta').length;
  return { n: ps.length, prontas, pct: ps.length ? Math.round(prontas / ps.length * 100) : 0, capa: ps.find(p => p.tpl === 'capa') };
}
const dataEd = e => (e.data ? parseISO(e.data).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/\./g, '') : 'Sem data');
const linkPublico = e => (e.pub?.id ? `${location.origin}/api/p/${e.pub.id}` : '');

function abrirEdicao(id, destino = '#/revista') {
  Views.revTab = 'edicao';
  Store.setEdicaoAtiva(id);
  location.hash = destino;
}

/* ───────────── a estante ───────────── */
function viewEdicoes() {
  const S = Store.get(), lista = [...S.edicoes].sort((a, b) => b.numero - a.numero);
  const card = e => {
    const st = statsEdicao(e), ativa = S.edicaoAtiva === e.id;
    return h('article', { class: 'ed-card' + (ativa ? ' on' : ''), style: ativa ? null : null },
      h('button', { class: 'ed-cover', type: 'button', 'aria-label': `Abrir ${tituloEdicao(e)}`, onclick: () => abrirEdicao(e.id) },
        st.capa ? miniPage(st.capa) : h('div', { class: 'ed-cover-ph' }, h('b', {}, `nº ${e.numero}`)),
        ativa && h('span', { class: 'ed-badge' }, 'Ativa')),
      h('div', { class: 'ed-info' },
        h('div', { class: 'ed-tags' },
          h('span', { class: 'st st-' + (e.status === 'publicada' ? 'pronta' : 'rascunho') }, STATUS_ED.find(s => s[0] === e.status)?.[1] || 'Em andamento'),
          e.pub?.id && h('span', { class: 'st st-revisao' }, 'Link público')),
        h('h3', {}, nomeEdicao(e)),
        e.nome && h('p', { class: 'ed-nome' }, e.nome),
        h('p', { class: 'muted' }, `${dataEd(e)} · ${st.n} página(s)`),
        h('div', { class: 'meter', role: 'img', 'aria-label': `${st.pct}% pronto` }, h('i', { style: `width:${st.pct}%` })),
        h('small', { class: 'muted' }, `${st.prontas} de ${st.n} prontas`),
        h('div', { class: 'row-btn' },
          h('button', { class: 'btn small' + (ativa ? '' : ' primary'), type: 'button', onclick: () => abrirEdicao(e.id) }, ativa ? 'Editar' : 'Abrir'),
          h('button', { class: 'btn small', type: 'button', onclick: () => (st.n ? apresentar(0, e.id) : toast('Esta edição ainda não tem páginas')) }, icon('present', 16), 'Ler'),
          h('button', { class: 'btn small', type: 'button', onclick: () => publicarSheet(e) }, icon('link2', 16), 'Link'),
          h('button', { class: 'icon-btn sm', type: 'button', 'aria-label': 'Mais opções da edição', onclick: () => editarEdicaoSheet(e) }, icon('more', 18)))));
  };
  return h('div', { class: 'stack' },
    h('section', { class: 'estante-head' },
      h('p', { class: 'eyebrow' }, 'Estante da revista'),
      h('h2', {}, `${lista.length} ${lista.length === 1 ? 'edição' : 'edições'}`),
      h('p', { class: 'muted' }, 'Cada edição tem suas próprias páginas. Abra uma para editar, leia como leitor ou compartilhe o link.')),
    h('div', { class: 'estante' }, lista.map(card)),
    fab('Nova edição', novaEdicaoSheet));
}

/* ───────────── nova edição ───────────── */
function novaEdicaoSheet() {
  const S = Store.get(), prox = Math.max(0, ...S.edicoes.map(e => e.numero)) + 1, atual = Store.edicaoAtual();
  const f = h('form', { class: 'form', onsubmit: ev => {
    ev.preventDefault();
    const d = Object.fromEntries(new FormData(f));
    criarEdicao({ numero: Number(d.numero) || prox, nome: d.nome.trim(), data: d.data, modo: d.modo, origem: atual.id });
    closeSheet();
  } },
    h('div', { class: 'row' }, field('Número', input('numero', String(prox), { type: 'number', min: '1', required: true })), field('Data', input('data', today(), { type: 'date' }))),
    field('Nome da edição (opcional)', input('nome', '', { placeholder: 'Ex.: Especial de verão' })),
    field('Como começar', selectEl('modo', [
      ['vazia', 'Em branco (capa, sumário e contracapa)'],
      ['estrutura', `Copiar a estrutura de ${nomeEdicao(atual)} (páginas vazias)`],
      ['completa', `Duplicar ${nomeEdicao(atual)} inteira`]], 'vazia')),
    h('div', { class: 'actions' }, h('button', { type: 'submit', class: 'btn primary' }, 'Criar edição')));
  openSheet('Nova edição', f);
}

function criarEdicao({ numero, nome, data, modo, origem }) {
  const S = Store.get(), ed = { id: Store.uid(), numero, nome, data: data || today(), status: 'andamento' };
  Store.upsert('edicoes', ed, { silent: true });
  const novaPag = (p, extra = {}) => { const c = { ...clonar(p), id: Store.uid(), ed: ed.id, status: 'rascunho', ...extra }; delete c.cardId; delete c._u; delete c.novo; return c; };
  if (modo === 'vazia') {
    const slogan = esc(S.marca?.slogan || 'A revista da nossa empresa');
    [{ tpl: 'capa', titulo: nomeEdicao(ed), html: `<p>${slogan}</p>` }, { tpl: 'sumario', titulo: 'Nesta edição', html: '' }, { tpl: 'contracapa', titulo: 'Até a próxima', html: '<p>Obrigado por ler.</p>' }]
      .forEach(p => Store.upsert('paginas', { id: Store.uid(), ed: ed.id, secao: '', status: 'rascunho', objs: [], colunas: 1, ...p }, { silent: true }));
  } else {
    for (const p of Store.paginasEd(origem)) {
      const c = novaPag(p);
      if (modo === 'estrutura') Object.assign(c, { html: FIXAS.includes(p.tpl) && p.tpl !== 'capa' ? p.html : '', objs: [], texto: '', img: '' }, p.tpl === 'capa' ? { html: '' } : {});
      if (p.tpl === 'capa' && /^Edição nº/i.test(p.titulo || '')) c.titulo = nomeEdicao(ed);
      Store.upsert('paginas', c, { silent: true });
    }
  }
  Store.setEdicaoAtiva(ed.id);
  toast(`${nomeEdicao(ed)} criada`);
  Views.revTab = 'edicao'; location.hash = '#/revista';
}

/* ───────────── editar / excluir ───────────── */
function editarEdicaoSheet(e) {
  const S = Store.get(), unica = S.edicoes.length <= 1;
  const f = h('form', { class: 'form', onsubmit: ev => {
    ev.preventDefault();
    const d = Object.fromEntries(new FormData(f));
    Store.upsert('edicoes', { ...e, numero: Number(d.numero) || e.numero, nome: d.nome.trim(), data: d.data, status: d.status });
    closeSheet(); toast('Edição atualizada');
  } },
    h('div', { class: 'row' }, field('Número', input('numero', String(e.numero), { type: 'number', min: '1', required: true })), field('Data', input('data', e.data || '', { type: 'date' }))),
    field('Nome (opcional)', input('nome', e.nome || '')),
    field('Situação', selectEl('status', STATUS_ED, e.status || 'andamento')),
    h('div', { class: 'actions' },
      h('button', { type: 'button', class: 'btn danger', disabled: unica, title: unica ? 'É a única edição' : null, onclick: () => excluirEdicao(e) }, 'Excluir'),
      h('button', { type: 'submit', class: 'btn primary' }, 'Salvar')));
  openSheet(nomeEdicao(e), f);
}

function excluirEdicao(e) {
  const S = Store.get(), n = Store.paginasEd(e.id).length;
  if (!confirm(`Excluir ${nomeEdicao(e)} e suas ${n} página(s)? Isso não pode ser desfeito.`)) return;
  Store.paginasEd(e.id).forEach(p => Store.remove('paginas', p.id, { silent: true }));
  Store.remove('edicoes', e.id, { silent: true });
  if (e.pub?.id) removerPublico(e.pub.id).catch(() => {});
  if (S.edicaoAtiva === e.id) Store.setEdicaoAtiva([...S.edicoes].sort((a, b) => b.numero - a.numero)[0].id);
  else Store.touch();
  closeSheet(); toast(`${nomeEdicao(e)} excluída`);
}

/* ───────────── link público + QR code ───────────── */
const idPublico = () => Array.from(crypto.getRandomValues(new Uint8Array(9)), b => b.toString(36).padStart(2, '0')).join('');
async function removerPublico(id) { await Sync.api('publicar/' + id, { method: 'DELETE' }); }

let qrPromise = null;
const carregarQR = () => qrPromise ||= new Promise((res, rej) => {
  if (window.qrcode) return res();
  const s = h('script', { src: 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js', onload: res, onerror: () => { qrPromise = null; rej(new Error('QR indisponível')); } });
  document.head.append(s);
});
async function qrSvg(texto) {
  await carregarQR();
  const q = window.qrcode(0, 'M'); q.addData(texto); q.make();
  return new DOMParser().parseFromString(q.createSvgTag({ scalable: true, cellSize: 4, margin: 2 }), 'image/svg+xml').documentElement;
}

function publicarSheet(e) {
  const draw = () => {
    e = Store.get().edicoes.find(x => x.id === e.id) || e;
    const link = linkPublico(e), box = h('div', {});
    if (!Sync.conectado()) {
      box.append(
        h('p', { class: 'muted hint' }, 'O link público fica no servidor da equipe (Cloudflare). Entre na equipe em "Empresa e dados" para publicar. Enquanto isso, dá para baixar a revista como um arquivo HTML único.'),
        h('div', { class: 'actions col' }, h('button', { class: 'btn', type: 'button', onclick: () => baixarHTML(e.id) }, icon('file', 18), 'Baixar HTML de leitura')));
    } else {
      const qrBox = h('div', { class: 'qr-box', hidden: !link });
      box.append(
        h('p', { class: 'muted hint' }, link ? `Qualquer pessoa com o link lê ${nomeEdicao(e)} (somente leitura). Republique para atualizar o conteúdo.` : `Gera um link de leitura de ${nomeEdicao(e)} que abre no celular, sem login.`),
        link && h('div', { class: 'link-row' }, h('input', { class: 'input', readonly: true, value: link, 'aria-label': 'Link público', onfocus: ev => ev.target.select() }),
          h('button', { class: 'btn small', type: 'button', onclick: async () => { try { await navigator.clipboard.writeText(link); toast('Link copiado'); } catch { toast('Copie o link manualmente'); } } }, icon('copy', 16), 'Copiar')),
        link && h('small', { class: 'muted' }, `Publicado ${quando(e.pub.em)}`),
        qrBox,
        h('div', { class: 'actions col' },
          h('button', { class: 'btn primary', type: 'button', onclick: ev => publicar(ev.currentTarget) }, link ? 'Atualizar o link com a versão atual' : 'Publicar link'),
          link && navigator.share && h('button', { class: 'btn', type: 'button', onclick: () => navigator.share({ title: tituloEdicao(e), url: link }).catch(() => {}) }, 'Compartilhar'),
          link && h('button', { class: 'btn ghost', type: 'button', onclick: despublicar }, 'Despublicar')));
      if (link) qrSvg(link).then(svg => {
        qrBox.replaceChildren(svg, h('button', { class: 'btn small', type: 'button', onclick: () => baixarSvg(svg, `qr-edicao-${e.numero}.svg`) }, 'Baixar QR code'));
        qrBox.hidden = false;
      }).catch(() => { qrBox.hidden = true; });
    }
    openSheet('Link público · ' + nomeEdicao(e), box);
  };
  async function publicar(btn) {
    btn.disabled = true; btn.textContent = 'Publicando…';
    try {
      const id = e.pub?.id || idPublico();
      await Sync.run();                                             // garante as imagens no servidor
      await Sync.api('publicar', { method: 'POST', body: { id, nome: tituloEdicao(e), html: htmlLeitura(e.id, true) } });
      await Store.upsert('edicoes', { ...e, pub: { id, em: Date.now() } });
      toast('Link publicado');
    } catch (er) { toast(er.message || 'Não foi possível publicar'); }
    draw();
  }
  async function despublicar() {
    try { await removerPublico(e.pub.id); const { pub, ...resto } = e; await Store.upsert('edicoes', resto); toast('Link removido'); } catch (er) { toast(er.message); }
    draw();
  }
  draw();
}
function baixarSvg(svg, nome) {
  const a = h('a', { href: URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' })), download: nome });
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}
