// ============================================================
// OPERAÇÃO JFL Inc — Backend
// Express + PostgreSQL + JWT | Nodemailer | PDFKit | ExcelJS | Multer
// ============================================================

const express      = require('express');
const { Pool }     = require('pg');
const bcrypt       = require('bcryptjs');
const jwt          = require('jsonwebtoken');
const cors         = require('cors');
const path         = require('path');
const fs           = require('fs');
const nodemailer   = require('nodemailer');
const multer       = require('multer');
const PDFDocument  = require('pdfkit');
const ExcelJS      = require('exceljs');

const app    = express();
const PORT   = process.env.PORT || 3000;
const SECRET = process.env.JWT_SECRET || 'dev-secret-troque-em-producao';
const APP_URL = process.env.APP_URL || 'https://operacao-predial-production.up.railway.app';

// ── UPLOAD DIR ────────────────────────────────────────────────
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ── MULTER ────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename:    (req, file, cb) => {
    const ext  = path.extname(file.originalname).toLowerCase();
    const name = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    cb(null, name);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg','.jpeg','.png','.webp','.gif','.pdf'];
    cb(null, allowed.includes(path.extname(file.originalname).toLowerCase()));
  },
});

// ── NODEMAILER ────────────────────────────────────────────────
const mailer = nodemailer.createTransport({
  host:   process.env.SMTP_HOST   || 'smtp.gmail.com',
  port:   parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
  },
});

async function enviarEmail({ to, subject, html }) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.log(`[EMAIL] SMTP não configurado — pulando envio para ${to}`);
    return;
  }
  if (!to || !to.includes('@')) { console.log(`[EMAIL] Destinatário inválido: ${to}`); return; }
  try {
    console.log(`[EMAIL] Enviando para ${to} | assunto: ${subject}`);
    const info = await mailer.sendMail({
      from: `"Operação JFL Inc" <${process.env.SMTP_USER}>`,
      to, subject, html,
    });
    console.log(`[EMAIL] ✅ Enviado! MessageId: ${info.messageId}`);
  } catch (e) {
    console.error(`[EMAIL] ❌ Erro ao enviar para ${to}:`, e.message);
  }
}

// ── EMAIL TEMPLATES ───────────────────────────────────────────

function emailBoasVindas({ nome, email, senha, predios, role }) {
  const link = APP_URL;
  const prediosList = predios.length ? predios.join(', ') : '(a definir)';
  return {
    to: email,
    subject: `[JFL] Bem-vindo ao sistema de Operação Predial!`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
        <div style="background:#1A1917;color:#fff;padding:20px 24px;border-radius:8px 8px 0 0;">
          <h2 style="margin:0;font-size:18px;">⬡ Operação JFL Inc</h2>
        </div>
        <div style="background:#f9f9f7;padding:28px 24px;border:1px solid #e2ded6;border-top:none;border-radius:0 0 8px 8px;">
          <p style="margin:0 0 16px;font-size:16px;color:#1a1917;">Olá, <strong>${nome}</strong>! 👋</p>
          <p style="margin:0 0 20px;font-size:14px;color:#6b6860;line-height:1.6;">
            Seu acesso ao sistema de Operação Predial da JFL Inc foi criado. Use as credenciais abaixo para entrar e você será solicitado a trocar a senha no primeiro acesso.
          </p>
          <div style="background:#fff;border:1px solid #e2ded6;border-radius:8px;padding:20px;margin-bottom:20px;">
            <table style="width:100%;border-collapse:collapse;font-size:14px;">
              <tr><td style="padding:8px 0;color:#6b6860;width:110px;">🔗 Link</td><td style="padding:8px 0;"><a href="${link}" style="color:#1A4F8A;">${link}</a></td></tr>
              <tr><td style="padding:8px 0;color:#6b6860;">📧 E-mail</td><td style="padding:8px 0;font-weight:600;">${email}</td></tr>
              <tr><td style="padding:8px 0;color:#6b6860;">🔑 Senha</td><td style="padding:8px 0;font-family:monospace;background:#f0eee8;padding:4px 8px;border-radius:4px;font-size:15px;font-weight:600;">${senha}</td></tr>
              <tr><td style="padding:8px 0;color:#6b6860;">🏢 Prédios</td><td style="padding:8px 0;">${prediosList}</td></tr>
              <tr><td style="padding:8px 0;color:#6b6860;">👤 Perfil</td><td style="padding:8px 0;">${role}</td></tr>
            </table>
          </div>
          <a href="${link}" style="display:inline-block;background:#1A1917;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">
            Acessar o sistema →
          </a>
          <p style="margin:20px 0 0;font-size:12px;color:#a09d98;">
            Por segurança, troque sua senha assim que entrar. Se tiver dúvidas, fale com o administrador do sistema.
          </p>
        </div>
      </div>`,
  };
}

function emailTicketAberto(ticket, autorEmail) {
  return {
    to: autorEmail,
    subject: `[JFL] Ticket #${ticket.id} aberto — ${ticket.titulo}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
        <div style="background:#1A1917;color:#fff;padding:20px 24px;border-radius:8px 8px 0 0;">
          <h2 style="margin:0;font-size:18px;">⬡ Operação JFL Inc</h2>
        </div>
        <div style="background:#f9f9f7;padding:24px;border:1px solid #e2ded6;border-top:none;border-radius:0 0 8px 8px;">
          <p style="margin:0 0 16px;font-size:15px;color:#1a1917;">Ticket aberto com sucesso!</p>
          <table style="width:100%;border-collapse:collapse;font-size:14px;">
            <tr><td style="padding:8px 0;color:#6b6860;width:120px;">Ticket</td><td style="padding:8px 0;font-weight:600;">#${ticket.id}</td></tr>
            <tr><td style="padding:8px 0;color:#6b6860;">Título</td><td style="padding:8px 0;">${ticket.titulo}</td></tr>
            <tr><td style="padding:8px 0;color:#6b6860;">Categoria</td><td style="padding:8px 0;">${ticket.categoria||'—'}</td></tr>
            <tr><td style="padding:8px 0;color:#6b6860;">Prioridade</td><td style="padding:8px 0;">${ticket.prioridade}</td></tr>
            <tr><td style="padding:8px 0;color:#6b6860;">Local</td><td style="padding:8px 0;">${ticket.local||'—'}</td></tr>
            ${ticket.prazo ? `<tr><td style="padding:8px 0;color:#6b6860;">Prazo</td><td style="padding:8px 0;">${ticket.prazo}</td></tr>` : ''}
          </table>
          ${ticket.descricao ? `<div style="background:#fff;border:1px solid #e2ded6;border-radius:6px;padding:12px;margin-top:12px;font-size:14px;color:#1a1917;">${ticket.descricao}</div>` : ''}
        </div>
      </div>`,
  };
}

function emailStatusAtualizado(ticket, novoStatus, autorNome, responsavelEmail) {
  const cores = { aberto:'#1A4F8A','em andamento':'#92590A',resolvido:'#1E6B3C','feedback ao cliente':'#6B21A8' };
  const cor = cores[novoStatus] || '#1A1917';
  return {
    to: responsavelEmail,
    subject: `[JFL] Ticket #${ticket.id} → ${novoStatus}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
        <div style="background:#1A1917;color:#fff;padding:20px 24px;border-radius:8px 8px 0 0;">
          <h2 style="margin:0;font-size:18px;">⬡ Operação JFL Inc</h2>
        </div>
        <div style="background:#f9f9f7;padding:24px;border:1px solid #e2ded6;border-top:none;border-radius:0 0 8px 8px;">
          <p style="margin:0 0 12px;font-size:15px;color:#1a1917;">Status atualizado por <strong>${autorNome}</strong></p>
          <div style="display:inline-block;background:${cor}20;color:${cor};padding:6px 16px;border-radius:99px;font-size:13px;font-weight:600;margin-bottom:16px;">${novoStatus}</div>
          <table style="width:100%;border-collapse:collapse;font-size:14px;">
            <tr><td style="padding:8px 0;color:#6b6860;width:120px;">Ticket</td><td style="padding:8px 0;font-weight:600;">#${ticket.id}</td></tr>
            <tr><td style="padding:8px 0;color:#6b6860;">Título</td><td style="padding:8px 0;">${ticket.titulo}</td></tr>
          </table>
        </div>
      </div>`,
  };
}

function emailPrazoVencendo(ticket, predioNome, responsavelEmail) {
  const prazoFmt = new Date(ticket.prazo).toLocaleDateString('pt-BR');
  return {
    to: responsavelEmail,
    subject: `[JFL] ⏰ Ticket #${ticket.id} vence amanhã — ${ticket.titulo}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
        <div style="background:#92590A;color:#fff;padding:20px 24px;border-radius:8px 8px 0 0;">
          <h2 style="margin:0;font-size:18px;">⏰ Prazo vencendo amanhã</h2>
        </div>
        <div style="background:#fdf5e6;padding:24px;border:1px solid #e8d0a8;border-top:none;border-radius:0 0 8px 8px;">
          <p style="margin:0 0 16px;font-size:15px;color:#1a1917;">O ticket abaixo vence <strong>amanhã (${prazoFmt})</strong> e ainda não foi resolvido.</p>
          <table style="width:100%;border-collapse:collapse;font-size:14px;">
            <tr><td style="padding:8px 0;color:#6b6860;width:120px;">Ticket</td><td style="padding:8px 0;font-weight:600;">#${ticket.id}</td></tr>
            <tr><td style="padding:8px 0;color:#6b6860;">Título</td><td style="padding:8px 0;">${ticket.titulo}</td></tr>
            <tr><td style="padding:8px 0;color:#6b6860;">Prédio</td><td style="padding:8px 0;">${predioNome}</td></tr>
            <tr><td style="padding:8px 0;color:#6b6860;">Prioridade</td><td style="padding:8px 0;">${ticket.prioridade}</td></tr>
            <tr><td style="padding:8px 0;color:#6b6860;">Prazo</td><td style="padding:8px 0;color:#92590A;font-weight:600;">${prazoFmt}</td></tr>
          </table>
        </div>
      </div>`,
  };
}

function emailPrazoAtrasado(ticket, predioNome, responsavelEmail) {
  const prazoFmt = new Date(ticket.prazo).toLocaleDateString('pt-BR');
  return {
    to: responsavelEmail,
    subject: `[JFL] 🔴 Ticket #${ticket.id} ATRASADO — ${ticket.titulo}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
        <div style="background:#C0392B;color:#fff;padding:20px 24px;border-radius:8px 8px 0 0;">
          <h2 style="margin:0;font-size:18px;">🔴 Ticket em atraso</h2>
        </div>
        <div style="background:#fdf0ee;padding:24px;border:1px solid #f0c8c4;border-top:none;border-radius:0 0 8px 8px;">
          <p style="margin:0 0 16px;font-size:15px;color:#1a1917;">O ticket abaixo está <strong>atrasado desde ${prazoFmt}</strong> e ainda não foi resolvido.</p>
          <table style="width:100%;border-collapse:collapse;font-size:14px;">
            <tr><td style="padding:8px 0;color:#6b6860;width:120px;">Ticket</td><td style="padding:8px 0;font-weight:600;">#${ticket.id}</td></tr>
            <tr><td style="padding:8px 0;color:#6b6860;">Título</td><td style="padding:8px 0;">${ticket.titulo}</td></tr>
            <tr><td style="padding:8px 0;color:#6b6860;">Prédio</td><td style="padding:8px 0;">${predioNome}</td></tr>
            <tr><td style="padding:8px 0;color:#6b6860;">Prioridade</td><td style="padding:8px 0;">${ticket.prioridade}</td></tr>
            <tr><td style="padding:8px 0;color:#6b6860;">Prazo era</td><td style="padding:8px 0;color:#C0392B;font-weight:600;">${prazoFmt}</td></tr>
          </table>
        </div>
      </div>`,
  };
}

// ── DATABASE ──────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// ── MIDDLEWARE ────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOAD_DIR));

// ── AUTH ──────────────────────────────────────────────────────
function auth(req, res, next) {
  const h = req.headers.authorization;
  if (!h) return res.status(401).json({ erro: 'Sem token' });
  try { req.user = jwt.verify(h.replace('Bearer ', ''), SECRET); next(); }
  catch { res.status(401).json({ erro: 'Token inválido' }); }
}

function comPredio(req, res, next) {
  const pid = parseInt(req.headers['x-predio-id']);
  if (!pid) return res.status(400).json({ erro: 'Prédio não selecionado' });
  if (['superadmin','admin'].includes(req.user.role)) { req.predio_id = pid; return next(); }
  pool.query('SELECT 1 FROM usuario_predios WHERE usuario_id=$1 AND predio_id=$2', [req.user.id, pid])
    .then(({ rows }) => {
      if (!rows.length) return res.status(403).json({ erro: 'Sem acesso a este prédio' });
      req.predio_id = pid; next();
    }).catch(() => res.status(500).json({ erro: 'Erro interno' }));
}

function adminOnly(req, res, next) {
  if (!['superadmin','admin'].includes(req.user.role)) return res.status(403).json({ erro: 'Apenas admins' });
  next();
}
function superOnly(req, res, next) {
  if (req.user.role !== 'superadmin') return res.status(403).json({ erro: 'Apenas superadmin' });
  next();
}

// ══════════════════════════════════════════════════════════════
// AUTH ROUTES
// ══════════════════════════════════════════════════════════════

app.post('/api/auth/login', async (req, res) => {
  const { email, senha } = req.body;
  if (!email || !senha) return res.status(400).json({ erro: 'E-mail e senha obrigatórios' });
  try {
    const { rows } = await pool.query('SELECT * FROM usuarios WHERE email=$1 AND ativo=TRUE', [email.toLowerCase().trim()]);
    const u = rows[0];
    if (!u || !(await bcrypt.compare(senha, u.senha_hash))) return res.status(401).json({ erro: 'E-mail ou senha incorretos' });

    let predios = [];
    if (['superadmin','admin'].includes(u.role)) {
      const { rows: ps } = await pool.query('SELECT id,nome,slug FROM predios WHERE ativo=TRUE ORDER BY nome');
      predios = ps;
    } else {
      const { rows: ps } = await pool.query(
        `SELECT p.id,p.nome,p.slug FROM predios p JOIN usuario_predios up ON up.predio_id=p.id WHERE up.usuario_id=$1 AND p.ativo=TRUE ORDER BY p.nome`,
        [u.id]
      );
      predios = ps;
    }

    const token = jwt.sign({ id:u.id, role:u.role, nome:u.nome, email:u.email, cargo:u.cargo }, SECRET, { expiresIn:'7d' });
    res.json({
      token,
      usuario: { id:u.id, nome:u.nome, email:u.email, cargo:u.cargo, role:u.role, must_change_password: u.must_change_password },
      predios,
    });
  } catch(e) { console.error(e); res.status(500).json({ erro: 'Erro interno' }); }
});

app.get('/api/auth/me', auth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id,nome,email,cargo,role,must_change_password FROM usuarios WHERE id=$1', [req.user.id]);
    const u = rows[0];
    if (!u) return res.status(404).json({ erro: 'Não encontrado' });
    let predios = [];
    if (['superadmin','admin'].includes(u.role)) {
      const { rows: ps } = await pool.query('SELECT id,nome,slug FROM predios WHERE ativo=TRUE ORDER BY nome');
      predios = ps;
    } else {
      const { rows: ps } = await pool.query(
        `SELECT p.id,p.nome,p.slug FROM predios p JOIN usuario_predios up ON up.predio_id=p.id WHERE up.usuario_id=$1 AND p.ativo=TRUE ORDER BY p.nome`,
        [u.id]
      );
      predios = ps;
    }
    res.json({ ...u, predios });
  } catch(e) { res.status(500).json({ erro: 'Erro interno' }); }
});

// POST /api/auth/change-password
app.post('/api/auth/change-password', auth, async (req, res) => {
  const { senha_atual, senha_nova } = req.body;
  if (!senha_nova || senha_nova.length < 6) return res.status(400).json({ erro: 'Nova senha precisa ter ao menos 6 caracteres' });
  try {
    const { rows } = await pool.query('SELECT senha_hash FROM usuarios WHERE id=$1', [req.user.id]);
    if (!rows[0]) return res.status(404).json({ erro: 'Usuário não encontrado' });
    // Se não é primeiro login, valida senha atual
    const { rows: uRow } = await pool.query('SELECT must_change_password FROM usuarios WHERE id=$1', [req.user.id]);
    if (!uRow[0].must_change_password) {
      if (!senha_atual) return res.status(400).json({ erro: 'Senha atual obrigatória' });
      const ok = await bcrypt.compare(senha_atual, rows[0].senha_hash);
      if (!ok) return res.status(401).json({ erro: 'Senha atual incorreta' });
    }
    const hash = await bcrypt.hash(senha_nova, 10);
    await pool.query('UPDATE usuarios SET senha_hash=$1, must_change_password=FALSE WHERE id=$2', [hash, req.user.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ erro: 'Erro interno' }); }
});

// ══════════════════════════════════════════════════════════════
// PRÉDIOS
// ══════════════════════════════════════════════════════════════

app.get('/api/predios', auth, adminOnly, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM predios ORDER BY nome');
  res.json(rows);
});

app.post('/api/predios', auth, superOnly, async (req, res) => {
  const { nome, slug } = req.body;
  if (!nome || !slug) return res.status(400).json({ erro: 'Nome e slug obrigatórios' });
  try {
    const { rows } = await pool.query('INSERT INTO predios (nome,slug) VALUES ($1,$2) RETURNING *', [nome, slug.toLowerCase().replace(/\s+/g,'-')]);
    res.status(201).json(rows[0]);
  } catch(e) {
    if (e.code==='23505') return res.status(409).json({ erro: 'Slug já existe' });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

app.patch('/api/predios/:id', auth, superOnly, async (req, res) => {
  const { nome, ativo } = req.body;
  const { rows } = await pool.query(
    'UPDATE predios SET nome=COALESCE($1,nome), ativo=COALESCE($2,ativo) WHERE id=$3 RETURNING *',
    [nome||null, ativo!=null?ativo:null, req.params.id]
  );
  res.json(rows[0]);
});

// ══════════════════════════════════════════════════════════════
// USUÁRIOS
// ══════════════════════════════════════════════════════════════

app.get('/api/usuarios', auth, async (req, res) => {
  const pid = parseInt(req.headers['x-predio-id']);
  const isAdmin = ['superadmin','admin'].includes(req.user.role);
  try {
    let rows;
    if (pid) {
      if (isAdmin) {
        ({ rows } = await pool.query(
          `SELECT u.id,u.nome,u.email,u.cargo,u.role,u.ativo FROM usuarios u JOIN usuario_predios up ON up.usuario_id=u.id WHERE up.predio_id=$1 AND u.ativo=TRUE ORDER BY u.nome`,
          [pid]
        ));
      } else {
        ({ rows } = await pool.query(
          `SELECT u.id,u.nome,u.cargo FROM usuarios u JOIN usuario_predios up ON up.usuario_id=u.id WHERE up.predio_id=$1 AND u.ativo=TRUE ORDER BY u.nome`,
          [pid]
        ));
      }
    } else {
      if (!isAdmin) return res.status(403).json({ erro: 'Acesso negado' });
      ({ rows } = await pool.query('SELECT id,nome,email,cargo,role,ativo FROM usuarios ORDER BY nome'));
    }
    res.json(rows);
  } catch(e) { res.status(500).json({ erro: 'Erro interno' }); }
});

// Gera senha temporária aleatória
function gerarSenhaTemp() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let senha = '';
  for (let i = 0; i < 10; i++) senha += chars[Math.floor(Math.random() * chars.length)];
  return senha;
}

app.post('/api/usuarios', auth, adminOnly, async (req, res) => {
  const { email, role, predio_ids } = req.body;
  if (!email) return res.status(400).json({ erro: 'E-mail obrigatório' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const senhaTemp = gerarSenhaTemp();
    const hash = await bcrypt.hash(senhaTemp, 10);
    const emailLower = email.toLowerCase().trim();

    const { rows } = await client.query(
      `INSERT INTO usuarios (nome,email,senha_hash,cargo,role,must_change_password)
       VALUES ($1,$2,$3,'','membro',TRUE)
       ON CONFLICT (email) DO UPDATE
         SET senha_hash=EXCLUDED.senha_hash, must_change_password=TRUE, ativo=TRUE, role=$4
       RETURNING id,nome,email,cargo,role`,
      [emailLower, emailLower, hash, role||'membro']
    );
    const u = rows[0];

    // Vincula prédios
    await client.query('DELETE FROM usuario_predios WHERE usuario_id=$1', [u.id]);
    for (const pid of (predio_ids||[])) {
      await client.query('INSERT INTO usuario_predios (usuario_id,predio_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [u.id, pid]);
    }
    await client.query('COMMIT');

    // Busca nomes dos prédios
    let predioNomes = [];
    if (predio_ids && predio_ids.length) {
      const { rows: ps } = await pool.query('SELECT nome FROM predios WHERE id = ANY($1)', [predio_ids]);
      predioNomes = ps.map(p => p.nome);
    }

    // Envia convite
    enviarEmail(emailBoasVindas({ nome: emailLower, email: emailLower, senha: senhaTemp, predios: predioNomes, role: role||'membro' }));

    res.status(201).json({ ...u, convite_enviado: true });
  } catch(e) {
    await client.query('ROLLBACK');
    console.error(e);
    res.status(500).json({ erro: 'Erro interno' });
  } finally { client.release(); }
});

// POST /api/usuarios/:id/reenviar — reenviar convite com nova senha temp
app.post('/api/usuarios/:id/reenviar', auth, adminOnly, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM usuarios WHERE id=$1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ erro: 'Não encontrado' });
    const u = rows[0];
    const senhaTemp = gerarSenhaTemp();
    const hash = await bcrypt.hash(senhaTemp, 10);
    await pool.query('UPDATE usuarios SET senha_hash=$1, must_change_password=TRUE WHERE id=$2', [hash, u.id]);

    // Busca prédios do usuário
    const { rows: ps } = await pool.query(
      `SELECT p.nome FROM predios p JOIN usuario_predios up ON up.predio_id=p.id WHERE up.usuario_id=$1`, [u.id]
    );
    const predioNomes = ps.map(p => p.nome);
    enviarEmail(emailBoasVindas({ nome: u.nome||u.email, email: u.email, senha: senhaTemp, predios: predioNomes, role: u.role }));

    res.json({ ok: true, mensagem: `Convite reenviado para ${u.email}` });
  } catch(e) {
    res.status(500).json({ erro: 'Erro interno' });
  }
});

app.delete('/api/usuarios/:id', auth, adminOnly, async (req, res) => {
  if (parseInt(req.params.id)===req.user.id) return res.status(400).json({ erro: 'Não pode remover a si mesmo' });
  await pool.query('UPDATE usuarios SET ativo=FALSE WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

// ══════════════════════════════════════════════════════════════
// TICKETS
// ══════════════════════════════════════════════════════════════

app.get('/api/tickets', auth, comPredio, async (req, res) => {
  try {
    // Filtros de busca
    const { q, status, prioridade, categoria, responsavel_id, de, ate } = req.query;
    let query = 'SELECT * FROM tickets WHERE predio_id=$1';
    const params = [req.predio_id];

    if (status)         { params.push(status);         query += ` AND status=$${params.length}`; }
    if (prioridade)     { params.push(prioridade);     query += ` AND prioridade=$${params.length}`; }
    if (categoria)      { params.push(categoria);      query += ` AND categoria=$${params.length}`; }
    if (responsavel_id) { params.push(parseInt(responsavel_id)); query += ` AND responsavel_id=$${params.length}`; }
    if (de)             { params.push(de);             query += ` AND criado_em::date>=$${params.length}`; }
    if (ate)            { params.push(ate);            query += ` AND criado_em::date<=$${params.length}`; }
    if (q)              { params.push(`%${q}%`);       query += ` AND (titulo ILIKE $${params.length} OR descricao ILIKE $${params.length} OR local ILIKE $${params.length})`; }

    query += ' ORDER BY criado_em DESC';
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch(e) { console.error(e); res.status(500).json({ erro: 'Erro interno' }); }
});

app.post('/api/tickets', auth, comPredio, async (req, res) => {
  const { titulo, descricao, categoria, local, origem, prioridade, prazo, responsavel_id } = req.body;
  if (!titulo||!categoria||!origem) return res.status(400).json({ erro: 'Título, categoria e origem obrigatórios' });
  try {
    let responsavel_nome=null, responsavel_email=null;
    if (responsavel_id) {
      const { rows } = await pool.query('SELECT nome,email FROM usuarios WHERE id=$1', [responsavel_id]);
      responsavel_nome=rows[0]?.nome||null; responsavel_email=rows[0]?.email||null;
    }
    const { rows } = await pool.query(
      `INSERT INTO tickets (predio_id,titulo,descricao,categoria,local,origem,prioridade,status,autor_id,autor_nome,responsavel_id,responsavel_nome,prazo)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'aberto',$8,$9,$10,$11,$12) RETURNING *`,
      [req.predio_id,titulo,descricao||null,categoria,local||null,origem,prioridade||'Média',req.user.id,req.user.nome,responsavel_id||null,responsavel_nome,prazo||null]
    );
    const t = rows[0];
    await pool.query('INSERT INTO ticket_historico (ticket_id,mensagem,autor_id,autor_nome) VALUES ($1,$2,$3,$4)',
      [t.id,`Aberto por ${req.user.nome} via ${origem}`,req.user.id,req.user.nome]);
    enviarEmail(emailTicketAberto(t, req.user.email));
    if (responsavel_email && responsavel_email!==req.user.email)
      enviarEmail({...emailTicketAberto(t, responsavel_email), subject:`[JFL] Ticket #${t.id} atribuído a você`});
    res.status(201).json(t);
  } catch(e) { console.error(e); res.status(500).json({ erro: 'Erro interno' }); }
});

app.patch('/api/tickets/:id/status', auth, comPredio, async (req, res) => {
  const { status } = req.body;
  const validos = ['aberto','em andamento','feedback ao cliente','resolvido'];
  if (!validos.includes(status)) return res.status(400).json({ erro: 'Status inválido' });
  const { rows } = await pool.query(
    'UPDATE tickets SET status=$1,atualizado_em=NOW() WHERE id=$2 AND predio_id=$3 RETURNING *',
    [status,req.params.id,req.predio_id]
  );
  if (!rows[0]) return res.status(404).json({ erro: 'Não encontrado' });
  const t = rows[0];
  await pool.query('INSERT INTO ticket_historico (ticket_id,mensagem,autor_id,autor_nome) VALUES ($1,$2,$3,$4)',
    [req.params.id,`Status → ${status}`,req.user.id,req.user.nome]);
  if (t.responsavel_id && t.responsavel_id!==req.user.id) {
    const { rows: ru } = await pool.query('SELECT email FROM usuarios WHERE id=$1',[t.responsavel_id]);
    if (ru[0]?.email) enviarEmail(emailStatusAtualizado(t,status,req.user.nome,ru[0].email));
  }
  res.json(t);
});

// ══════════════════════════════════════════════════════════════
// HISTÓRICO
// ══════════════════════════════════════════════════════════════

app.get('/api/tickets/:id/historico', auth, comPredio, async (req, res) => {
  const { rows: tk } = await pool.query('SELECT id FROM tickets WHERE id=$1 AND predio_id=$2',[req.params.id,req.predio_id]);
  if (!tk[0]) return res.status(404).json({ erro: 'Não encontrado' });
  const { rows } = await pool.query('SELECT * FROM ticket_historico WHERE ticket_id=$1 ORDER BY criado_em DESC',[req.params.id]);
  res.json(rows);
});

app.post('/api/tickets/:id/historico', auth, comPredio, async (req, res) => {
  const { mensagem } = req.body;
  if (!mensagem) return res.status(400).json({ erro: 'Mensagem obrigatória' });
  const { rows: tk } = await pool.query('SELECT id FROM tickets WHERE id=$1 AND predio_id=$2',[req.params.id,req.predio_id]);
  if (!tk[0]) return res.status(404).json({ erro: 'Não encontrado' });
  const { rows } = await pool.query(
    'INSERT INTO ticket_historico (ticket_id,mensagem,autor_id,autor_nome) VALUES ($1,$2,$3,$4) RETURNING *',
    [req.params.id,mensagem,req.user.id,req.user.nome]
  );
  await pool.query('UPDATE tickets SET atualizado_em=NOW() WHERE id=$1',[req.params.id]);
  res.status(201).json(rows[0]);
});

// ══════════════════════════════════════════════════════════════
// ATIVIDADES
// ══════════════════════════════════════════════════════════════

app.get('/api/tickets/:id/atividades', auth, comPredio, async (req, res) => {
  const { rows: tk } = await pool.query('SELECT id FROM tickets WHERE id=$1 AND predio_id=$2',[req.params.id,req.predio_id]);
  if (!tk[0]) return res.status(404).json({ erro: 'Não encontrado' });
  const { rows } = await pool.query('SELECT * FROM ticket_atividades WHERE ticket_id=$1 ORDER BY criado_em ASC',[req.params.id]);
  res.json(rows);
});

app.post('/api/tickets/:id/atividades', auth, comPredio, async (req, res) => {
  const { titulo, responsavel_nome, prazo } = req.body;
  if (!titulo) return res.status(400).json({ erro: 'Título obrigatório' });
  const { rows: tk } = await pool.query('SELECT id FROM tickets WHERE id=$1 AND predio_id=$2',[req.params.id,req.predio_id]);
  if (!tk[0]) return res.status(404).json({ erro: 'Não encontrado' });
  const { rows } = await pool.query(
    'INSERT INTO ticket_atividades (ticket_id,titulo,responsavel_nome,prazo,criado_por) VALUES ($1,$2,$3,$4,$5) RETURNING *',
    [req.params.id,titulo,responsavel_nome||null,prazo||null,req.user.nome]
  );
  res.status(201).json(rows[0]);
});

app.patch('/api/atividades/:id/toggle', auth, async (req, res) => {
  const { rows } = await pool.query(
    `UPDATE ticket_atividades SET status=CASE WHEN status='concluida' THEN 'pendente' ELSE 'concluida' END WHERE id=$1 RETURNING *`,
    [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ erro: 'Não encontrado' });
  res.json(rows[0]);
});

// ══════════════════════════════════════════════════════════════
// FOTOS
// ══════════════════════════════════════════════════════════════

app.post('/api/tickets/:id/fotos', auth, comPredio, upload.array('fotos',10), async (req, res) => {
  const { rows: tk } = await pool.query('SELECT id FROM tickets WHERE id=$1 AND predio_id=$2',[req.params.id,req.predio_id]);
  if (!tk[0]) return res.status(404).json({ erro: 'Não encontrado' });
  if (!req.files||!req.files.length) return res.status(400).json({ erro: 'Nenhum arquivo enviado' });
  const inseridas = [];
  for (const f of req.files) {
    const { rows } = await pool.query(
      'INSERT INTO ticket_fotos (ticket_id,nome_original,nome_arquivo,tamanho,mime_type,enviado_por) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [req.params.id,f.originalname,f.filename,f.size,f.mimetype,req.user.nome]
    );
    inseridas.push(rows[0]);
  }
  await pool.query('INSERT INTO ticket_historico (ticket_id,mensagem,autor_id,autor_nome) VALUES ($1,$2,$3,$4)',
    [req.params.id,`${req.files.length} foto(s) anexada(s) por ${req.user.nome}`,req.user.id,req.user.nome]);
  res.status(201).json(inseridas);
});

app.get('/api/tickets/:id/fotos', auth, comPredio, async (req, res) => {
  const { rows: tk } = await pool.query('SELECT id FROM tickets WHERE id=$1 AND predio_id=$2',[req.params.id,req.predio_id]);
  if (!tk[0]) return res.status(404).json({ erro: 'Não encontrado' });
  const { rows } = await pool.query('SELECT * FROM ticket_fotos WHERE ticket_id=$1 ORDER BY criado_em ASC',[req.params.id]);
  res.json(rows);
});

app.delete('/api/fotos/:id', auth, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM ticket_fotos WHERE id=$1',[req.params.id]);
  if (!rows[0]) return res.status(404).json({ erro: 'Não encontrado' });
  const filePath = path.join(UPLOAD_DIR, rows[0].nome_arquivo);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  await pool.query('DELETE FROM ticket_fotos WHERE id=$1',[req.params.id]);
  res.json({ ok: true });
});

// ══════════════════════════════════════════════════════════════
// RELATÓRIOS
// ══════════════════════════════════════════════════════════════

async function buscarTicketsRelatorio(predio_id, { status, prioridade, de, ate }={}) {
  let q='SELECT * FROM tickets WHERE predio_id=$1';
  const params=[predio_id];
  if (status)     { params.push(status);     q+=` AND status=$${params.length}`; }
  if (prioridade) { params.push(prioridade); q+=` AND prioridade=$${params.length}`; }
  if (de)         { params.push(de);         q+=` AND criado_em::date>=$${params.length}`; }
  if (ate)        { params.push(ate);        q+=` AND criado_em::date<=$${params.length}`; }
  q+=' ORDER BY criado_em DESC';
  const { rows } = await pool.query(q,params);
  return rows;
}

app.get('/api/relatorios/excel', auth, comPredio, async (req, res) => {
  try {
    const tickets = await buscarTicketsRelatorio(req.predio_id, req.query);
    const { rows: predioRows } = await pool.query('SELECT nome FROM predios WHERE id=$1',[req.predio_id]);
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Operação JFL Inc';
    const ws = wb.addWorksheet('Tickets');
    ws.columns = [
      {header:'ID',key:'id',width:8},{header:'Título',key:'titulo',width:40},
      {header:'Status',key:'status',width:20},{header:'Prioridade',key:'prioridade',width:14},
      {header:'Categoria',key:'categoria',width:22},{header:'Local',key:'local',width:20},
      {header:'Origem',key:'origem',width:18},{header:'Responsável',key:'responsavel_nome',width:22},
      {header:'Aberto por',key:'autor_nome',width:22},{header:'Prazo',key:'prazo',width:14},
      {header:'Criado em',key:'criado_em',width:20},{header:'Descrição',key:'descricao',width:50},
    ];
    ws.getRow(1).eachCell(cell => {
      cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF1A1917'}};
      cell.font={color:{argb:'FFFFFFFF'},bold:true,size:11};
    });
    const statusColors={'aberto':'FFEBF0F9','em andamento':'FFFDF5E6','resolvido':'FFEBF5EE','feedback ao cliente':'FFF3EBFA'};
    tickets.forEach(t => {
      const row = ws.addRow({...t,
        prazo:t.prazo?new Date(t.prazo).toLocaleDateString('pt-BR'):'—',
        criado_em:t.criado_em?new Date(t.criado_em).toLocaleString('pt-BR'):'—',
        descricao:t.descricao||'—', responsavel_nome:t.responsavel_nome||'A definir',
      });
      const bg=statusColors[t.status]||'FFFFFFFF';
      row.eachCell(cell=>{ cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:bg}}; cell.alignment={wrapText:true,vertical:'top'}; });
    });
    ws.autoFilter={from:'A1',to:'L1'};
    const wsSumario=wb.addWorksheet('Resumo');
    wsSumario.addRow(['Relatório — '+(predioRows[0]?.nome||'')]);
    wsSumario.addRow(['Gerado em',new Date().toLocaleString('pt-BR')]);
    wsSumario.addRow([]);
    wsSumario.addRow(['Indicador','Qtd']);
    wsSumario.addRow(['Total',tickets.length]);
    wsSumario.addRow(['Em aberto',tickets.filter(t=>t.status==='aberto').length]);
    wsSumario.addRow(['Em andamento',tickets.filter(t=>t.status==='em andamento').length]);
    wsSumario.addRow(['Resolvidos',tickets.filter(t=>t.status==='resolvido').length]);
    wsSumario.addRow(['Alta prioridade',tickets.filter(t=>t.prioridade==='Alta').length]);
    res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition',`attachment; filename="tickets-${Date.now()}.xlsx"`);
    await wb.xlsx.write(res); res.end();
  } catch(e) { console.error(e); res.status(500).json({erro:'Erro ao gerar Excel'}); }
});

app.get('/api/relatorios/pdf', auth, comPredio, async (req, res) => {
  try {
    const tickets = await buscarTicketsRelatorio(req.predio_id, req.query);
    const { rows: predioRows } = await pool.query('SELECT nome FROM predios WHERE id=$1',[req.predio_id]);
    const predioNome = predioRows[0]?.nome||'Prédio';
    const doc = new PDFDocument({margin:40,size:'A4'});
    res.setHeader('Content-Type','application/pdf');
    res.setHeader('Content-Disposition',`attachment; filename="tickets-${Date.now()}.pdf"`);
    doc.pipe(res);
    doc.rect(0,0,doc.page.width,70).fill('#1A1917');
    doc.fillColor('#ffffff').fontSize(18).font('Helvetica-Bold').text('Operação JFL Inc',40,20);
    doc.fontSize(11).font('Helvetica').text(`Relatório — ${predioNome}`,40,44);
    doc.fillColor('#1A1917').moveDown(2);
    doc.fontSize(10).fillColor('#6B6860').text(`Gerado em: ${new Date().toLocaleString('pt-BR')}   |   Total: ${tickets.length}`,{align:'right'});
    doc.moveDown(0.5);
    const statusColors2={aberto:'#EBF0F9','em andamento':'#FDF5E6',resolvido:'#EBF5EE','feedback ao cliente':'#F3EBFA'};
    const prioColors={Alta:'#C0392B',Média:'#92590A',Baixa:'#1E6B3C'};
    tickets.forEach(t=>{
      if(doc.y>doc.page.height-140) doc.addPage();
      const cardY=doc.y; const cardH=t.descricao?100:72;
      doc.rect(40,cardY,doc.page.width-80,cardH).fill(statusColors2[t.status]||'#F9F9F7').stroke('#E2DED6');
      doc.fillColor('#A09D98').fontSize(9).font('Helvetica').text(`#${t.id}`,52,cardY+10);
      doc.fillColor('#1A1917').fontSize(11).font('Helvetica-Bold').text(t.titulo,52,cardY+22,{width:doc.page.width-160});
      const tagX=doc.page.width-160;
      doc.fontSize(9).fillColor(prioColors[t.prioridade]||'#1A1917').text(`● ${t.prioridade}`,tagX,cardY+10,{width:110,align:'right'});
      doc.fillColor('#6B6860').text(t.status,tagX,cardY+22,{width:110,align:'right'});
      const meta=[t.categoria,t.local,t.responsavel_nome||'A definir',t.prazo?new Date(t.prazo).toLocaleDateString('pt-BR'):''].filter(Boolean).join('  ·  ');
      doc.font('Helvetica').fontSize(9).fillColor('#6B6860').text(meta,52,cardY+42,{width:doc.page.width-110});
      if(t.descricao) doc.fontSize(9).fillColor('#1A1917').text(t.descricao,52,cardY+58,{width:doc.page.width-110,ellipsis:true,height:28});
      doc.moveDown(0.3);
    });
    if(!tickets.length) doc.moveDown(2).fontSize(13).fillColor('#A09D98').text('Nenhum ticket encontrado.',{align:'center'});
    doc.end();
  } catch(e) { console.error(e); res.status(500).json({erro:'Erro ao gerar PDF'}); }
});

// ══════════════════════════════════════════════════════════════
// UNIDADES
// ══════════════════════════════════════════════════════════════

// GET /api/unidades — lista unidades do prédio ativo
app.get('/api/unidades', auth, comPredio, async (req, res) => {
  const { rows } = await pool.query(
    'SELECT id, sap, numero, andar, label FROM unidades WHERE predio_id=$1 AND ativo=TRUE ORDER BY sap',
    [req.predio_id]
  );
  res.json(rows);
});

// ══════════════════════════════════════════════════════════════
// SLA CONFIG
// ══════════════════════════════════════════════════════════════

// GET /api/sla — retorna config SLA do prédio
app.get('/api/sla', auth, comPredio, async (req, res) => {
  const { rows } = await pool.query(
    'SELECT categoria, prazo_horas FROM sla_config WHERE predio_id=$1 ORDER BY categoria',
    [req.predio_id]
  );
  res.json(rows);
});

// PUT /api/sla — salva config SLA (upsert por categoria)
app.put('/api/sla', auth, comPredio, adminOnly, async (req, res) => {
  const { configs } = req.body; // [{ categoria, prazo_horas }]
  if (!Array.isArray(configs)) return res.status(400).json({ erro: 'configs deve ser array' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const c of configs) {
      if (!c.categoria || !c.prazo_horas) continue;
      await client.query(
        `INSERT INTO sla_config (predio_id, categoria, prazo_horas)
         VALUES ($1,$2,$3)
         ON CONFLICT (predio_id, categoria) DO UPDATE SET prazo_horas=EXCLUDED.prazo_horas`,
        [req.predio_id, c.categoria, parseInt(c.prazo_horas)]
      );
    }
    await client.query('COMMIT');
    const { rows } = await client.query(
      'SELECT categoria, prazo_horas FROM sla_config WHERE predio_id=$1 ORDER BY categoria',
      [req.predio_id]
    );
    res.json(rows);
  } catch(e) {
    await client.query('ROLLBACK');
    res.status(500).json({ erro: 'Erro interno' });
  } finally { client.release(); }
});

// GET /api/sla/:categoria — retorna prazo sugerido para uma categoria
app.get('/api/sla/:categoria', auth, comPredio, async (req, res) => {
  const { rows } = await pool.query(
    'SELECT prazo_horas FROM sla_config WHERE predio_id=$1 AND categoria=$2',
    [req.predio_id, decodeURIComponent(req.params.categoria)]
  );
  if (!rows[0]) return res.json({ prazo_horas: null, prazo_data: null });
  const horas = rows[0].prazo_horas;
  const prazoData = new Date(Date.now() + horas * 60 * 60 * 1000).toISOString().split('T')[0];
  res.json({ prazo_horas: horas, prazo_data: prazoData });
});

// ── PERFIL DO USUÁRIO ──────────────────────────────────────────

// PATCH /api/auth/perfil — atualiza nome e cargo
app.patch('/api/auth/perfil', auth, async (req, res) => {
  const { nome, cargo } = req.body;
  if (!nome || !nome.trim()) return res.status(400).json({ erro: 'Nome obrigatório' });
  try {
    const { rows } = await pool.query(
      'UPDATE usuarios SET nome=$1, cargo=$2 WHERE id=$3 RETURNING id,nome,email,cargo,role',
      [nome.trim(), cargo?.trim()||null, req.user.id]
    );
    res.json(rows[0]);
  } catch(e) { res.status(500).json({ erro: 'Erro interno' }); }
});

// ══════════════════════════════════════════════════════════════
// STATS
// ══════════════════════════════════════════════════════════════

app.get('/api/stats', auth, comPredio, async (req, res) => {
  const pid=req.predio_id;
  const hoje=new Date().toISOString().split('T')[0];
  const [a,b,c,d]=await Promise.all([
    pool.query(`SELECT COUNT(*) FROM tickets WHERE predio_id=$1 AND status='aberto'`,[pid]),
    pool.query(`SELECT COUNT(*) FROM tickets WHERE predio_id=$1 AND status='em andamento'`,[pid]),
    pool.query(`SELECT COUNT(*) FROM tickets WHERE predio_id=$1 AND status='resolvido'`,[pid]),
    pool.query(`SELECT COUNT(*) FROM tickets WHERE predio_id=$1 AND prazo::date=$2 AND status!='resolvido'`,[pid,hoje]),
  ]);
  res.json({aberto:parseInt(a.rows[0].count),andamento:parseInt(b.rows[0].count),resolvido:parseInt(c.rows[0].count),hoje:parseInt(d.rows[0].count)});
});

// ── SPA FALLBACK ──────────────────────────────────────────────
app.get('*',(_, res)=>res.sendFile(path.join(__dirname,'public/index.html')));

// ══════════════════════════════════════════════════════════════
// JOB: NOTIFICAÇÃO DE PRAZO
// ══════════════════════════════════════════════════════════════

async function jobNotificacoesPrazo() {
  if (!process.env.SMTP_USER) return;
  const hoje=new Date().toISOString().split('T')[0];
  const amanha=new Date(Date.now()+24*60*60*1000).toISOString().split('T')[0];
  try {
    const {rows:vencAmanha}=await pool.query(`
      SELECT t.*,p.nome as predio_nome,u.email as resp_email FROM tickets t
      JOIN predios p ON p.id=t.predio_id LEFT JOIN usuarios u ON u.id=t.responsavel_id
      WHERE t.prazo::date=$1 AND t.status NOT IN ('resolvido') AND t.responsavel_id IS NOT NULL`,[amanha]);
    for(const t of vencAmanha) if(t.resp_email) await enviarEmail(emailPrazoVencendo(t,t.predio_nome,t.resp_email));
    const {rows:atrasados}=await pool.query(`
      SELECT t.*,p.nome as predio_nome,u.email as resp_email FROM tickets t
      JOIN predios p ON p.id=t.predio_id LEFT JOIN usuarios u ON u.id=t.responsavel_id
      WHERE t.prazo::date=$1 AND t.status NOT IN ('resolvido') AND t.responsavel_id IS NOT NULL`,[hoje]);
    for(const t of atrasados) if(t.resp_email) await enviarEmail(emailPrazoAtrasado(t,t.predio_nome,t.resp_email));
    console.log(`[JOB] Prazos: ${vencAmanha.length} vencendo amanhã, ${atrasados.length} atrasados`);
  } catch(e) { console.error('[JOB] Erro:',e.message); }
}

function agendarJobPrazo() {
  const agora=new Date();
  const proximas8h=new Date();
  proximas8h.setUTCHours(11,0,0,0);
  if(proximas8h<=agora) proximas8h.setDate(proximas8h.getDate()+1);
  const ms=proximas8h-agora;
  console.log(`[JOB] Próxima notificação em ${Math.round(ms/1000/60)} min`);
  setTimeout(()=>{ jobNotificacoesPrazo(); setInterval(jobNotificacoesPrazo,24*60*60*1000); },ms);
}

// ══════════════════════════════════════════════════════════════
// AUTO-MIGRATE
// ══════════════════════════════════════════════════════════════
async function migrate() {
  const client=await pool.connect();
  try {
    console.log('🔄 Verificando banco de dados...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS predios (
        id SERIAL PRIMARY KEY, nome TEXT NOT NULL, slug TEXT NOT NULL UNIQUE,
        ativo BOOLEAN DEFAULT TRUE, criado_em TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS usuarios (
        id SERIAL PRIMARY KEY, nome TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
        senha_hash TEXT NOT NULL, cargo TEXT,
        role TEXT NOT NULL DEFAULT 'membro' CHECK (role IN ('superadmin','admin','membro')),
        ativo BOOLEAN DEFAULT TRUE,
        must_change_password BOOLEAN DEFAULT FALSE,
        criado_em TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS usuario_predios (
        usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        predio_id  INTEGER NOT NULL REFERENCES predios(id)  ON DELETE CASCADE,
        PRIMARY KEY (usuario_id, predio_id)
      );
      CREATE TABLE IF NOT EXISTS tickets (
        id SERIAL PRIMARY KEY, predio_id INTEGER NOT NULL REFERENCES predios(id) ON DELETE CASCADE,
        titulo TEXT NOT NULL, descricao TEXT, categoria TEXT, local TEXT, origem TEXT,
        prioridade TEXT NOT NULL DEFAULT 'Média' CHECK (prioridade IN ('Baixa','Média','Alta')),
        status TEXT NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto','em andamento','feedback ao cliente','resolvido')),
        autor_id INTEGER REFERENCES usuarios(id), autor_nome TEXT,
        responsavel_id INTEGER REFERENCES usuarios(id), responsavel_nome TEXT,
        prazo DATE, criado_em TIMESTAMPTZ DEFAULT NOW(), atualizado_em TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS ticket_historico (
        id SERIAL PRIMARY KEY, ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        mensagem TEXT NOT NULL, autor_id INTEGER REFERENCES usuarios(id),
        autor_nome TEXT, criado_em TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS ticket_atividades (
        id SERIAL PRIMARY KEY, ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        titulo TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','concluida')),
        responsavel_nome TEXT, prazo DATE, criado_por TEXT, criado_em TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS ticket_fotos (
        id SERIAL PRIMARY KEY, ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        nome_original TEXT NOT NULL, nome_arquivo TEXT NOT NULL UNIQUE,
        tamanho INTEGER, mime_type TEXT, enviado_por TEXT, criado_em TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS unidades (
        id        SERIAL PRIMARY KEY,
        predio_id INTEGER NOT NULL REFERENCES predios(id) ON DELETE CASCADE,
        sap       TEXT NOT NULL UNIQUE,
        numero    TEXT NOT NULL,
        andar     TEXT,
        label     TEXT NOT NULL,
        ativo     BOOLEAN DEFAULT TRUE
      );
      CREATE TABLE IF NOT EXISTS sla_config (
        id SERIAL PRIMARY KEY,
        predio_id INTEGER NOT NULL REFERENCES predios(id) ON DELETE CASCADE,
        categoria TEXT NOT NULL,
        prazo_horas INTEGER NOT NULL DEFAULT 48,
        UNIQUE (predio_id, categoria)
      );
    `);
    // Adiciona must_change_password em usuários existentes se não existir
    await client.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT FALSE`);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_tickets_predio_status ON tickets(predio_id,status);
      CREATE INDEX IF NOT EXISTS idx_tickets_predio_prio   ON tickets(predio_id,prioridade);
      CREATE INDEX IF NOT EXISTS idx_tickets_predio_prazo  ON tickets(predio_id,prazo);
      CREATE INDEX IF NOT EXISTS idx_historico_ticket      ON ticket_historico(ticket_id);
      CREATE INDEX IF NOT EXISTS idx_atividades_ticket     ON ticket_atividades(ticket_id);
      CREATE INDEX IF NOT EXISTS idx_fotos_ticket          ON ticket_fotos(ticket_id);
    CREATE INDEX IF NOT EXISTS idx_unidades_predio       ON unidades(predio_id);
    CREATE INDEX IF NOT EXISTS idx_unidades_sap          ON unidades(sap);
      CREATE INDEX IF NOT EXISTS idx_usuario_predios_uid   ON usuario_predios(usuario_id);
      CREATE INDEX IF NOT EXISTS idx_usuario_predios_pid   ON usuario_predios(predio_id);
    `);
    const {rows:p}=await client.query("SELECT id FROM predios WHERE slug='jml'");
    if(!p.length){await client.query("INSERT INTO predios(nome,slug) VALUES('JML','jml')");console.log('🏢 JML criado');}
    const {rows:a}=await client.query("SELECT id FROM usuarios WHERE email='admin@operacao.com'");
    if(!a.length){
      const hash=await bcrypt.hash('admin123',10);
      await client.query(`INSERT INTO usuarios(nome,email,senha_hash,cargo,role) VALUES('Administrador','admin@operacao.com',$1,'TI','superadmin')`,[hash]);
      console.log('👤 Superadmin criado');
    }
    console.log('✅ Banco pronto');
  } catch(e){console.error('❌ Migração:',e.message);throw e;}
  finally{client.release();}
}

migrate()
  .then(()=>{
    app.listen(PORT,()=>console.log(`🚀 Porta ${PORT}`));
    agendarJobPrazo();
  })
  .catch(e=>{console.error('Falha fatal:',e.message);process.exit(1);});
