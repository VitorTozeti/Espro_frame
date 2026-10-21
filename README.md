# ESPRO — Revista

Site estático (HTML/CSS/JS puro, sem build), mobile first, com servidor opcional para a equipe (Cloudflare Pages Functions + D1).

**Telas:** Início (alertas) · Quadro (kanban por setor) · Agenda (calendário) · Revista (edição, prévia em página única/dupla, exportação) · **Editor de páginas** em tela cheia.

## Rodar local (modo individual, dados no navegador via IndexedDB)

    python -m http.server 8793

## Publicar na Cloudflare Pages (com equipe)

1. `wrangler d1 create espro` → copie o `database_id` para o `wrangler.toml`.
2. `wrangler d1 execute espro --remote --file=schema.sql`
3. Nada de segredos: as tabelas e a chave dos logins são criadas sozinhas no 1º acesso. Contas = e-mail + senha; `vitortozeti@gmail.com` é o administrador (mude com a variável opcional `ADMIN_EMAIL`). **Crie a conta do administrador primeiro**, antes de divulgar o link.
4. `wrangler pages deploy . --project-name espro` (a pasta `functions/` vira a API `/api/*`).
5. No site: toque no nome da empresa → **Equipe na nuvem** → **Criar conta** (e-mail + senha). O administrador define gestores(as) em *Gerenciar cargos*.

Sem servidor o app funciona 100% local (Exportar/Importar backup no mesmo menu).

## Avisos no celular e e-mail automático

- **Push (app fechado):** nada a configurar. As chaves VAPID são criadas sozinhas no D1. Cada pessoa toca no sino → **Ativar avisos**. No iPhone, primeiro "Adicionar à Tela de Início" (iOS 16.4+).
- **E-mail automático** (repasse, prazo, cobrança formal): crie uma conta no [Resend](https://resend.com), verifique um domínio e, no painel do Pages, adicione as variáveis `RESEND_API_KEY` e `EMAIL_FROM` (ex.: `ESPRO <avisos@seudominio.com>`). Opcional: `SITE_URL`. Sem a chave, o app continua funcionando e a cobrança usa o "Abrir no meu e-mail".
- **Lembrete de prazo:** roda 1x por dia, puxado pela 1ª requisição do dia (Pages não tem cron).

## Estrutura

| Arquivo | Papel |
|---|---|
| `js/store.js` | estado, IndexedDB, carimbos `_u`, mídia, vínculo página↔tarefa |
| `js/rich.js` | sanitizador, texto rico, figuras e caixas de texto |
| `js/editor.js` | editor em tela cheia (objetos, guias, pinça, histórico, autosave, equipe) |
| `js/views.js` | Início, Quadro, Agenda, Revista |
| `js/extras.js` | modelos de página, planejar edição, biblioteca, paleta Ctrl+K |
| `js/qualidade.js` | verificador, exportar PDF/HTML, apresentação |
| `js/equipe.js` | comentários, revisão, versões, alertas |
| `js/sync.js` | sincronização com `/api` (último a editar vence) |
| `js/avisos.js` + `sw.js` | sino de avisos, Web Push (service worker) |
| `js/perfil.js` | perfil (foto, função, bio) e organograma |
| `functions/` | API (`_lib/api.js`; `_lib/avisos.js` push/e-mail/lembretes; `_lib/d1.js` repositório D1) |

> O D1 em produção **não foi testado aqui**: a lógica da API (login, sync, mídia, presença) foi testada contra um repositório em memória com a mesma interface; o SQL de `functions/_lib/d1.js` e o `schema.sql` precisam do primeiro teste real no deploy.
