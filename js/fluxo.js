/* Fluxo de tarefas: repassar, dar ciência, concluir/reabrir, notas no cartão e feed de atividade.
   Substitui os grupos de WhatsApp por setor: tudo o que se combinaria na conversa fica gravado no próprio cartão
   (quem repassou, para quem, com qual recado, quando a pessoa viu e quando foi entregue). */

const Fluxo = (() => {
  const GRAVA = { silent: true };
  const meuNome = () => ((typeof autorAtual === 'function' ? autorAtual() : '') || '').trim();
  const meuEmail = () => (SY()?.conectado?.() ? Sync.email() : '').toLowerCase();
  const norm = s => String(s || '').trim().toLowerCase();
  const pessoasTodas = () => (SY()?.conectado?.() && Sync.equipe?.()) || [];
  /* quem não é "amplo" (admin/diretor/instrutor) só lida com gente e setores do próprio setor */
  const pessoas = () => {
    const vis = SY()?.setoresVisiveis?.();
    return vis == null ? pessoasTodas() : pessoasTodas().filter(u => listaSetores(u.setor).some(id => vis.includes(id)));
  };
  const porNome = nome => pessoas().find(u => norm(u.nome) === norm(nome));

  /* a tarefa é minha? (e-mail gravado no repasse, ou o nome do responsável bate com o meu) */
  function ehMeu(c) {
    const em = meuEmail(), nome = norm(meuNome());
    if (em && c.respEmail && norm(c.respEmail) === em) return true;
    return !!(nome && c.resp && norm(c.resp).split(/[,&/]| e /).some(p => p.trim() === nome || nome.startsWith(p.trim()) && p.trim().length > 2));
  }
  const pendenteCiencia = c => !c.arquivado && c.col !== 'done' && c.repasse && !c.repasse.ciente && ehMeu(c);
  const regCard = id => Store.get().cards.find(c => c.id === id);

  function registra(c, ent) {
    c.historico = [...(Array.isArray(c.historico) ? c.historico : []), { quando: Date.now(), por: meuNome() || 'Equipe', ...ent }].slice(-60);
  }
  function grava(c) { Store.upsert('cards', c, GRAVA); }

  /* ───── ações ───── */
  function repassar(id, { resp, setor, prazo, nota }) {
    const c = regCard(id); if (!c) return;
    const pessoa = porNome(resp);
    const novo = { ...c, resp: resp || '', respEmail: pessoa?.email || '' };
    if (setor) novo.setor = setor;
    if (prazo) novo.prazo = prazo;
    const paraSetorTodo = !resp;
    novo.repasse = { para: resp || nomeSetor(novo.setor), paraEmail: novo.respEmail, por: meuNome() || 'Equipe', quando: Date.now(), nota: (nota || '').trim(), ciente: paraSetorTodo || norm(resp) === norm(meuNome()) };
    registra(novo, { tipo: 'repasse', para: novo.repasse.para, texto: novo.repasse.nota });
    grava(novo); Store.touch();
  }
  function ciente(id) {
    const c = regCard(id); if (!c || !c.repasse) return;
    const novo = { ...c, repasse: { ...c.repasse, ciente: true, cienteEm: Date.now() } };
    registra(novo, { tipo: 'ciente' });
    if (novo.col === 'todo') { Store.logCol(novo, 'todo', 'doing'); novo.col = 'doing'; }
    grava(novo); Store.touch();
  }
  function assumir(id) {
    const c = regCard(id); if (!c) return;
    const novo = { ...c, resp: meuNome(), respEmail: meuEmail(), repasse: { para: meuNome(), paraEmail: meuEmail(), por: meuNome(), quando: Date.now(), nota: '', ciente: true } };
    registra(novo, { tipo: 'assumiu' });
    if (novo.col === 'todo') { Store.logCol(novo, 'todo', 'doing'); novo.col = 'doing'; }
    grava(novo); Store.touch();
  }
  function concluir(id, entrega, link) {
    const c = regCard(id); if (!c) return;
    const novo = { ...c, entrega: (entrega || '').trim() };
    if (link) novo.entregaLink = link.trim();
    const de = novo.col; novo.col = 'done';
    Store.logCol(novo, de === 'done' ? 'doing' : de, 'done');
    if (novo.entrega) novo.historico[novo.historico.length - 1].texto = novo.entrega;
    if (novo.repasse) novo.repasse = { ...novo.repasse, ciente: true };
    Store.upsert('cards', novo, GRAVA); Store.touch();
  }
  function reabrir(id, motivo) {
    const c = regCard(id); if (!c) return;
    const novo = { ...c, col: 'doing' };
    Store.logCol(novo, 'done', 'doing');
    registra(novo, { tipo: 'nota', texto: 'Reaberta' + (motivo ? ': ' + motivo.trim() : '') });
    Store.upsert('cards', novo, GRAVA); Store.touch();
  }
  function nota(id, texto) {
    const c = regCard(id); if (!c || !(texto || '').trim()) return;
    const novo = { ...c }; registra(novo, { tipo: 'nota', texto: texto.trim().slice(0, 600) });
    grava(novo); Store.touch();
  }

  /* ───── apresentação da linha do tempo ───── */
  const ROTULO = {
    mov: e => `moveu de ${e.de} para ${e.para}`,
    concluiu: () => 'concluiu a tarefa',
    repasse: e => `repassou para ${e.para}`,
    ciente: () => 'deu ciente e começou',
    assumiu: () => 'assumiu a tarefa',
    nota: () => 'escreveu',
    cobranca: e => `cobrou por e-mail ${e.para || ''}`,
  };
  const textoEvento = e => (ROTULO[e.tipo || 'mov'] || ROTULO.mov)(e);
  const iconeEvento = e => ({ concluiu: 'check2', repasse: 'users', ciente: 'check', assumiu: 'users', nota: 'chat', cobranca: 'alert' }[e.tipo] || 'arrow');
  function linhaEvento(e, comCard) {
    return h('li', { class: 'ev ev-' + (e.tipo || 'mov') },
      h('span', { class: 'ev-ic', 'aria-hidden': 'true' }, icon(iconeEvento(e), 14)),
      h('div', { class: 'ev-body' },
        h('p', {}, h('b', {}, e.por || 'Equipe'), ' ', textoEvento(e), comCard ? [' · ', h('em', {}, comCard)] : null),
        e.texto ? h('p', { class: 'ev-txt' }, e.texto) : null,
        h('small', {}, quando(e.quando))));
  }
  function linhaDoTempo(c, max = 12) {
    const hist = (c.historico || []).slice(-max).reverse();
    return hist.length ? h('ul', { class: 'timeline' }, hist.map(e => linhaEvento(e))) : h('p', { class: 'muted hint' }, 'Sem movimentos ainda.');
  }

  /* ───── sheets ───── */
  /* quem pode receber a tarefa: gente do MESMO setor do cartão (na gestão, só gestores/co-gestores) */
  const candidatos = (soGestores, setorId) => pessoas().filter(u => (!soGestores || ['gestor', 'cogestor'].includes(u.cargo)) && (!setorId || listaSetores(u.setor).includes(setorId)));
  const opcoes = (soGestores, setorId) => candidatos(soGestores, setorId).map(u => h('option', { value: u.nome }, nomesSetores(u.setor)));
  /* só confere quando a lista da equipe está carregada (modo local não tem lista) */
  const respValido = (nome, soGestores, setorId) => !nome || !pessoas().length || candidatos(soGestores, setorId).some(u => norm(u.nome) === norm(nome));
  function listaPessoas(soGestores, setorId) { return h('datalist', { id: 'dl-pessoas' }, opcoes(soGestores, setorId)); }
  function repassarSheet(c) {
    const setoresOk = setoresPermitidos(), todos = Store.get().setores;
    const dlRep = listaPessoas(!!c.gestao, c.setor);
    const f = h('form', {
      class: 'form', onsubmit: e => {
        e.preventDefault();
        const d = Object.fromEntries(new FormData(f));
        if (!respValido((d.resp || '').trim(), !!c.gestao, d.setor)) return toast('Escolha uma pessoa do setor selecionado');
        repassar(c.id, { resp: (d.resp || '').trim(), setor: d.setor, prazo: d.prazo, nota: d.nota });
        closeSheet(); toast((d.resp || '').trim() ? `Repassada para ${d.resp.trim()}` : 'Tarefa devolvida ao setor');
      },
    },
      h('p', { class: 'muted hint' }, `“${c.titulo}” — o recado fica gravado no cartão e a pessoa recebe o aviso no Início.`),
      field('Repassar para (pessoa)', input('resp', '', { list: 'dl-pessoas', placeholder: 'Escolha na lista — vazio = deixar livre para o setor' })),
      dlRep,
      h('div', { class: 'row' },
        field('Setor', selectEl('setor', (setoresOk.length ? setoresOk : todos).map(s => [s.id, s.nome]), c.setor)),
        field('Novo prazo', input('prazo', c.prazo || '', { type: 'date' }))),
      field('Recado (o que precisa ser feito, onde está o material)', textarea('nota', '', 3)),
      h('div', { class: 'actions' }, h('button', { type: 'submit', class: 'btn primary' }, icon('users', 16), 'Repassar')));
    f.elements.setor.addEventListener('change', () => { dlRep.replaceChildren(...opcoes(!!c.gestao, f.elements.setor.value)); });
    openSheet('Repassar tarefa', f);
  }
  function concluirSheet(c) {
    const f = h('form', {
      class: 'form', onsubmit: e => {
        e.preventDefault();
        const d = Object.fromEntries(new FormData(f));
        concluir(c.id, d.entrega, d.link);
        closeSheet(); toast('Tarefa concluída — quem repassou será avisado');
      },
    },
      h('p', { class: 'muted hint' }, `“${c.titulo}”`),
      field('O que foi entregue?', textarea('entrega', c.entrega || '', 3)),
      field('Link do resultado (Drive, doc…) — opcional', input('link', c.entregaLink || '', { type: 'url', placeholder: 'https://...' })),
      c.checklist?.some(i => !i.feito) ? h('p', { class: 'hint warn' }, `Ainda há ${c.checklist.filter(i => !i.feito).length} subtarefa(s) sem marcar.`) : null,
      h('div', { class: 'actions' }, h('button', { type: 'submit', class: 'btn primary' }, icon('check2', 16), 'Concluir')));
    openSheet('Concluir tarefa', f);
  }

  /* feed de atividade: tudo o que aconteceu nos cartões visíveis (no lugar de perguntar no grupo) */
  function atividadeSheet() {
    let modo = 'tudo';
    const body = h('div', { class: 'stack tight' });
    const eventos = () => {
      const vis = new Set(setoresPermitidos().map(s => s.id));
      const out = [];
      for (const c of Store.get().cards) {
        if (!vis.has(c.setor)) continue;
        for (const e of c.historico || []) out.push({ e, c });
      }
      return out.sort((a, b) => b.e.quando - a.e.quando);
    };
    const draw = () => {
      let lista = eventos();
      if (modo === 'meu') lista = lista.filter(({ c }) => ehMeu(c) || norm(c.repasse?.por) === norm(meuNome()) || norm(c.criador) === norm(meuNome()));
      lista = lista.slice(0, 50);
      body.replaceChildren(
        h('div', { class: 'chips' }, [['tudo', 'Tudo'], ['meu', 'Minhas tarefas']].map(([id, n]) => h('button', { class: 'chip' + (modo === id ? ' on' : ''), type: 'button', onclick: () => { modo = id; draw(); } }, n))),
        lista.length ? h('ul', { class: 'timeline feed' }, lista.map(({ e, c }) => h('li', { class: 'feed-item', onclick: () => cardSheet(regCard(c.id)) }, linhaEvento(e, c.titulo))))
          : h('p', { class: 'empty' }, 'Nada aconteceu ainda. Repasses, conclusões e notas aparecem aqui.'));
    };
    draw(); openSheet('Atividade do quadro', body);
  }

  /* ───── cobrança formal por e-mail (só admin/diretor/instrutor) ───── */
  const podeCobrar = () => !!SY()?.amplo?.();
  function textoCobranca(c, extra) {
    const dest = porNome(c.resp), prazo = c.prazo ? parseISO(c.prazo).toLocaleDateString('pt-BR') : 'não definido';
    const atras = c.prazo && c.prazo < today() ? ' (em atraso)' : '';
    const emAberto = (c.checklist || []).filter(i => !i.feito).length;
    return {
      para: dest?.email || c.respEmail || '',
      assunto: `[ESPRO] Cobrança de tarefa: ${c.titulo}`,
      corpo: [
        `Prezado(a) ${c.resp || 'colaborador(a)'},`, '',
        'Escrevo para solicitar um posicionamento sobre a tarefa abaixo, sob sua responsabilidade:', '',
        `• Tarefa: ${c.titulo}`,
        `• Setor: ${nomeSetor(c.setor)}`,
        `• Situação atual: ${Store.COLS.find(x => x.id === c.col)?.nome || c.col}`,
        `• Prazo: ${prazo}${atras}`,
        emAberto ? `• Subtarefas pendentes: ${emAberto}` : null,
        extra && extra.trim() ? `Observação: ${extra.trim()}` : null, '',
        'Solicito que atualize o andamento no quadro da ESPRO e informe, por favor, a previsão de entrega.', '',
        'Atenciosamente,',
        meuNome() || 'Coordenação',
        { admin: 'Administração', diretor: 'Direção', instrutor: 'Instrução' }[SY()?.cargo?.()] || null,
        'ESPRO',
      ].filter(x => x !== null).join('\n'),
    };
  }
  function cobrarSheet(c) {
    const f = h('form', { class: 'form', onsubmit: e => e.preventDefault() });
    const draw = () => {
      const extra = f.elements.extra?.value || '';
      const m = textoCobranca(c, extra);
      const mailto = `mailto:${encodeURIComponent(m.para)}?subject=${encodeURIComponent(m.assunto)}&body=${encodeURIComponent(m.corpo)}`;
      f.replaceChildren(
        h('p', { class: 'muted hint' }, m.para ? `Para: ${m.para}` : 'Esta tarefa não tem responsável com e-mail cadastrado — copie a mensagem e envie manualmente.'),
        field('Observação (opcional)', textarea('extra', extra, 2)),
        h('pre', { class: 'email-previa' }, `Assunto: ${m.assunto}

${m.corpo}`),
        h('div', { class: 'actions' },
          h('button', { type: 'button', class: 'btn', onclick: async () => { try { await navigator.clipboard.writeText(m.corpo); toast('Mensagem copiada'); } catch { toast('Não foi possível copiar'); } } }, icon('copy', 16), 'Copiar'),
          h('a', { class: 'btn primary', href: mailto, onclick: () => { registraCobranca(c.id, m.para); } }, icon('chat', 16), 'Abrir no e-mail')));
      f.elements.extra.addEventListener('change', draw);
    };
    draw(); openSheet('Cobrar por e-mail', f);
  }
  function registraCobranca(id, para) {
    const c = regCard(id); if (!c) return;
    const novo = { ...c }; registra(novo, { tipo: 'cobranca', para: para || c.resp, texto: 'Cobrança formal enviada por e-mail' });
    grava(novo); Store.touch();
  }

  /* ───── resumos para alertas e faixas ───── */
  const paraMim = () => Store.get().cards.filter(pendenteCiencia);
  const vencendo = () => {
    const t = today(), amanha = isoDate(new Date(Date.now() + 864e5));
    return Store.get().cards.filter(c => !c.arquivado && c.col !== 'done' && c.prazo && c.prazo >= t && c.prazo <= amanha && ehMeu(c));
  };
  const entreguesQueRepassei = () => {
    const corte = Date.now() - 72 * 36e5, eu = norm(meuNome());
    return Store.get().cards.filter(c => c.col === 'done' && !c.arquivado && c.concluidoEm > corte && eu && norm(c.repasse?.por) === eu && norm(c.concluidoPor) !== eu);
  };

  return { opcoes, respValido, podeCobrar, cobrarSheet, pessoa: porNome, ehMeu, pendenteCiencia, repassar, ciente, assumir, concluir, reabrir, nota, linhaDoTempo, repassarSheet, concluirSheet, atividadeSheet, listaPessoas, paraMim, vencendo, entreguesQueRepassei };
})();
