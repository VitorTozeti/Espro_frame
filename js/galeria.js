/* Galeria de eventos: cada item é um álbum de fotos com título, data, descrição e array de fotos.
   Fotos guardadas via Store.addMidia (mesma biblioteca de mídia da revista). */
const Galeria = (() => {
  const podeGerir = () => Sync.conectado() && Sync.gestor();

  /* ───── sheet: criar/editar álbum ───── */
  function albumSheet(album) {
    const novo = !album;
    const a = album || { id: Store.uid(), titulo: '', data: today(), descricao: '', fotos: [], eventoId: '' };
    const S = Store.get();
    const eventosLivres = S.eventos.filter(e => e.tipo === 'evento' && !S.galeria.some(g => g.eventoId === e.id && g.id !== a.id));

    const fotosState = [...(a.fotos || [])];
    const fotosBox = h('div', { class: 'galeria-fotos' });

    const drawFotos = () => {
      fotosBox.replaceChildren(
        ...fotosState.map((f, i) => {
          const src = typeof f === 'string' ? (f.startsWith('img:') ? (S.midia?.[f.slice(4)] || '') : f) : '';
          return h('div', { class: 'galeria-thumb' },
            src ? h('img', { src, alt: `Foto ${i + 1}` }) : h('span', { class: 'ph' }, '?'),
            h('button', { type: 'button', class: 'galeria-rm', 'aria-label': 'Remover foto', onclick: () => { fotosState.splice(i, 1); drawFotos(); } }, '×'));
        }),
        h('label', { class: 'galeria-add' },
          h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true, onchange: async ev => {
            for (const file of ev.target.files) {
              try {
                const { src } = await resizeImage(file, 1600);
                fotosState.push(Store.addMidia(src));
              } catch { toast('Imagem inválida'); }
            }
            drawFotos();
            ev.target.value = '';
          } }),
          icon('plus', 20), h('small', {}, 'Adicionar'))
      );
    };
    drawFotos();

    const f = h('form', { class: 'form', onsubmit: ev => {
      ev.preventDefault();
      const d = Object.fromEntries(new FormData(f));
      Store.upsert('galeria', { ...a, titulo: d.titulo.trim(), data: d.data, descricao: d.descricao.trim(), eventoId: d.eventoId || '', fotos: [...fotosState] });
      closeSheet(); toast(novo ? 'Álbum criado' : 'Álbum salvo');
    } },
      field('Título', input('titulo', a.titulo, { required: true, placeholder: 'Ex.: Workshop de Moda — Set/2026' })),
      h('div', { class: 'row' },
        field('Data', input('data', a.data || '', { type: 'date' })),
        eventosLivres.length ? field('Vincular a evento', selectEl('eventoId', [['', 'Nenhum'], ...eventosLivres.map(e => [e.id, e.titulo])], a.eventoId)) : h('input', { type: 'hidden', name: 'eventoId', value: a.eventoId || '' })),
      field('Descrição curta', textarea('descricao', a.descricao || '', 2)),
      h('div', { class: 'field' }, h('span', {}, `Fotos (${fotosState.length})`), fotosBox),
      h('div', { class: 'actions' },
        novo ? null : h('button', { type: 'button', class: 'btn danger', onclick: () => {
          if (!confirm(`Excluir o álbum "${a.titulo}"?`)) return;
          Store.remove('galeria', a.id); closeSheet(); toast('Álbum excluído');
        } }, 'Excluir'),
        h('button', { type: 'submit', class: 'btn primary' }, novo ? 'Criar álbum' : 'Salvar')));
    openSheet(novo ? 'Novo álbum de evento' : 'Editar álbum', f);
  }

  /* ───── view: lista de álbuns ───── */
  function view() {
    const S = Store.get(), gestor = podeGerir();
    const albums = [...S.galeria].sort((a, b) => (b.data || '').localeCompare(a.data || ''));

    const resolverSrc = ref => {
      if (!ref) return '';
      if (typeof ref !== 'string') return '';
      if (ref.startsWith('data:')) return ref;
      if (ref.startsWith('img:')) return S.midia?.[ref.slice(4)] || '';
      return ref;
    };

    return h('div', { class: 'stack' },
      h('section', { class: 'sec-head' },
        h('div', {},
          h('p', { class: 'eyebrow' }, 'Galeria de eventos'),
          h('h2', {}, `${albums.length} ${albums.length === 1 ? 'álbum' : 'álbuns'}`)),
        gestor ? h('button', { class: 'btn small primary', type: 'button', onclick: () => albumSheet() }, icon('plus', 14), 'Novo álbum') : null),

      h('div', { class: 'row-btn', style: 'margin-bottom:12px' },
        h('a', { class: 'btn small', href: 'vitrine.html', target: '_blank', rel: 'noopener' }, icon('present', 14), 'Abrir vitrine pública')),

      albums.length ? h('div', { class: 'galeria-grid' }, ...albums.map(a => {
        const fotos = (a.fotos || []).map(resolverSrc).filter(Boolean);
        return h('article', { class: 'galeria-card' },
          h('div', { class: 'galeria-capa', onclick: gestor ? () => albumSheet(a) : null },
            fotos[0] ? h('img', { src: fotos[0], alt: a.titulo }) : h('div', { class: 'ph' }, icon('image', 32)),
            h('span', { class: 'galeria-count' }, `${fotos.length} foto${fotos.length !== 1 ? 's' : ''}`)),
          h('div', { class: 'galeria-info' },
            h('b', {}, a.titulo),
            a.data ? h('small', { class: 'muted' }, fmtShort(a.data)) : null,
            a.descricao ? h('small', { class: 'muted' }, a.descricao) : null));
      })) : h('p', { class: 'empty' }, gestor ? 'Nenhum álbum ainda. Crie um para registrar fotos de eventos.' : 'Nenhum álbum de evento publicado.'));
  }

  return { view, albumSheet };
})();
