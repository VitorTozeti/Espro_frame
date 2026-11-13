/* Organograma em árvore (estilo diagrama): visão COMPLETA (Gerência → TI e setores → Gestora → Co-gestoras → Colaboradores)
   e visão POR SETOR (Gestora no topo → Co-gestoras → Colaboradores). Linhas de ligação desenhadas só com CSS (.arv2). */
const OrgView = { foco: null, zoom: null };   // zoom null = ajustar à tela   // null = automático (completo para quem vê tudo; senão o 1º setor da pessoa)

function orgNoTopo(u, cor) {      // círculo grande com anel (topo da árvore)
  return h('button', { class: 'o2-raiz', type: 'button', style: `--c:${cor}`, onclick: () => Perfil.pessoaSheet(u) },
    h('span', { class: 'o2-anel' }, Perfil.avatar(u, 76)),
    h('b', {}, u.nome), h('small', {}, [ehGerencia(u) ? 'Gerência' : '', rotuloCargos(u)].filter(Boolean).join(' · ')));
}
function orgPilula(u, rotulo, cor) {   // pílula com arco colorido e etiqueta do nível
  return h('button', { class: 'o2-pilula', type: 'button', style: `--c:${cor}`, onclick: () => Perfil.pessoaSheet(u) },
    h('span', { class: 'o2-tag' }, rotulo),
    h('span', { class: 'o2-arco' }, Perfil.avatar(u, 46)),
    h('span', { class: 'o2-txt' }, h('b', {}, u.nome), h('small', {}, u.funcao || rotuloCargos(u))));
}
function orgCirculo(u, cor) {          // colaborador: círculo com arco + nome embaixo
  return h('button', { class: 'o2-circ', type: 'button', style: `--c:${cor}`, onclick: () => Perfil.pessoaSheet(u) },
    h('span', { class: 'o2-arco' }, Perfil.avatar(u, 54)),
    h('b', {}, u.nome.split(' ').slice(0, 2).join(' ')), h('small', {}, u.funcao || rotuloCargos(u)));
}
function orgSetorNo(s, n) {            // nó do setor (na visão completa)
  return h('a', { class: 'o2-setor', href: '#/organograma', style: `--c:${s.cor}`, onclick: ev => { ev.preventDefault(); OrgView.foco = s.id; App.render(); } },
    h('span', { class: 'o2-tag' }, 'Setor'), h('b', {}, s.nome), h('small', {}, `${n} pessoa${n === 1 ? '' : 's'}`));
}
const li = (no, filhos) => h('li', {}, no, filhos && filhos.length ? h('ul', {}, filhos) : null);

/* ramo de um setor: Gestora → Co-gestoras → Colaboradores (se houver 2+ co-gestoras, a equipe fica num grupo próprio) */
function equipeCompacta(s, l) {        // visão completa: a equipe vira um grupo de mini avatares (toque abre o setor)
  return h('button', { class: 'o2-equipe', type: 'button', style: `--c:${s.cor}`, onclick: () => { OrgView.foco = s.id; App.render(); } },
    h('span', { class: 'o2-mini' }, l.slice(0, 5).map(u => Perfil.avatar(u, 30))), h('small', {}, `Equipe · ${l.length}`));
}
function ramoSetor(s, gente, comNoSetor) {
  const hs = hierarquiaSetor(s, gente), cor = s.cor;
  const colab = !hs.colab.length ? [] : comNoSetor ? [li(equipeCompacta(s, hs.colab))] : hs.colab.map(u => li(orgCirculo(u, cor)));
  const grupoEquipe = colab.length && !comNoSetor ? [li(h('span', { class: 'o2-grupo', style: `--c:${cor}` }, `Equipe · ${colab.length}`), colab)] : [];
  let cos;
  if (hs.cos.length === 1) cos = [li(orgPilula(hs.cos[0], 'Co-gestora', cor), colab)];
  else cos = [...hs.cos.map(u => li(orgPilula(u, 'Co-gestora', cor))), ...(hs.cos.length ? grupoEquipe : colab)];
  let corpo;
  if (hs.gestoras.length) corpo = hs.gestoras.length === 1 ? [li(orgPilula(hs.gestoras[0], 'Gestora', cor), cos)] : [...hs.gestoras.map(u => li(orgPilula(u, 'Gestora', cor))), ...cos];
  else corpo = cos;
  return comNoSetor ? li(orgSetorNo(s, hs.todos.length), corpo) : corpo;
}

function viewOrgArvore() {
  if (!Sync.conectado()) return h('div', { class: 'stack' }, h('p', { class: 'empty' }, 'Entre na equipe para ver o organograma.'));
  const gente = Sync.equipe();
  if (!gente) { Sync.carregarEquipe().then(() => location.hash === '#/organograma' && App.render()); return h('p', { class: 'muted' }, 'Carregando a equipe…'); }
  const S = Store.get(), meus = Sync.setores();
  if (OrgView.foco === null) OrgView.foco = Sync.amplo() || !meus.length ? 'tudo' : meus[0];
  const foco = OrgView.foco, setor = S.setores.find(s => s.id === foco);
  const ord = (a, b) => Number(temCargo(b, 'admin')) - Number(temCargo(a, 'admin')) || a.nome.localeCompare(b.nome, 'pt-BR');
  const ger = gente.filter(ehGerencia).sort(ord), ti = gente.filter(u => !ehGerencia(u) && nivelDe(u) === 'ti').sort(ord);
  const ACC = 'var(--accent)';

  let arvore;
  if (!setor) {                                                            // completo
    const ramos = [
      ...(ti.length ? [li(h('span', { class: 'o2-setor', style: '--c:#0E7490' }, h('span', { class: 'o2-tag' }, 'Tecnologia'), h('b', {}, 'TI'), h('small', {}, `${ti.length} pessoa(s)`)), ti.map(u => li(orgCirculo(u, '#0E7490'))))] : []),
      ...S.setores.map(s => ramoSetor(s, gente, true)),
    ];
    const topo = ger.length ? h('div', { class: 'o2-topo' }, h('span', { class: 'o2-tag fixa' }, 'Gerência'), h('div', { class: 'o2-topo-l' }, ger.map(u => orgNoTopo(u, ACC))))
      : h('span', { class: 'o2-grupo' }, S.empresa.nome);
    arvore = h('ul', {}, li(topo, ramos));
  } else {                                                                 // um setor
    const corpo = ramoSetor(setor, gente, false);
    arvore = h('ul', {}, li(h('div', { class: 'o2-topo' }, h('span', { class: 'o2-tag fixa', style: `background:${setor.cor}` }, 'Setor'), h('b', { class: 'o2-setor-nome' }, setor.nome)), corpo.length ? corpo : [li(h('span', { class: 'muted' }, 'Ninguém neste setor ainda'))]));
  }
  const chip = (id, rot, cor) => h('button', { class: 'chip' + (foco === id ? ' on' : ''), type: 'button', style: cor ? `--c:${cor}` : null, onclick: () => { OrgView.foco = id; OrgView.zoom = null; App.render(); } }, cor ? h('span', { class: 'dot' }) : null, rot);
  const arv = h('div', { class: 'arv2' }, arvore);
  const box = h('div', { class: 'arv2-wrap' }, arv);
  const zoomRot = h('span', { class: 'o2-zoom-v' });
  const aplicaZoom = () => {
    arv.style.zoom = 1;
    const ajuste = Math.max(0.4, Math.min(1, box.clientWidth / arv.scrollWidth));
    const z = OrgView.zoom ?? ajuste;
    arv.style.zoom = z; zoomRot.textContent = Math.round(z * 100) + '%';
    if (box.scrollWidth > box.clientWidth) box.scrollLeft = (box.scrollWidth - box.clientWidth) / 2;   // começa centralizado
  };
  requestAnimationFrame(() => requestAnimationFrame(aplicaZoom));
  const zoomBtn = (rot, fn, lab) => h('button', { class: 'icon-btn sm', type: 'button', 'aria-label': lab, onclick: () => { fn(); aplicaZoom(); } }, rot);
  const zoomBar = h('div', { class: 'o2-zoom' },
    zoomBtn('−', () => { OrgView.zoom = Math.max(0.3, (parseFloat(arv.style.zoom) || 1) - 0.1); }, 'Diminuir'), zoomRot,
    zoomBtn('+', () => { OrgView.zoom = Math.min(1.6, (parseFloat(arv.style.zoom) || 1) + 0.1); }, 'Aumentar'),
    h('button', { class: 'btn small ghost', type: 'button', onclick: () => { OrgView.zoom = null; aplicaZoom(); } }, 'Ajustar à tela'));
  return h('div', { class: 'stack' },
    h('section', { class: 'estante-head' },
      h('p', { class: 'muted' }, setor ? 'Gestora no topo, depois as co-gestoras e a equipe. Toque numa pessoa para ver o perfil.' : 'A empresa inteira: Gerência, TI e cada setor com a sua hierarquia. Toque num setor para abrir só ele.'),
      h('div', { class: 'chips' }, chip('tudo', 'Completo'), S.setores.map(s => chip(s.id, s.nome, s.cor))),
      h('div', { class: 'row-btn' },
        setor ? h('a', { class: 'btn small', href: '#/setor/' + setor.id }, icon('kanban', 14), 'Fluxo do setor') : null,
        Sync.amplo() ? h('button', { class: 'btn small', type: 'button', onclick: setoresSheet }, 'Definir gestoras') : null,
        h('button', { class: 'btn small ghost', type: 'button', onclick: () => window.print() }, icon('print', 14), 'Imprimir')),
      zoomBar),
    box);
}
Views.organograma = viewOrgArvore;
Perfil.organogramaSheet = () => { closeSheet(); location.hash = '#/organograma'; };
