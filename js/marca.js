/* Identidade visual: logo, cor principal, fonte dos títulos e slogan. Fica em `state.marca` (sincroniza com a equipe)
   e é aplicada ao app inteiro (cores/títulos), ao ícone da aba e à capa/contracapa da revista. */
const FONTES = [
  ['Fraunces', 'Fraunces:opsz,wght@9..144,600;9..144,700', 'Editorial elegante'],
  ['Playfair Display', 'Playfair+Display:wght@600;700', 'Clássica de revista'],
  ['DM Serif Display', 'DM+Serif+Display', 'Moda e estilo'],
  ['Lora', 'Lora:wght@600;700', 'Leitura suave'],
  ['Space Grotesk', 'Space+Grotesk:wght@600;700', 'Moderna e geek'],
  ['Poppins', 'Poppins:wght@600;700', 'Pop e arredondada'],
];
const CORES_MARCA = ['#4D7C0F', '#0E7490', '#2563EB', '#9333EA', '#DB2777', '#BE123C', '#C2410C', '#A16207', '#1C1C1A'];
const PADRAO_MARCA = '#4D7C0F';

const marcaAtual = () => Store.get()?.marca || {};
const lumin = hex => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => (c <= .03928 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4));
  return .2126 * r + .7152 * g + .0722 * b;
};
const inicialMarca = () => (Store.get().empresa.nome.trim()[0] || 'E').toUpperCase();

function fontesHref() {
  const f = FONTES.find(x => x[0] === marcaAtual().fonte);
  const fam = ['Fraunces:opsz,wght@9..144,600;9..144,700', 'Inter:wght@400;500;600'];
  if (f && f[0] !== 'Fraunces') fam.push(f[1]);
  return `https://fonts.googleapis.com/css2?${fam.map(x => 'family=' + x).join('&')}&display=swap`;
}

let marcaSig = '';
function aplicarMarca() {
  const S = Store.get(); if (!S) return;
  const m = S.marca || {}, cor = /^#[0-9a-f]{6}$/i.test(m.primaria || '') ? m.primaria : PADRAO_MARCA;
  const sig = [cor, m.fonte, S.empresa.nome, m.logo ? 1 : 0].join('|');
  if (sig === marcaSig) return;
  marcaSig = sig;
  const f = FONTES.find(x => x[0] === m.fonte) || FONTES[0], ink = lumin(cor) > .5 ? '#14140F' : '#FFFFFF';
  let st = document.getElementById('marca-style');
  if (!st) { st = h('style', { id: 'marca-style' }); document.head.append(st); }
  st.textContent = `:root{--accent:${cor};--accent-ink:${ink};--accent-soft:color-mix(in srgb,${cor} 14%,var(--bg));--serif:'${f[0]}',Georgia,'Times New Roman',serif}
@media (prefers-color-scheme:dark){:root{--accent:color-mix(in srgb,${cor} 62%,#fff);--accent-ink:#10150A;--accent-soft:color-mix(in srgb,${cor} 24%,var(--bg))}}`;
  let fl = document.getElementById('marca-font');
  if (!fl) { fl = h('link', { id: 'marca-font', rel: 'stylesheet' }); document.head.append(fl); }
  if (fl.getAttribute('href') !== fontesHref()) fl.setAttribute('href', fontesHref());
  /* ícone da aba e cor da barra do navegador acompanham a marca */
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='16' fill='${cor}'/><text x='32' y='44' font-family='Georgia,serif' font-size='38' font-weight='700' text-anchor='middle' fill='${ink}'>${esc(inicialMarca())}</text></svg>`;
  let ic = document.getElementById('marca-ico');
  if (!ic) { ic = h('link', { id: 'marca-ico', rel: 'icon', type: 'image/svg+xml' }); document.head.append(ic); }
  ic.setAttribute('href', 'data:image/svg+xml,' + encodeURIComponent(svg));
  document.querySelectorAll('meta[name=theme-color]').forEach(t => t.setAttribute('content', t.media?.includes('dark') ? '#121210' : '#F7F5F0'));
}

/* logo (imagem enviada) ou monograma com a inicial da empresa */
function marcaLogoEl(size = 26) {
  const m = marcaAtual(), src = m.logo ? srcDe({ src: m.logo }) : '';
  const el = h('span', { class: 'brand-mark' + (src ? ' img' : ''), style: `--s:${size}px`, 'aria-hidden': 'true' }, src ? h('img', { src, alt: '' }) : inicialMarca());
  return el;
}
const marcaLogoHTML = size => marcaLogoEl(size).outerHTML;

function identidadeSheet() {
  const S = Store.get(), m = S.marca ||= { cores: [...PALETA_PADRAO] };
  const salva = () => { Store.touchMeta('marca'); pinta(); };
  const prev = h('div', { class: 'marca-prev' });
  const pinta = () => {
    const f = FONTES.find(x => x[0] === m.fonte) || FONTES[0];
    prev.replaceChildren(marcaLogoEl(52),
      h('div', { class: 'grow' }, h('b', { style: `font-family:'${f[0]}',Georgia,serif` }, S.empresa.nome), h('small', {}, m.slogan || 'Seu slogan aparece aqui')),
      h('span', { class: 'btn small primary', 'aria-hidden': 'true' }, 'Botão'));
  };
  pinta();

  const cor = m.primaria || PADRAO_MARCA;
  const sw = h('div', { class: 'swatches big', role: 'radiogroup', 'aria-label': 'Cor principal' });
  const escolheCor = c => { m.primaria = c; sw.querySelectorAll('.sw').forEach(b => b.classList.toggle('on', b.dataset.c.toLowerCase() === c.toLowerCase())); custom.value = c; salva(); };
  CORES_MARCA.forEach(c => sw.append(h('button', { type: 'button', role: 'radio', class: 'sw' + (c.toLowerCase() === cor.toLowerCase() ? ' on' : ''), style: `--c:${c}`, 'data-c': c, 'aria-label': c, onclick: () => escolheCor(c) })));
  const custom = h('input', { type: 'color', class: 'cor-custom', value: cor, 'aria-label': 'Outra cor principal', oninput: e => escolheCor(e.target.value) });

  const fontes = h('div', { class: 'fonte-list', role: 'radiogroup', 'aria-label': 'Fonte dos títulos' }, FONTES.map(([nome, , desc]) => {
    const b = h('button', { type: 'button', role: 'radio', class: 'fonte-opt' + ((m.fonte || 'Fraunces') === nome ? ' on' : ''), 'data-f': nome, onclick: () => {
      m.fonte = nome; fontes.querySelectorAll('.fonte-opt').forEach(x => x.classList.toggle('on', x.dataset.f === nome)); aplicarMarca(); salva();
    } }, h('b', { style: `font-family:'${nome}',Georgia,serif` }, 'Aa ' + nome), h('small', {}, desc));
    return b;
  }));
  if (!document.getElementById('marca-fontes')) document.head.append(h('link', { id: 'marca-fontes', rel: 'stylesheet', href: `https://fonts.googleapis.com/css2?${FONTES.map(f => 'family=' + f[1]).join('&')}&display=swap` }));

  const logoIn = h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: async e => {
    const fl = e.target.files[0]; if (!fl) return;
    try { m.logo = Store.addMidia((await resizeImage(fl, 400)).src); salva(); drawLogo(); toast('Logo atualizado'); } catch { toast('Imagem inválida'); }
  } });
  const logoBox = h('div', { class: 'logo-row' });
  const drawLogo = () => logoBox.replaceChildren(marcaLogoEl(56),
    h('div', { class: 'grow' }, h('small', { class: 'muted' }, m.logo ? 'Logo enviado' : 'Sem logo: usando a inicial da empresa')),
    h('button', { type: 'button', class: 'btn small', onclick: () => logoIn.click() }, m.logo ? 'Trocar' : 'Enviar logo'),
    m.logo ? h('button', { type: 'button', class: 'btn ghost small', onclick: () => { delete m.logo; salva(); drawLogo(); } }, 'Remover') : '');
  drawLogo();

  openSheet('Identidade da marca', h('div', { class: 'form' },
    prev,
    field('Nome da empresa', input('nome', S.empresa.nome, { onchange: e => { Store.setEmpresa(e.target.value.trim() || 'Minha Empresa'); pinta(); } })),
    field('Slogan (aparece na capa de novas edições)', input('slogan', m.slogan || '', { placeholder: 'Ex.: Moda, cultura e atitude', onchange: e => { m.slogan = e.target.value.trim(); salva(); } })),
    h('div', { class: 'field' }, h('span', {}, 'Logo'), logoBox, logoIn),
    h('div', { class: 'field' }, h('span', {}, 'Cor principal'), sw, field('Outra cor', custom)),
    h('div', { class: 'field' }, h('span', {}, 'Fonte dos títulos'), fontes),
    h('div', { class: 'row-btn' }, h('button', { type: 'button', class: 'btn small', onclick: marcaSheet }, 'Paleta de cores do texto…'))));
}
