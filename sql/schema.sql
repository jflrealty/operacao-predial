-- ============================================================
-- OPERAÇÃO PREDIAL — Schema PostgreSQL
-- Multitenancy: usuário pode ter acesso a múltiplos prédios
-- Admins veem todos; membros ficam vinculados ao seu prédio
-- ============================================================

-- PRÉDIOS
CREATE TABLE predios (
  id        SERIAL PRIMARY KEY,
  nome      TEXT NOT NULL,
  slug      TEXT NOT NULL UNIQUE,
  ativo     BOOLEAN DEFAULT TRUE,
  criado_em TIMESTAMPTZ DEFAULT NOW()
);

-- USUÁRIOS (sem vínculo fixo com prédio — admins escolhem na sessão)
CREATE TABLE usuarios (
  id         SERIAL PRIMARY KEY,
  nome       TEXT NOT NULL,
  email      TEXT NOT NULL UNIQUE,
  senha_hash TEXT NOT NULL,
  cargo      TEXT,
  role       TEXT NOT NULL DEFAULT 'membro' CHECK (role IN ('superadmin','admin','membro')),
  ativo      BOOLEAN DEFAULT TRUE,
  criado_em  TIMESTAMPTZ DEFAULT NOW()
);

-- VÍNCULO USUÁRIO ↔ PRÉDIO (membro pode ser vinculado a 1+, admin ignora)
CREATE TABLE usuario_predios (
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  predio_id  INTEGER NOT NULL REFERENCES predios(id)  ON DELETE CASCADE,
  PRIMARY KEY (usuario_id, predio_id)
);

-- TÍQUETES
CREATE TABLE tickets (
  id               SERIAL PRIMARY KEY,
  predio_id        INTEGER NOT NULL REFERENCES predios(id) ON DELETE CASCADE,
  titulo           TEXT NOT NULL,
  descricao        TEXT,
  categoria        TEXT,
  local            TEXT,
  origem           TEXT,
  prioridade       TEXT NOT NULL DEFAULT 'Média' CHECK (prioridade IN ('Baixa','Média','Alta')),
  status           TEXT NOT NULL DEFAULT 'aberto'
                     CHECK (status IN ('aberto','em andamento','feedback ao cliente','resolvido')),
  autor_id         INTEGER REFERENCES usuarios(id),
  autor_nome       TEXT,
  responsavel_id   INTEGER REFERENCES usuarios(id),
  responsavel_nome TEXT,
  prazo            DATE,
  criado_em        TIMESTAMPTZ DEFAULT NOW(),
  atualizado_em    TIMESTAMPTZ DEFAULT NOW()
);

-- HISTÓRICO
CREATE TABLE ticket_historico (
  id         SERIAL PRIMARY KEY,
  ticket_id  INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  mensagem   TEXT NOT NULL,
  autor_id   INTEGER REFERENCES usuarios(id),
  autor_nome TEXT,
  criado_em  TIMESTAMPTZ DEFAULT NOW()
);

-- ATIVIDADES / CHECKLIST
CREATE TABLE ticket_atividades (
  id               SERIAL PRIMARY KEY,
  ticket_id        INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  titulo           TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','concluida')),
  responsavel_nome TEXT,
  prazo            DATE,
  criado_por       TEXT,
  criado_em        TIMESTAMPTZ DEFAULT NOW()
);

-- ÍNDICES
CREATE INDEX ON tickets (predio_id, status);
CREATE INDEX ON tickets (predio_id, prioridade);
CREATE INDEX ON tickets (predio_id, prazo);
CREATE INDEX ON ticket_historico (ticket_id);
CREATE INDEX ON ticket_atividades (ticket_id);
CREATE INDEX ON usuario_predios (usuario_id);
CREATE INDEX ON usuario_predios (predio_id);

-- ============================================================
-- SEED
-- ============================================================

-- Prédio inicial
INSERT INTO predios (nome, slug) VALUES ('JML', 'jml');

-- Super-admin: acessa todos os prédios sem vínculo
-- Senha: admin123  (TROQUE após o primeiro acesso)
INSERT INTO usuarios (nome, email, senha_hash, cargo, role)
VALUES (
  'Administrador',
  'admin@operacao.com',
  '$2a$10$VjtAZR6JmG1ThRiEgCTvWuwN.eU/ULET4rzlOiyGQ1tqV1Dwj1My2',
  'TI',
  'superadmin'
);
-- Obs: hash acima = "admin123" gerado com bcryptjs rounds=10
-- Para gerar novo hash: node -e "const b=require('bcryptjs');console.log(b.hashSync('SUASENHA',10))"
