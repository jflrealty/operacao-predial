// ============================================================
// OPERAÇÃO PREDIAL — Backend
// Express + PostgreSQL + JWT  |  Zero Supabase
// ============================================================

const express  = require('express');
const { Pool } = require('pg');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const cors     = require('cors');
const path     = require('path');

const app    = express();
const PORT   = process.env.PORT || 3000;
const SECRET = process.env.JWT_SECRET || 'dev-secret-troque-em-producao';

// ── POOL ─────────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// ── MIDDLEWARE ────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── AUTH MIDDLEWARE ───────────────────────────────────────────
function auth(req, res, next) {
  const h = req.headers.authorization;
  if (!h) return res.status(401).json({ erro: 'Sem token' });
  try {
    req.user = jwt.verify(h.replace('Bearer ', ''), SECRET);
    next();
  } catch {
    res.status(401).json({ erro: 'Token inválido' });
  }
}

// Garante que o usuário tem acesso ao prédio ativo na sessão
function comPredio(req, res, next) {
  const pid = parseInt(req.headers['x-predio-id']);
  if (!pid) return res.status(400).json({ erro: 'Prédio não selecionado' });

  // superadmin/admin: acesso livre
  if (req.user.role === 'superadmin' || req.user.role === 'admin') {
    req.predio_id = pid;
    return next();
  }

  // membro: verifica vínculo
  pool.query(
    'SELECT 1 FROM usuario_predios WHERE usuario_id=$1 AND predio_id=$2',
    [req.user.id, pid]
  ).then(({ rows }) => {
    if (!rows.length) return res.status(403).json({ erro: 'Sem acesso a este prédio' });
    req.predio_id = pid;
    next();
  }).catch(() => res.status(500).json({ erro: 'Erro interno' }));
}

function adminOnly(req, res, next) {
  if (!['superadmin','admin'].includes(req.user.role))
    return res.status(403).json({ erro: 'Apenas admins' });
  next();
}

function superOnly(req, res, next) {
  if (req.user.role !== 'superadmin')
    return res.status(403).json({ erro: 'Apenas superadmin' });
  next();
}

// ── AUTH ──────────────────────────────────────────────────────

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  const { email, senha } = req.body;
  if (!email || !senha) return res.status(400).json({ erro: 'E-mail e senha obrigatórios' });
  try {
    const { rows } = await pool.query(
      'SELECT * FROM usuarios WHERE email=$1 AND ativo=TRUE',
      [email.toLowerCase().trim()]
    );
    const u = rows[0];
    if (!u || !(await bcrypt.compare(senha, u.senha_hash)))
      return res.status(401).json({ erro: 'E-mail ou senha incorretos' });

    // Busca prédios que o usuário pode acessar
    let predios = [];
    if (u.role === 'superadmin' || u.role === 'admin') {
      const { rows: ps } = await pool.query(
        'SELECT id, nome, slug FROM predios WHERE ativo=TRUE ORDER BY nome'
      );
      predios = ps;
    } else {
      const { rows: ps } = await pool.query(
        `SELECT p.id, p.nome, p.slug FROM predios p
         JOIN usuario_predios up ON up.predio_id = p.id
         WHERE up.usuario_id=$1 AND p.ativo=TRUE ORDER BY p.nome`,
        [u.id]
      );
      predios = ps;
    }

    const token = jwt.sign(
      { id: u.id, role: u.role, nome: u.nome, email: u.email, cargo: u.cargo },
      SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      usuario: { id: u.id, nome: u.nome, email: u.email, cargo: u.cargo, role: u.role },
      predios,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ erro: 'Erro interno' });
  }
});

// GET /api/auth/me  — retorna usuário + prédios acessíveis
app.get('/api/auth/me', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, nome, email, cargo, role FROM usuarios WHERE id=$1',
      [req.user.id]
    );
    const u = rows[0];
    if (!u) return res.status(404).json({ erro: 'Não encontrado' });

    let predios = [];
    if (u.role === 'superadmin' || u.role === 'admin') {
      const { rows: ps } = await pool.query(
        'SELECT id, nome, slug FROM predios WHERE ativo=TRUE ORDER BY nome'
      );
      predios = ps;
    } else {
      const { rows: ps } = await pool.query(
        `SELECT p.id, p.nome, p.slug FROM predios p
         JOIN usuario_predios up ON up.predio_id=p.id
         WHERE up.usuario_id=$1 AND p.ativo=TRUE ORDER BY p.nome`,
        [u.id]
      );
      predios = ps;
    }

    res.json({ ...u, predios });
  } catch (e) {
    res.status(500).json({ erro: 'Erro interno' });
  }
});

// ── PRÉDIOS ───────────────────────────────────────────────────

// GET /api/predios — lista todos (admin+)
app.get('/api/predios', auth, adminOnly, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM predios ORDER BY nome');
  res.json(rows);
});

// POST /api/predios — superadmin cria novo prédio
app.post('/api/predios', auth, superOnly, async (req, res) => {
  const { nome, slug } = req.body;
  if (!nome || !slug) return res.status(400).json({ erro: 'Nome e slug obrigatórios' });
  try {
    const { rows } = await pool.query(
      'INSERT INTO predios (nome, slug) VALUES ($1,$2) RETURNING *',
      [nome, slug.toLowerCase().replace(/\s+/g,'-')]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ erro: 'Slug já existe' });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

// PATCH /api/predios/:id — renomear/ativar/desativar
app.patch('/api/predios/:id', auth, superOnly, async (req, res) => {
  const { nome, ativo } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE predios SET
         nome  = COALESCE($1, nome),
         ativo = COALESCE($2, ativo)
       WHERE id=$3 RETURNING *`,
      [nome||null, ativo!=null?ativo:null, req.params.id]
    );
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ erro: 'Erro interno' });
  }
});

// ── USUÁRIOS ──────────────────────────────────────────────────

// GET /api/usuarios — lista membros (filtra por prédio se x-predio-id vier)
app.get('/api/usuarios', auth, adminOnly, async (req, res) => {
  const pid = parseInt(req.headers['x-predio-id']);
  try {
    let rows;
    if (pid) {
      ({ rows } = await pool.query(
        `SELECT u.id, u.nome, u.email, u.cargo, u.role, u.ativo
         FROM usuarios u
         JOIN usuario_predios up ON up.usuario_id=u.id
         WHERE up.predio_id=$1 ORDER BY u.nome`,
        [pid]
      ));
    } else {
      ({ rows } = await pool.query(
        'SELECT id, nome, email, cargo, role, ativo FROM usuarios ORDER BY nome'
      ));
    }
    res.json(rows);
  } catch (e) {
    res.status(500).json({ erro: 'Erro interno' });
  }
});

// POST /api/usuarios — admin cria membro e vincula ao prédio atual
app.post('/api/usuarios', auth, adminOnly, async (req, res) => {
  const { nome, email, senha, cargo, role, predio_ids } = req.body;
  if (!nome || !email || !senha) return res.status(400).json({ erro: 'Nome, e-mail e senha obrigatórios' });
  if (senha.length < 6) return res.status(400).json({ erro: 'Senha mínimo 6 caracteres' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const hash = await bcrypt.hash(senha, 10);
    const { rows } = await client.query(
      `INSERT INTO usuarios (nome, email, senha_hash, cargo, role)
       VALUES ($1,$2,$3,$4,$5) RETURNING id, nome, email, cargo, role`,
      [nome, email.toLowerCase().trim(), hash, cargo||null, role||'membro']
    );
    const u = rows[0];

    // Vincula aos prédios informados
    const pids = predio_ids && predio_ids.length ? predio_ids : [];
    for (const pid of pids) {
      await client.query(
        'INSERT INTO usuario_predios (usuario_id, predio_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
        [u.id, pid]
      );
    }

    await client.query('COMMIT');
    res.status(201).json(u);
  } catch (e) {
    await client.query('ROLLBACK');
    if (e.code === '23505') return res.status(409).json({ erro: 'E-mail já cadastrado' });
    res.status(500).json({ erro: 'Erro interno' });
  } finally {
    client.release();
  }
});

// DELETE /api/usuarios/:id — desativa (soft delete)
app.delete('/api/usuarios/:id', auth, adminOnly, async (req, res) => {
  if (parseInt(req.params.id) === req.user.id)
    return res.status(400).json({ erro: 'Não pode remover a si mesmo' });
  await pool.query('UPDATE usuarios SET ativo=FALSE WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

// ── TICKETS ───────────────────────────────────────────────────

// GET /api/tickets
app.get('/api/tickets', auth, comPredio, async (req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM tickets WHERE predio_id=$1 ORDER BY criado_em DESC',
    [req.predio_id]
  );
  res.json(rows);
});

// POST /api/tickets
app.post('/api/tickets', auth, comPredio, async (req, res) => {
  const { titulo, descricao, categoria, local, origem, prioridade, prazo, responsavel_id } = req.body;
  if (!titulo || !categoria || !origem)
    return res.status(400).json({ erro: 'Título, categoria e origem obrigatórios' });

  try {
    let responsavel_nome = null;
    if (responsavel_id) {
      const { rows } = await pool.query('SELECT nome FROM usuarios WHERE id=$1', [responsavel_id]);
      responsavel_nome = rows[0]?.nome || null;
    }

    const { rows } = await pool.query(
      `INSERT INTO tickets
         (predio_id,titulo,descricao,categoria,local,origem,prioridade,
          status,autor_id,autor_nome,responsavel_id,responsavel_nome,prazo)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'aberto',$8,$9,$10,$11,$12)
       RETURNING *`,
      [req.predio_id, titulo, descricao||null, categoria, local||null, origem,
       prioridade||'Média', req.user.id, req.user.nome, responsavel_id||null, responsavel_nome, prazo||null]
    );
    const t = rows[0];

    await pool.query(
      'INSERT INTO ticket_historico (ticket_id,mensagem,autor_id,autor_nome) VALUES ($1,$2,$3,$4)',
      [t.id, `Aberto por ${req.user.nome} via ${origem}`, req.user.id, req.user.nome]
    );

    res.status(201).json(t);
  } catch (e) {
    console.error(e);
    res.status(500).json({ erro: 'Erro interno' });
  }
});

// PATCH /api/tickets/:id/status
app.patch('/api/tickets/:id/status', auth, comPredio, async (req, res) => {
  const { status } = req.body;
  const validos = ['aberto','em andamento','feedback ao cliente','resolvido'];
  if (!validos.includes(status)) return res.status(400).json({ erro: 'Status inválido' });

  const { rows } = await pool.query(
    'UPDATE tickets SET status=$1,atualizado_em=NOW() WHERE id=$2 AND predio_id=$3 RETURNING *',
    [status, req.params.id, req.predio_id]
  );
  if (!rows[0]) return res.status(404).json({ erro: 'Não encontrado' });

  await pool.query(
    'INSERT INTO ticket_historico (ticket_id,mensagem,autor_id,autor_nome) VALUES ($1,$2,$3,$4)',
    [req.params.id, `Status → ${status}`, req.user.id, req.user.nome]
  );

  res.json(rows[0]);
});

// ── HISTÓRICO ────────────────────────────────────────────────

app.get('/api/tickets/:id/historico', auth, comPredio, async (req, res) => {
  const { rows: tk } = await pool.query(
    'SELECT id FROM tickets WHERE id=$1 AND predio_id=$2', [req.params.id, req.predio_id]
  );
  if (!tk[0]) return res.status(404).json({ erro: 'Não encontrado' });
  const { rows } = await pool.query(
    'SELECT * FROM ticket_historico WHERE ticket_id=$1 ORDER BY criado_em DESC', [req.params.id]
  );
  res.json(rows);
});

app.post('/api/tickets/:id/historico', auth, comPredio, async (req, res) => {
  const { mensagem } = req.body;
  if (!mensagem) return res.status(400).json({ erro: 'Mensagem obrigatória' });
  const { rows: tk } = await pool.query(
    'SELECT id FROM tickets WHERE id=$1 AND predio_id=$2', [req.params.id, req.predio_id]
  );
  if (!tk[0]) return res.status(404).json({ erro: 'Não encontrado' });
  const { rows } = await pool.query(
    'INSERT INTO ticket_historico (ticket_id,mensagem,autor_id,autor_nome) VALUES ($1,$2,$3,$4) RETURNING *',
    [req.params.id, mensagem, req.user.id, req.user.nome]
  );
  await pool.query('UPDATE tickets SET atualizado_em=NOW() WHERE id=$1', [req.params.id]);
  res.status(201).json(rows[0]);
});

// ── ATIVIDADES ───────────────────────────────────────────────

app.get('/api/tickets/:id/atividades', auth, comPredio, async (req, res) => {
  const { rows: tk } = await pool.query(
    'SELECT id FROM tickets WHERE id=$1 AND predio_id=$2', [req.params.id, req.predio_id]
  );
  if (!tk[0]) return res.status(404).json({ erro: 'Não encontrado' });
  const { rows } = await pool.query(
    'SELECT * FROM ticket_atividades WHERE ticket_id=$1 ORDER BY criado_em ASC', [req.params.id]
  );
  res.json(rows);
});

app.post('/api/tickets/:id/atividades', auth, comPredio, async (req, res) => {
  const { titulo, responsavel_nome, prazo } = req.body;
  if (!titulo) return res.status(400).json({ erro: 'Título obrigatório' });
  const { rows: tk } = await pool.query(
    'SELECT id FROM tickets WHERE id=$1 AND predio_id=$2', [req.params.id, req.predio_id]
  );
  if (!tk[0]) return res.status(404).json({ erro: 'Não encontrado' });
  const { rows } = await pool.query(
    'INSERT INTO ticket_atividades (ticket_id,titulo,responsavel_nome,prazo,criado_por) VALUES ($1,$2,$3,$4,$5) RETURNING *',
    [req.params.id, titulo, responsavel_nome||null, prazo||null, req.user.nome]
  );
  res.status(201).json(rows[0]);
});

app.patch('/api/atividades/:id/toggle', auth, async (req, res) => {
  const { rows } = await pool.query(
    `UPDATE ticket_atividades
     SET status = CASE WHEN status='concluida' THEN 'pendente' ELSE 'concluida' END
     WHERE id=$1 RETURNING *`,
    [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ erro: 'Não encontrado' });
  res.json(rows[0]);
});

// ── STATS ─────────────────────────────────────────────────────

app.get('/api/stats', auth, comPredio, async (req, res) => {
  const pid  = req.predio_id;
  const hoje = new Date().toISOString().split('T')[0];
  const [a,b,c,d] = await Promise.all([
    pool.query(`SELECT COUNT(*) FROM tickets WHERE predio_id=$1 AND status='aberto'`, [pid]),
    pool.query(`SELECT COUNT(*) FROM tickets WHERE predio_id=$1 AND status='em andamento'`, [pid]),
    pool.query(`SELECT COUNT(*) FROM tickets WHERE predio_id=$1 AND status='resolvido'`, [pid]),
    pool.query(`SELECT COUNT(*) FROM tickets WHERE predio_id=$1 AND prazo::date=$2 AND status!='resolvido'`, [pid, hoje]),
  ]);
  res.json({
    aberto:    parseInt(a.rows[0].count),
    andamento: parseInt(b.rows[0].count),
    resolvido: parseInt(c.rows[0].count),
    hoje:      parseInt(d.rows[0].count),
  });
});

// ── SPA FALLBACK ──────────────────────────────────────────────
app.get('*', (_, res) =>
  res.sendFile(path.join(__dirname, 'public/index.html'))
);

// ── AUTO-MIGRATE + SEED ───────────────────────────────────────
async function migrate() {
  const client = await pool.connect();
  try {
    console.log('🔄 Verificando banco de dados...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS predios (
        id        SERIAL PRIMARY KEY,
        nome      TEXT NOT NULL,
        slug      TEXT NOT NULL UNIQUE,
        ativo     BOOLEAN DEFAULT TRUE,
        criado_em TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS usuarios (
        id         SERIAL PRIMARY KEY,
        nome       TEXT NOT NULL,
        email      TEXT NOT NULL UNIQUE,
        senha_hash TEXT NOT NULL,
        cargo      TEXT,
        role       TEXT NOT NULL DEFAULT 'membro'
                     CHECK (role IN ('superadmin','admin','membro')),
        ativo      BOOLEAN DEFAULT TRUE,
        criado_em  TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS usuario_predios (
        usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        predio_id  INTEGER NOT NULL REFERENCES predios(id)  ON DELETE CASCADE,
        PRIMARY KEY (usuario_id, predio_id)
      );

      CREATE TABLE IF NOT EXISTS tickets (
        id               SERIAL PRIMARY KEY,
        predio_id        INTEGER NOT NULL REFERENCES predios(id) ON DELETE CASCADE,
        titulo           TEXT NOT NULL,
        descricao        TEXT,
        categoria        TEXT,
        local            TEXT,
        origem           TEXT,
        prioridade       TEXT NOT NULL DEFAULT 'Média'
                           CHECK (prioridade IN ('Baixa','Média','Alta')),
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

      CREATE TABLE IF NOT EXISTS ticket_historico (
        id         SERIAL PRIMARY KEY,
        ticket_id  INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        mensagem   TEXT NOT NULL,
        autor_id   INTEGER REFERENCES usuarios(id),
        autor_nome TEXT,
        criado_em  TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS ticket_atividades (
        id               SERIAL PRIMARY KEY,
        ticket_id        INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        titulo           TEXT NOT NULL,
        status           TEXT NOT NULL DEFAULT 'pendente'
                           CHECK (status IN ('pendente','concluida')),
        responsavel_nome TEXT,
        prazo            DATE,
        criado_por       TEXT,
        criado_em        TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Índices (ignora se já existem)
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_tickets_predio_status   ON tickets (predio_id, status);
      CREATE INDEX IF NOT EXISTS idx_tickets_predio_prio     ON tickets (predio_id, prioridade);
      CREATE INDEX IF NOT EXISTS idx_tickets_predio_prazo    ON tickets (predio_id, prazo);
      CREATE INDEX IF NOT EXISTS idx_historico_ticket        ON ticket_historico (ticket_id);
      CREATE INDEX IF NOT EXISTS idx_atividades_ticket       ON ticket_atividades (ticket_id);
      CREATE INDEX IF NOT EXISTS idx_usuario_predios_uid     ON usuario_predios (usuario_id);
      CREATE INDEX IF NOT EXISTS idx_usuario_predios_pid     ON usuario_predios (predio_id);
    `);

    // Seed: prédio JML + superadmin (só se não existirem)
    const { rows: predioRows } = await client.query(
      "SELECT id FROM predios WHERE slug='jml'"
    );
    if (!predioRows.length) {
      await client.query(
        "INSERT INTO predios (nome, slug) VALUES ('JML', 'jml')"
      );
      console.log('🏢 Prédio JML criado');
    }

    const { rows: adminRows } = await client.query(
      "SELECT id FROM usuarios WHERE email='admin@operacao.com'"
    );
    if (!adminRows.length) {
      // Senha: admin123
      const hash = await bcrypt.hash('admin123', 10);
      await client.query(
        `INSERT INTO usuarios (nome, email, senha_hash, cargo, role)
         VALUES ('Administrador', 'admin@operacao.com', $1, 'TI', 'superadmin')`,
        [hash]
      );
      console.log('👤 Superadmin criado — admin@operacao.com / admin123');
    }

    console.log('✅ Banco pronto');
  } catch (e) {
    console.error('❌ Erro na migração:', e.message);
    throw e;
  } finally {
    client.release();
  }
}

// ── START ─────────────────────────────────────────────────────
migrate()
  .then(() => app.listen(PORT, () => console.log(`🚀 Servidor na porta ${PORT}`)))
  .catch(e => { console.error('Falha fatal:', e.message); process.exit(1); });
