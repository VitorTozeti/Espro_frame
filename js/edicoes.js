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
  const e = Store.get().edicoes.find(x => x.id === id);
  return e ? lerEdicao(e) : null;                      // o gerador de páginas saiu: abrir = ler o PDF
}

/* ───────────── coletânea (só controle das edições em PDF) ───────────── */
const filtroEd = { busca: '', ano: '', situacao: '' };
const podeGerirEdicoes = () => Sync.conectado() && Sync.gestor();

const lerEdicao = e => (e.pdf ? abrirPdf(e) : toast('Esta edição ainda não tem PDF'));
const tamanhoMB = b => (b / 1048576).toFixed(b < 10485760 ? 1 : 0).replace('.', ',') + ' MB';

/* ───────────── PDF da edição (Cloudflare R2) ───────────── */
async function abrirPdf(e) {
  if (!Sync.conectado()) return toast('Entre na equipe para ler o PDF');
  toast('Abrindo o PDF…');
  try {
    const r = await fetch('/api/pdf/' + e.pdf.chave, { headers: { authorization: 'Bearer ' + Sync.token() } });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).erro || 'Erro ' + r.status);
    const url = URL.createObjectURL(await r.blob());
    openSheet(tituloEdicao(e), h('div', { class: 'pdf-view' },
      h('iframe', { src: url, title: 'PDF de ' + tituloEdicao(e) }),
      h('div', { class: 'row-btn' },
        h('a', { class: 'btn primary', href: url, target: '_blank', rel: 'noopener' }, icon('present', 16), 'Abrir em tela cheia'),
        h('a', { class: 'btn', href: url, download: `revista-edicao-${e.numero}.pdf` }, icon('file', 16), 'Baixar PDF'))));
  } catch (er) { toast(er.message); }
}
async function enviarPdf(edId, file) {
  if (!file || file.type && file.type !== 'application/pdf') throw new Error('Escolha um arquivo PDF');
  if (file.size > 95 * 1048576) throw new Error('O PDF passa de 95 MB');
  const r = await fetch('/api/pdf/' + edId, { method: 'PUT', headers: { authorization: 'Bearer ' + Sync.token(), 'content-type': 'application/pdf' }, body: file });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.erro || 'Erro ' + r.status);
  return { chave: d.chave, nome: file.name.slice(0, 120), tamanho: d.tamanho, em: Date.now(), por: Sync.usuario() };
}
async function trocarPdf(e, file, aoFim) {
  toast('Enviando o PDF…');
  try {
    const pdf = await enviarPdf(e.id, file), velho = e.pdf?.chave;
    await Store.upsert('edicoes', { ...Store.get().edicoes.find(x => x.id === e.id), pdf });
    if (velho) fetch('/api/pdf/' + velho, { method: 'DELETE', headers: { authorization: 'Bearer ' + Sync.token() } }).catch(() => {});
    toast('PDF enviado'); aoFim?.();
  } catch (er) { toast(er.message); }
}
/* lançar uma edição já pronta, só com o PDF (vai para a coletânea como publicada) */
function lancarEdicaoSheet() {
  if (!Sync.conectado()) return toast('Entre na equipe para lançar edições');
  const S = Store.get(), prox = Math.max(0, ...S.edicoes.map(e => e.numero)) + 1;
  const f = h('form', { class: 'form', onsubmit: async ev => {
    ev.preventDefault();
    const d = Object.fromEntries(new FormData(f)), b = f.querySelector('[type=submit]'), arq = f.elements.arquivo.files[0];
    b.disabled = true; b.textContent = 'Enviando…';
    try {
      const id = Store.uid(), pdf = await enviarPdf(id, arq);
      await Store.upsert('edicoes', { id, numero: Number(d.numero) || prox, nome: d.nome.trim(), data: d.data || today(), status: d.status, pdf });
      closeSheet(); toast(`Edição nº ${Number(d.numero) || prox} lançada`);
    } catch (er) { toast(er.message); b.disabled = false; b.textContent = 'Lançar edição'; }
  } },
    h('div', { class: 'row' }, field('Número', input('numero', String(prox), { type: 'number', min: '1', required: true })), field('Data', input('data', today(), { type: 'date' }))),
    field('Nome da edição (opcional)', input('nome', '', { placeholder: 'Ex.: Especial de verão' })),
    field('Arquivo PDF da revista', h('input', { class: 'input', type: 'file', name: 'arquivo', accept: 'application/pdf', required: true })),
    field('Situação', selectEl('status', STATUS_ED, 'publicada')),
    h('p', { class: 'muted hint' }, 'Todos da equipe podem ler e baixar. Só gestores(as), a gerência e o TI mexem em edições lançadas.'),
    h('div', { class: 'actions' }, h('button', { type: 'submit', class: 'btn primary' }, 'Lançar edição')));
  openSheet('Lançar edição (PDF)', f);
}
function opcoesEdicaoSheet(e) {
  const arq = h('input', { type: 'file', accept: 'application/pdf', hidden: true, onchange: ev => trocarPdf(e, ev.target.files[0], closeSheet) });
  openSheet(tituloEdicao(e), h('div', { class: 'stack tight' },
    e.pdf ? h('p', { class: 'muted' }, `PDF: ${e.pdf.nome} · ${tamanhoMB(e.pdf.tamanho || 0)} · enviado ${quando(e.pdf.em)}${e.pdf.por ? ' por ' + e.pdf.por : ''}`) : h('p', { class: 'muted' }, 'Esta edição ainda não tem PDF.'),
    h('div', { class: 'actions col' },
      h('button', { class: 'btn primary', type: 'button', onclick: () => arq.click() }, icon('file', 16), e.pdf ? 'Trocar o PDF' : 'Enviar o PDF'), arq,
      e.pdf ? h('button', { class: 'btn', type: 'button', onclick: async () => {
        if (!confirm('Remover o PDF desta edição?')) return;
        try { await fetch('/api/pdf/' + e.pdf.chave, { method: 'DELETE', headers: { authorization: 'Bearer ' + Sync.token() } }); const { pdf, ...resto } = e; await Store.upsert('edicoes', resto); toast('PDF removido'); closeSheet(); } catch (er) { toast(er.message); }
      } }, 'Remover o PDF') : null,
      h('button', { class: 'btn', type: 'button', onclick: () => editarEdicaoSheet(e) }, 'Número, nome, data e situação'))));
}

function viewEdicoes() {
  const S = Store.get(), f = filtroEd, gestor = podeGerirEdicoes();
  const todas = [...S.edicoes].filter(e => e.pdf || gestor).sort((a, b) => b.numero - a.numero);   // sem PDF ainda: só gestores veem (rascunho)
  const anos = [...new Set(todas.map(e => (e.data || '').slice(0, 4)).filter(Boolean))].sort().reverse();
  const norm = x => String(x || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const q = norm(f.busca.trim());
  const lista = todas.filter(e => (!f.ano || (e.data || '').startsWith(f.ano)) && (!f.situacao || (e.status || 'andamento') === f.situacao) && (!q || norm(`${tituloEdicao(e)} ${e.numero}`).includes(q)));
  const destaque = todas.find(e => e.pdf && e.status === 'publicada');
  const capa = (e, grande) => h('div', { class: 'ed-cover-ph capa-pdf tem' + (grande ? ' grande' : ''), style: `--c:${S.marca?.primaria || 'var(--accent)'}` },
    h('small', {}, S.empresa.nome), h('b', {}, `nº ${e.numero}`), e.nome ? h('span', {}, e.nome) : null, h('em', {}, e.pdf ? 'PDF' : 'sem PDF'));
  const item = e => h('article', { class: 'acervo-item' + (e.pdf ? '' : ' sem-pdf') },
    h('button', { class: 'acervo-capa', type: 'button', 'aria-label': `Ler ${tituloEdicao(e)}`, onclick: () => (e.pdf ? abrirPdf(e) : gestor ? opcoesEdicaoSheet(e) : null) }, capa(e),
      e.pdf ? h('span', { class: 'acervo-ler' }, icon('present', 16), 'Ler') : null),
    h('b', {}, nomeEdicao(e)), e.nome ? h('small', {}, e.nome) : null,
    h('small', { class: 'muted' }, dataEd(e) + (e.status === 'publicada' ? '' : ' · em produção') + (e.pdf ? ' · ' + tamanhoMB(e.pdf.tamanho || 0) : '')),
    gestor ? h('button', { class: 'link acervo-gerir', type: 'button', onclick: () => opcoesEdicaoSheet(e) }, e.pdf ? 'Gerenciar' : '+ Enviar PDF') : null);
  const opt = (v, r, atual) => h('option', { value: v, selected: v === atual }, r);
  return h('div', { class: 'stack' },
    destaque ? h('section', { class: 'acervo-destaque' },
      h('button', { class: 'acervo-capa grande', type: 'button', 'aria-label': `Ler ${tituloEdicao(destaque)}`, onclick: () => abrirPdf(destaque) }, capa(destaque, true)),
      h('div', {},
        h('p', { class: 'eyebrow' }, 'Edição mais recente'), h('h2', {}, tituloEdicao(destaque)),
        h('p', { class: 'muted' }, `${dataEd(destaque)} · ${tamanhoMB(destaque.pdf.tamanho || 0)}`),
        h('div', { class: 'row-btn' }, h('button', { class: 'btn primary', type: 'button', onclick: () => abrirPdf(destaque) }, icon('present', 16), 'Ler agora')))) : null,
    h('section', { class: 'estante-head' },
      h('div', { class: 'sec-head' },
        h('div', {}, h('p', { class: 'eyebrow' }, 'Coletânea da revista'), h('h2', {}, `${todas.length} ${todas.length === 1 ? 'edição' : 'edições'}`)),
        gestor ? h('button', { class: 'btn small primary', type: 'button', onclick: lancarEdicaoSheet }, icon('plus', 14), 'Lançar edição') : null),
      h('p', { class: 'muted hint' }, gestor ? 'Você é gestor(a): lança, troca o PDF, muda a situação ou exclui edições. Os demais só leem e baixam.' : 'Toque numa capa para ler. Só gestores(as) lançam e mexem nas edições.'),
      todas.length > 1 ? h('div', { class: 'acervo-filtros' },
        h('input', { class: 'input', type: 'search', placeholder: 'Buscar edição', value: f.busca, 'aria-label': 'Buscar edição', oninput: ev => { f.busca = ev.target.value; clearTimeout(f._t); f._t = setTimeout(() => { App.render(); const i = document.querySelector('.acervo-filtros input'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 250); } }),
        anos.length > 1 ? h('select', { class: 'input', 'aria-label': 'Ano', onchange: ev => { f.ano = ev.target.value; App.render(); } }, opt('', 'Todos os anos', f.ano), ...anos.map(a => opt(a, a, f.ano))) : null,
        gestor ? h('div', { class: 'chips' }, [['', 'Todas'], ['publicada', 'Publicadas'], ['andamento', 'Em produção']].map(([v, r]) =>
          h('button', { class: 'chip' + (f.situacao === v ? ' on' : ''), type: 'button', onclick: () => { f.situacao = v; App.render(); } }, r))) : null) : null),
    lista.length ? h('div', { class: 'acervo' }, lista.map(item))
      : h('p', { class: 'empty' }, todas.length ? 'Nenhuma edição com esses filtros.' : gestor ? 'Nenhuma edição ainda. Toque em "Lançar edição" e envie o PDF.' : 'Nenhuma edição lançada ainda.'));
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
  const unica = false;
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
  if (e.pdf?.chave) fetch('/api/pdf/' + e.pdf.chave, { method: 'DELETE', headers: { authorization: 'Bearer ' + Sync.token() } }).catch(() => {});
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
