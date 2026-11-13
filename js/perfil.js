/* Perfil das pessoas (foto, função, bio) e organograma da empresa: quem lidera quem e a quem recorrer.
   Os dados vêm de /api/equipe (qualquer pessoa logada lê); cada um edita só o próprio perfil (PUT /api/perfil). */
const Perfil = (() => {
  const iniciais = nome => String(nome || '?').trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase() || '?';
  const corDe = u => corSetor(listaSetores(u.setor)[0]) || 'var(--accent)';
  const eu = () => (Sync.equipe() || []).find(u => u.email === Sync.email()) || { email: Sync.email(), nome: Sync.usuario(), cargo: Sync.cargo(), cargos: Sync.cargos(), setor: Sync.setores().join(',') };

  function avatar(u, tam = 34) {
    return u?.foto
      ? h('img', { class: 'avatar foto', src: u.foto, alt: '', width: tam, height: tam, style: `width:${tam}px;height:${tam}px`, loading: 'lazy' })
      : h('span', { class: 'avatar', 'aria-hidden': 'true', style: `width:${tam}px;height:${tam}px;font-size:${Math.round(tam * .38)}px;--c:${corDe(u || {})}` }, iniciais(u?.nome));
  }

  function tarefasAbertas(u) {
    const nome = (u.nome || '').toLowerCase(), em = (u.email || '').toLowerCase();
    return Store.get().cards.filter(c => !c.arquivado && c.col !== 'done' &&
      (String(c.respEmail || '').toLowerCase().split(',').includes(em) || Fluxo.nomes(c.resp).some(n => n.toLowerCase() === nome))).length;
  }

  function pessoaSheet(u) {
    const ss = listaSetores(u.setor).map(id => Store.get().setores.find(s => s.id === id)).filter(Boolean), abertas = tarefasAbertas(u);
    openSheet(u.nome, h('div', { class: 'stack tight perfil-ver' },
      h('div', { class: 'perfil-topo' }, avatar(u, 72),
        h('div', {}, h('h3', {}, u.nome), u.funcao ? h('p', { class: 'muted' }, u.funcao) : null)),
      h('div', { class: 'adm-tags' }, tagsPessoa(u)),
      u.bio ? h('p', { class: 'perfil-bio' }, u.bio) : null,
      h('p', { class: 'muted' }, abertas ? `${abertas} tarefa(s) em aberto que você consegue ver` : 'Nenhuma tarefa em aberto visível para você'),
      h('div', { class: 'row-btn' },
        u.email ? h('a', { class: 'btn small', href: 'mailto:' + encodeURIComponent(u.email) }, icon('chat', 14), 'Enviar e-mail') : null,
        u.email === Sync.email() ? h('button', { class: 'btn small', type: 'button', onclick: meuPerfilSheet }, icon('pencil', 14), 'Editar meu perfil') : null)));
  }

  function meuPerfilSheet() {
    if (!Sync.conectado()) return toast('Entre na equipe para ter um perfil');
    const u = eu(); let foto = u.foto || '';
    const prev = h('div', { class: 'perfil-foto' });
    const desenha = () => prev.replaceChildren(avatar({ ...u, foto }, 88),
      h('div', { class: 'row-btn' },
        h('label', { class: 'btn small' }, icon('camera', 14), foto ? 'Trocar foto' : 'Pôr foto',
          h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: async ev => {
            const fl = ev.target.files[0]; if (!fl) return;
            try { foto = await miniatura(fl); desenha(); } catch { toast('Imagem inválida'); }
          } })),
        foto ? h('button', { class: 'btn ghost small', type: 'button', onclick: () => { foto = ''; desenha(); } }, 'Tirar foto') : null));
    desenha();
    const f = h('form', { class: 'form', onsubmit: async ev => {
      ev.preventDefault();
      const d = Object.fromEntries(new FormData(f)), b = f.querySelector('[type=submit]'); b.disabled = true;
      try {
        await Sync.api('perfil', { method: 'PUT', body: { nome: d.nome, funcao: d.funcao, bio: d.bio, foto } });
        await Sync.carregarEquipe(true); closeSheet(); toast('Perfil salvo'); App.render();
      } catch (er) { toast(er.message); b.disabled = false; }
    } },
      prev,
      field('Nome', input('nome', u.nome, { required: true, maxlength: 40 })),
      field('Função (o que você faz)', input('funcao', u.funcao || '', { maxlength: 60, placeholder: 'Ex.: Redatora de Moda, Fotógrafo, Social media' })),
      field('Sobre você', textarea('bio', u.bio || '', 3)),
      h('p', { class: 'muted hint' }, 'Cargo e setor são definidos pela gerência (o TI também define setores).'),
      h('div', { class: 'actions' }, h('button', { type: 'submit', class: 'btn primary' }, 'Salvar perfil')));
    openSheet('Meu perfil', f);
  }

  /* foto quadrada 160×160 em JPEG (≈10 KB): cabe na lista da equipe sem pesar */
  function miniatura(file) {
    return new Promise((ok, falha) => {
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => {
        const L = 160, c = document.createElement('canvas'), lado = Math.min(img.width, img.height);
        c.width = c.height = L;
        c.getContext('2d').drawImage(img, (img.width - lado) / 2, (img.height - lado) / 2, lado, lado, 0, 0, L, L);
        URL.revokeObjectURL(url); ok(c.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = () => { URL.revokeObjectURL(url); falha(new Error('imagem')); };
      img.src = url;
    });
  }

  const pessoaBtn = (u, tam = 40) => h('button', { class: 'org-pessoa', type: 'button', onclick: () => pessoaSheet(u) },
    avatar(u, tam), h('span', { class: 'org-nome' }, h('b', {}, u.nome), h('small', {}, u.funcao || rotuloCargos(u) || 'Sem cargo')));

  /* organograma em hierarquia: Gerência → TI → cada setor: Gestora → Co-gestora(s) → colaboradores */
  function organograma(opts = {}) {
    const gente = Sync.equipe();
    if (!gente) { Sync.carregarEquipe().then(() => { if ($('#sheet').open && $('#sheet .org')) organogramaSheet(); else if (/organograma|inicio/.test(location.hash)) App.render(); }); return h('p', { class: 'muted' }, 'Carregando a equipe…'); }
    const ord = (a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' });
    const ger = gente.filter(ehGerencia).sort((a, b) => Number(temCargo(b, 'admin')) - Number(temCargo(a, 'admin')) || ord(a, b));
    const ti = gente.filter(u => !ehGerencia(u) && nivelDe(u) === 'ti').sort(ord);
    const semSetor = gente.filter(u => !amploDe(u) && !listaSetores(u.setor).length).sort(ord);
    const no = (u, tam, papel) => h('div', { class: 'arv-no' }, pessoaBtn(u, tam), papel ? h('span', { class: 'arv-papel' }, papel) : null);
    const nivel = (titulo, lista, tam, papel) => lista.length ? h('div', { class: 'arv-nivel' }, h('span', { class: 'arv-rot' }, titulo), h('div', { class: 'arv-linha' }, lista.map(u => no(u, tam, papel)))) : null;
    const setores = opts.setores || Store.get().setores;
    return h('div', { class: 'org arvore' + (opts.compacto ? ' compacto' : '') },
      h('section', { class: 'arv-topo' },
        nivel('Gerência', ger, 48),
        nivel('TI', ti, 40)),
      h('div', { class: 'org-setores' }, setores.map(s => {
        const hs = hierarquiaSetor(s, gente);
        return h('section', { class: 'org-setor arv-setor', style: `--c:${s.cor}` },
          h('header', {}, h('span', { class: 'dot' }), h('a', { href: '#/setor/' + s.id, onclick: () => closeSheet() }, h('b', {}, s.nome)), h('span', { class: 'count' }, String(hs.todos.length))),
          hs.gestoras.length ? nivel('Gestora', hs.gestoras, 44) : h('p', { class: 'muted hint' }, 'Sem gestora definida'),
          nivel('Co-gestora', hs.cos, 38),
          !opts.compacto ? nivel('Colaboradores', hs.colab, 30) : (hs.colab.length ? h('p', { class: 'muted hint arv-mais' }, `+ ${hs.colab.length} colaborador(es)`) : null));
      })),
      !opts.compacto && semSetor.length ? h('section', { class: 'org-setor', style: '--c:var(--muted)' }, h('header', {}, h('b', {}, 'Ainda sem setor')), h('div', { class: 'org-equipe' }, semSetor.map(u => pessoaBtn(u, 32)))) : null);
  }
  function organogramaSheet() {
    openSheet('Organograma', h('div', { class: 'stack tight' },
      h('div', { class: 'row-btn' }, h('button', { class: 'btn small', type: 'button', onclick: meuPerfilSheet }, icon('pencil', 14), 'Meu perfil')),
      organograma()));
  }

  return { avatar, pessoaSheet, meuPerfilSheet, organogramaSheet, organograma };
})();
