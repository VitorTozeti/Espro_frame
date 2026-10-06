-- Esquema do D1 (equipe). Rodar uma vez:  wrangler d1 execute espro --remote --file=schema.sql
CREATE TABLE IF NOT EXISTS items (
  kind TEXT NOT NULL,            -- setores | cards | eventos | paginas | comentarios | versoes | edicoes | meta | ordem
  id   TEXT NOT NULL,
  u    INTEGER NOT NULL,         -- carimbo do cliente (ms) — "último a editar vence"
  del  INTEGER NOT NULL DEFAULT 0,
  data TEXT,                     -- JSON do item (NULL quando apagado)
  rev  INTEGER NOT NULL,         -- contador do servidor, usado como cursor de sincronização
  PRIMARY KEY (kind, id)
);
CREATE INDEX IF NOT EXISTS idx_items_rev ON items (rev);

CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v INTEGER NOT NULL);
INSERT OR IGNORE INTO meta (k, v) VALUES ('rev', 0);

CREATE TABLE IF NOT EXISTS midia (        -- imagens da revista (data-URL), por id de conteúdo
  id   TEXT PRIMARY KEY,
  data TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS presence (     -- quem está editando qual página
  pagina TEXT NOT NULL,
  nome   TEXT NOT NULL,
  ts     INTEGER NOT NULL,
  PRIMARY KEY (pagina, nome)
);

CREATE TABLE IF NOT EXISTS publico (      -- edições publicadas com link público de leitura (HTML pronto)
  id   TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  html TEXT NOT NULL,
  u    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS config (k TEXT PRIMARY KEY, v TEXT NOT NULL);   -- chave que assina os logins (criada sozinha)

CREATE TABLE IF NOT EXISTS usuarios (     -- contas: e-mail + senha; cargo = admin (fixo pelo e-mail) | gestor | membro
  email TEXT PRIMARY KEY,
  nome  TEXT NOT NULL,
  cargo TEXT NOT NULL DEFAULT 'membro',
  setor TEXT NOT NULL DEFAULT '',            -- id do setor da pessoa (definido pelo admin)
  salt  TEXT NOT NULL,
  hash  TEXT NOT NULL,
  criado INTEGER NOT NULL
);
