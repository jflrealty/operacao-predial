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
  const validos = ['aberto','em andamento','feedback ao cliente','resolvido','cancelado'];
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
        status TEXT NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto','em andamento','feedback ao cliente','resolvido','cancelado')),
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
    // Atualiza constraint de status para incluir 'cancelado'
    await client.query(`
      ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_status_check;
      ALTER TABLE tickets ADD CONSTRAINT tickets_status_check
        CHECK (status IN ('aberto','em andamento','feedback ao cliente','resolvido','cancelado'));
    `);
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

    // Seed unidades (só insere se a tabela estiver vazia)
    const { rows: unidCount } = await client.query('SELECT COUNT(*) FROM unidades');
    if (parseInt(unidCount[0].count) === 0) {
      console.log('🏢 Inserindo unidades...');
      const UNIDADES = [{"sap": "AVN01101", "numero": "1101", "andar": "11º Andar", "label": "1101 - 49m²", "slug": "avnu"}, {"sap": "AVN01102", "numero": "1102", "andar": "11º Andar", "label": "1102 - 49m²", "slug": "avnu"}, {"sap": "AVN01103", "numero": "1103", "andar": "11º Andar", "label": "1103 - 38m²", "slug": "avnu"}, {"sap": "AVN01104", "numero": "1104", "andar": "11º Andar", "label": "1104 - 38m²", "slug": "avnu"}, {"sap": "AVN01105", "numero": "1105", "andar": "11º Andar", "label": "1105 - 38m²", "slug": "avnu"}, {"sap": "AVN01106", "numero": "1106", "andar": "11º Andar", "label": "1106 - 38m²", "slug": "avnu"}, {"sap": "AVN01107", "numero": "1107", "andar": "11º Andar", "label": "1107 - 38m²", "slug": "avnu"}, {"sap": "AVN01108", "numero": "1108", "andar": "11º Andar", "label": "1108 - 38m²", "slug": "avnu"}, {"sap": "AVN01109", "numero": "1109", "andar": "11º Andar", "label": "1109 - 38m²", "slug": "avnu"}, {"sap": "AVN01110", "numero": "1110", "andar": "11º Andar", "label": "1110 - 38m²", "slug": "avnu"}, {"sap": "AVN01111", "numero": "1111", "andar": "11º Andar", "label": "1111 - 49m²", "slug": "avnu"}, {"sap": "AVN01112", "numero": "1112", "andar": "11º Andar", "label": "1112 - 49m²", "slug": "avnu"}, {"sap": "AVN01113", "numero": "1113", "andar": "11º Andar", "label": "1113 - 69m² - 2D", "slug": "avnu"}, {"sap": "AVN01114", "numero": "1114", "andar": "11º Andar", "label": "1114 - 69m² - 1D", "slug": "avnu"}, {"sap": "AVN01201", "numero": "1201", "andar": "12º Andar", "label": "1201 - 49m²", "slug": "avnu"}, {"sap": "AVN01202", "numero": "1202", "andar": "12º Andar", "label": "1202 - 49m²", "slug": "avnu"}, {"sap": "AVN01203", "numero": "1203", "andar": "12º Andar", "label": "1203 - 38m²", "slug": "avnu"}, {"sap": "AVN01204", "numero": "1204", "andar": "12º Andar", "label": "1204 - 38m²", "slug": "avnu"}, {"sap": "AVN01205", "numero": "1205", "andar": "12º Andar", "label": "1205 - 38m²", "slug": "avnu"}, {"sap": "AVN01206", "numero": "1206", "andar": "12º Andar", "label": "1206 - 38m²", "slug": "avnu"}, {"sap": "AVN01207", "numero": "1207", "andar": "12º Andar", "label": "1207 - 38m²", "slug": "avnu"}, {"sap": "AVN01208", "numero": "1208", "andar": "12º Andar", "label": "1208 - 38m²", "slug": "avnu"}, {"sap": "AVN01209", "numero": "1209", "andar": "12º Andar", "label": "1209 - 38m²", "slug": "avnu"}, {"sap": "AVN01210", "numero": "1210", "andar": "12º Andar", "label": "1210 - 38m²", "slug": "avnu"}, {"sap": "AVN01211", "numero": "1211", "andar": "12º Andar", "label": "1211 - 49m²", "slug": "avnu"}, {"sap": "AVN01212", "numero": "1212", "andar": "12º Andar", "label": "1212 - 49m²", "slug": "avnu"}, {"sap": "AVN01213", "numero": "1213", "andar": "12º Andar", "label": "1213 - 69m² - 2D", "slug": "avnu"}, {"sap": "AVN01214", "numero": "1214", "andar": "12º Andar", "label": "1214 - 69m² - 1D", "slug": "avnu"}, {"sap": "AVN01301", "numero": "1301", "andar": "13º Andar", "label": "1301 - 49m²", "slug": "avnu"}, {"sap": "AVN01302", "numero": "1302", "andar": "13º Andar", "label": "1302 - 49m²", "slug": "avnu"}, {"sap": "AVN01303", "numero": "1303", "andar": "13º Andar", "label": "1303 - 38m²", "slug": "avnu"}, {"sap": "AVN01304", "numero": "1304", "andar": "13º Andar", "label": "1304 - 38m²", "slug": "avnu"}, {"sap": "AVN01305", "numero": "1305", "andar": "13º Andar", "label": "1305 - 38m²", "slug": "avnu"}, {"sap": "AVN01306", "numero": "1306", "andar": "13º Andar", "label": "1306 - 38m²", "slug": "avnu"}, {"sap": "AVN01307", "numero": "1307", "andar": "13º Andar", "label": "1307 - 38m²", "slug": "avnu"}, {"sap": "AVN01308", "numero": "1308", "andar": "13º Andar", "label": "1308 - 38m²", "slug": "avnu"}, {"sap": "AVN01309", "numero": "1309", "andar": "13º Andar", "label": "1309 - 38m²", "slug": "avnu"}, {"sap": "AVN01310", "numero": "1310", "andar": "13º Andar", "label": "1310 - 38m²", "slug": "avnu"}, {"sap": "AVN01311", "numero": "1311", "andar": "13º Andar", "label": "1311 - 49m²", "slug": "avnu"}, {"sap": "AVN01312", "numero": "1312", "andar": "13º Andar", "label": "1312 - 49m²", "slug": "avnu"}, {"sap": "AVN01313", "numero": "1313", "andar": "13º Andar", "label": "1313 - 69m² - 2D", "slug": "avnu"}, {"sap": "AVN01314", "numero": "1314", "andar": "13º Andar", "label": "1314 - 69m² - 1D", "slug": "avnu"}, {"sap": "AVN01401", "numero": "1401", "andar": "14º Andar", "label": "1401 - 49m²", "slug": "avnu"}, {"sap": "AVN01402", "numero": "1402", "andar": "14º Andar", "label": "1402 - 49m²", "slug": "avnu"}, {"sap": "AVN01403", "numero": "1403", "andar": "14º Andar", "label": "1403 - 38m²", "slug": "avnu"}, {"sap": "AVN01404", "numero": "1404", "andar": "14º Andar", "label": "1404 - 38m²", "slug": "avnu"}, {"sap": "AVN01405", "numero": "1405", "andar": "14º Andar", "label": "1405 - 38m²", "slug": "avnu"}, {"sap": "AVN01406", "numero": "1406", "andar": "14º Andar", "label": "1406 - 38m²", "slug": "avnu"}, {"sap": "AVN01407", "numero": "1407", "andar": "14º Andar", "label": "1407 - 38m²", "slug": "avnu"}, {"sap": "AVN01408", "numero": "1408", "andar": "14º Andar", "label": "1408 - 38m²", "slug": "avnu"}, {"sap": "AVN01409", "numero": "1409", "andar": "14º Andar", "label": "1409 - 38m²", "slug": "avnu"}, {"sap": "AVN01410", "numero": "1410", "andar": "14º Andar", "label": "1410 - 38m²", "slug": "avnu"}, {"sap": "AVN01411", "numero": "1411", "andar": "14º Andar", "label": "1411 - 49m²", "slug": "avnu"}, {"sap": "AVN01412", "numero": "1412", "andar": "14º Andar", "label": "1412 - 49m²", "slug": "avnu"}, {"sap": "AVN01413", "numero": "1413", "andar": "14º Andar", "label": "1413 - 69m² - 2D", "slug": "avnu"}, {"sap": "AVN01414", "numero": "1414", "andar": "14º Andar", "label": "1414 - 69m² - 1D", "slug": "avnu"}, {"sap": "AVN01501", "numero": "1501", "andar": "15º Andar", "label": "1501 - 49m²", "slug": "avnu"}, {"sap": "AVN01502", "numero": "1502", "andar": "15º Andar", "label": "1502 - 49m²", "slug": "avnu"}, {"sap": "AVN01503", "numero": "1503", "andar": "15º Andar", "label": "1503 - 38m²", "slug": "avnu"}, {"sap": "AVN01504", "numero": "1504", "andar": "15º Andar", "label": "1504 - 38m²", "slug": "avnu"}, {"sap": "AVN01505", "numero": "1505", "andar": "15º Andar", "label": "1505 - 38m²", "slug": "avnu"}, {"sap": "AVN01506", "numero": "1506", "andar": "15º Andar", "label": "1506 - 38m²", "slug": "avnu"}, {"sap": "AVN01507", "numero": "1507", "andar": "15º Andar", "label": "1507 - 38m²", "slug": "avnu"}, {"sap": "AVN01508", "numero": "1508", "andar": "15º Andar", "label": "1508 - 38m²", "slug": "avnu"}, {"sap": "AVN01509", "numero": "1509", "andar": "15º Andar", "label": "1509 - 38m²", "slug": "avnu"}, {"sap": "AVN01510", "numero": "1510", "andar": "15º Andar", "label": "1510 - 38m²", "slug": "avnu"}, {"sap": "AVN01511", "numero": "1511", "andar": "15º Andar", "label": "1511 - 49m²", "slug": "avnu"}, {"sap": "AVN01512", "numero": "1512", "andar": "15º Andar", "label": "1512 - 49m²", "slug": "avnu"}, {"sap": "AVN01513", "numero": "1513", "andar": "15º Andar", "label": "1513 - 69m² - 2D", "slug": "avnu"}, {"sap": "AVN01514", "numero": "1514", "andar": "15º Andar", "label": "1514 - 69m² - 1D", "slug": "avnu"}, {"sap": "AVN01601", "numero": "1601", "andar": "16º Andar", "label": "1601 - 49m²", "slug": "avnu"}, {"sap": "AVN01602", "numero": "1602", "andar": "16º Andar", "label": "1602 - 49m²", "slug": "avnu"}, {"sap": "AVN01603", "numero": "1603", "andar": "16º Andar", "label": "1603 - 38m²", "slug": "avnu"}, {"sap": "AVN01604", "numero": "1604", "andar": "16º Andar", "label": "1604 - 38m²", "slug": "avnu"}, {"sap": "AVN01605", "numero": "1605", "andar": "16º Andar", "label": "1605 - 38m²", "slug": "avnu"}, {"sap": "AVN01606", "numero": "1606", "andar": "16º Andar", "label": "1606 - 38m²", "slug": "avnu"}, {"sap": "AVN01607", "numero": "1607", "andar": "16º Andar", "label": "1607 - 38m²", "slug": "avnu"}, {"sap": "AVN01608", "numero": "1608", "andar": "16º Andar", "label": "1608 - 38m²", "slug": "avnu"}, {"sap": "AVN01609", "numero": "1609", "andar": "16º Andar", "label": "1609 - 38m²", "slug": "avnu"}, {"sap": "AVN01610", "numero": "1610", "andar": "16º Andar", "label": "1610 - 38m²", "slug": "avnu"}, {"sap": "AVN01611", "numero": "1611", "andar": "16º Andar", "label": "1611 - 49m²", "slug": "avnu"}, {"sap": "AVN01612", "numero": "1612", "andar": "16º Andar", "label": "1612 - 49m²", "slug": "avnu"}, {"sap": "AVN01613", "numero": "1613", "andar": "16º Andar", "label": "1613 - 69m² - 2D", "slug": "avnu"}, {"sap": "AVN01614", "numero": "1614", "andar": "16º Andar", "label": "1614 - 69m² - 1D", "slug": "avnu"}, {"sap": "AVN01701", "numero": "1701", "andar": "17º Andar", "label": "1701 - 49m²", "slug": "avnu"}, {"sap": "AVN01702", "numero": "1702", "andar": "17º Andar", "label": "1702 - 49m²", "slug": "avnu"}, {"sap": "AVN01703", "numero": "1703", "andar": "17º Andar", "label": "1703 - 38m²", "slug": "avnu"}, {"sap": "AVN01704", "numero": "1704", "andar": "17º Andar", "label": "1704 - 38m²", "slug": "avnu"}, {"sap": "AVN01705", "numero": "1705", "andar": "17º Andar", "label": "1705 - 38m²", "slug": "avnu"}, {"sap": "AVN01706", "numero": "1706", "andar": "17º Andar", "label": "1706 - 38m²", "slug": "avnu"}, {"sap": "AVN01707", "numero": "1707", "andar": "17º Andar", "label": "1707 - 38m²", "slug": "avnu"}, {"sap": "AVN01708", "numero": "1708", "andar": "17º Andar", "label": "1708 - 38m²", "slug": "avnu"}, {"sap": "AVN01709", "numero": "1709", "andar": "17º Andar", "label": "1709 - 38m²", "slug": "avnu"}, {"sap": "AVN01710", "numero": "1710", "andar": "17º Andar", "label": "1710 - 38m²", "slug": "avnu"}, {"sap": "AVN01711", "numero": "1711", "andar": "17º Andar", "label": "1711 - 49m²", "slug": "avnu"}, {"sap": "AVN01712", "numero": "1712", "andar": "17º Andar", "label": "1712 - 49m²", "slug": "avnu"}, {"sap": "AVN01713", "numero": "1713", "andar": "17º Andar", "label": "1713 - 69m² - 2D", "slug": "avnu"}, {"sap": "AVN01714", "numero": "1714", "andar": "17º Andar", "label": "1714 - 69m² - 1D", "slug": "avnu"}, {"sap": "AVN01803", "numero": "1803", "andar": "18º Andar", "label": "1803 - 87m²", "slug": "avnu"}, {"sap": "AVN01804", "numero": "1804", "andar": "18º Andar", "label": "1804 - 87m²", "slug": "avnu"}, {"sap": "AVN01805", "numero": "1805", "andar": "18º Andar", "label": "1805 - 76m²", "slug": "avnu"}, {"sap": "AVN01806", "numero": "1806", "andar": "18º Andar", "label": "1806 - 76m²", "slug": "avnu"}, {"sap": "AVN01809", "numero": "1809", "andar": "18º Andar", "label": "1809 - 87m²", "slug": "avnu"}, {"sap": "AVN01810", "numero": "1810", "andar": "18º Andar", "label": "1810 - 87m²", "slug": "avnu"}, {"sap": "AVN01813", "numero": "1813", "andar": "18º Andar", "label": "1813 - 69m² - 2D", "slug": "avnu"}, {"sap": "AVN01814", "numero": "1814", "andar": "18º Andar", "label": "1814 - 69m² - 1D", "slug": "avnu"}, {"sap": "AVN01903", "numero": "1903", "andar": "19º Andar", "label": "1903 - 87m²", "slug": "avnu"}, {"sap": "AVN01904", "numero": "1904", "andar": "19º Andar", "label": "1904 - 87m²", "slug": "avnu"}, {"sap": "AVN01905", "numero": "1905", "andar": "19º Andar", "label": "1905 - 76m²", "slug": "avnu"}, {"sap": "AVN01906", "numero": "1906", "andar": "19º Andar", "label": "1906 - 76m²", "slug": "avnu"}, {"sap": "AVN01909", "numero": "1909", "andar": "19º Andar", "label": "1909 - 87m²", "slug": "avnu"}, {"sap": "AVN01910", "numero": "1910", "andar": "19º Andar", "label": "1910 - 87m²", "slug": "avnu"}, {"sap": "AVN01913", "numero": "1913", "andar": "19º Andar", "label": "1913 - 69m² - 2D", "slug": "avnu"}, {"sap": "AVN01914", "numero": "1914", "andar": "19º Andar", "label": "1914 - 69m² - 1D", "slug": "avnu"}, {"sap": "AVN02003", "numero": "2003", "andar": "20º Andar", "label": "2003 - 87m²", "slug": "avnu"}, {"sap": "AVN02004", "numero": "2004", "andar": "20º Andar", "label": "2004 - 87m²", "slug": "avnu"}, {"sap": "AVN02005", "numero": "2005", "andar": "20º Andar", "label": "2005 - 76m²", "slug": "avnu"}, {"sap": "AVN02006", "numero": "2006", "andar": "20º Andar", "label": "2006 - 76m²", "slug": "avnu"}, {"sap": "AVN02009", "numero": "2009", "andar": "20º Andar", "label": "2009 - 87m²", "slug": "avnu"}, {"sap": "AVN02010", "numero": "2010", "andar": "20º Andar", "label": "2010 - 87m²", "slug": "avnu"}, {"sap": "AVN02013", "numero": "2013", "andar": "20º Andar", "label": "2013 - 69m² - 2D", "slug": "avnu"}, {"sap": "AVN02014", "numero": "2014", "andar": "20º Andar", "label": "2014 - 69m² - 1D", "slug": "avnu"}, {"sap": "AVN02101", "numero": "2101", "andar": "21º Andar", "label": "2101 - 49m²", "slug": "avnu"}, {"sap": "AVN02102", "numero": "2102", "andar": "21º Andar", "label": "2102 - 49m²", "slug": "avnu"}, {"sap": "AVN02107", "numero": "2107", "andar": "21º Andar", "label": "2107 - 150m²", "slug": "avnu"}, {"sap": "AVN02108", "numero": "2108", "andar": "21º Andar", "label": "2108 - 150m²", "slug": "avnu"}, {"sap": "AVN02111", "numero": "2111", "andar": "21º Andar", "label": "2111 - 49m²", "slug": "avnu"}, {"sap": "AVN02112", "numero": "2112", "andar": "21º Andar", "label": "2112 - 49m²", "slug": "avnu"}, {"sap": "AVN02113", "numero": "2113", "andar": "21º Andar", "label": "2113 - 69m² - 2D", "slug": "avnu"}, {"sap": "AVN02114", "numero": "2114", "andar": "21º Andar", "label": "2114 - 69m² - 1D", "slug": "avnu"}, {"sap": "AVN02201", "numero": "2201", "andar": "22º Andar", "label": "2201 - 49m²", "slug": "avnu"}, {"sap": "AVN02202", "numero": "2202", "andar": "22º Andar", "label": "2202 - 49m²", "slug": "avnu"}, {"sap": "AVN02207", "numero": "2207", "andar": "22º Andar", "label": "2207 - 150m²", "slug": "avnu"}, {"sap": "AVN02208", "numero": "2208", "andar": "22º Andar", "label": "2208 - 150m²", "slug": "avnu"}, {"sap": "AVN02211", "numero": "2211", "andar": "22º Andar", "label": "2211 - 49m²", "slug": "avnu"}, {"sap": "AVN02212", "numero": "2212", "andar": "22º Andar", "label": "2212 - 49m²", "slug": "avnu"}, {"sap": "AVN02213", "numero": "2213", "andar": "22º Andar", "label": "2213 - 69m² - 2D", "slug": "avnu"}, {"sap": "AVN02214", "numero": "2214", "andar": "22º Andar", "label": "2214 - 69m² - 1D", "slug": "avnu"}, {"sap": "AVN02303", "numero": "2303", "andar": "23º Andar", "label": "2303 - 87m²", "slug": "avnu"}, {"sap": "AVN02304", "numero": "2304", "andar": "23º Andar", "label": "2304 - 87m²", "slug": "avnu"}, {"sap": "AVN02305", "numero": "2305", "andar": "23º Andar", "label": "2305 - 76m²", "slug": "avnu"}, {"sap": "AVN02306", "numero": "2306", "andar": "23º Andar", "label": "2306 - 76m²", "slug": "avnu"}, {"sap": "AVN02309", "numero": "2309", "andar": "23º Andar", "label": "2309 - 162m²", "slug": "avnu"}, {"sap": "AVN02310", "numero": "2310", "andar": "23º Andar", "label": "2310 - 162m²", "slug": "avnu"}, {"sap": "AVN02403", "numero": "2403", "andar": "24º Andar", "label": "2403 - 87m²", "slug": "avnu"}, {"sap": "AVN02404", "numero": "2404", "andar": "24º Andar", "label": "2404 - 87m²", "slug": "avnu"}, {"sap": "AVN02405", "numero": "2405", "andar": "24º Andar", "label": "2405 - 76m²", "slug": "avnu"}, {"sap": "AVN02406", "numero": "2406", "andar": "24º Andar", "label": "2406 - 76m²", "slug": "avnu"}, {"sap": "AVN02409", "numero": "2409", "andar": "24º Andar", "label": "2409 - 162m²", "slug": "avnu"}, {"sap": "AVN02410", "numero": "2410", "andar": "24º Andar", "label": "2410 - 162m²", "slug": "avnu"}, {"sap": "AVN02501", "numero": "2501", "andar": "25º Andar", "label": "2501 - 49m²", "slug": "avnu"}, {"sap": "AVN02502", "numero": "2502", "andar": "25º Andar", "label": "2502 - 49m²", "slug": "avnu"}, {"sap": "AVN02503", "numero": "2503", "andar": "25º Andar", "label": "2503 - 76m²", "slug": "avnu"}, {"sap": "AVN02504", "numero": "2504", "andar": "25º Andar", "label": "2504 - 76m²", "slug": "avnu"}, {"sap": "AVN02507", "numero": "2507", "andar": "25º Andar", "label": "2507 - 205m²", "slug": "avnu"}, {"sap": "AVN02508", "numero": "2508", "andar": "25º Andar", "label": "2508 - 205m²", "slug": "avnu"}, {"sap": "AVN02601", "numero": "2601", "andar": "26º Andar", "label": "2601 - 49m²", "slug": "avnu"}, {"sap": "AVN02602", "numero": "2602", "andar": "26º Andar", "label": "2602 - 49m²", "slug": "avnu"}, {"sap": "AVN02607", "numero": "2607", "andar": "26º Andar", "label": "2607 - 150m²", "slug": "avnu"}, {"sap": "AVN02608", "numero": "2608", "andar": "26º Andar", "label": "2608 - 150m²", "slug": "avnu"}, {"sap": "AVN02611", "numero": "2611", "andar": "26º Andar", "label": "2611 - 263m²", "slug": "avnu"}, {"sap": "JFL00061", "numero": "61", "andar": "6º Andar", "label": "Unidade 61 - 116m²", "slug": "jfl125"}, {"sap": "JFL00062", "numero": "62", "andar": "6º Andar", "label": "Unidade 62 - 83m²", "slug": "jfl125"}, {"sap": "JFL00063", "numero": "63", "andar": "6º Andar", "label": "Unidade 63 - 83m²", "slug": "jfl125"}, {"sap": "JFL00064", "numero": "64", "andar": "6º Andar", "label": "Unidade 64 - 116m²", "slug": "jfl125"}, {"sap": "JFL00065", "numero": "65", "andar": "6º Andar", "label": "Unidade 65 - 60m²", "slug": "jfl125"}, {"sap": "JFL00066", "numero": "66", "andar": "6º Andar", "label": "Unidade 66 - 60m²", "slug": "jfl125"}, {"sap": "JFL00067", "numero": "67", "andar": "6º Andar", "label": "Unidade 67 - 60m²", "slug": "jfl125"}, {"sap": "JFL00068", "numero": "68", "andar": "6º Andar", "label": "Unidade 68 - 60m²", "slug": "jfl125"}, {"sap": "JFL00071", "numero": "71", "andar": "7º Andar", "label": "Unidade 71 - 116m²", "slug": "jfl125"}, {"sap": "JFL00072", "numero": "72", "andar": "7º Andar", "label": "Unidade 72 - 83m²", "slug": "jfl125"}, {"sap": "JFL00073", "numero": "73", "andar": "7º Andar", "label": "Unidade 73 - 83m²", "slug": "jfl125"}, {"sap": "JFL00074", "numero": "74", "andar": "7º Andar", "label": "Unidade 74 - 116m²", "slug": "jfl125"}, {"sap": "JFL00075", "numero": "75", "andar": "7º Andar", "label": "Unidade 75 - 60m²", "slug": "jfl125"}, {"sap": "JFL00076", "numero": "76", "andar": "7º Andar", "label": "Unidade 76 - 60m²", "slug": "jfl125"}, {"sap": "JFL00077", "numero": "77", "andar": "7º Andar", "label": "Unidade 77 - 60m²", "slug": "jfl125"}, {"sap": "JFL00078", "numero": "78", "andar": "7º Andar", "label": "Unidade 78 - 60m²", "slug": "jfl125"}, {"sap": "JFL00081", "numero": "81", "andar": "8º Andar", "label": "Unidade 81 - 116m²", "slug": "jfl125"}, {"sap": "JFL00082", "numero": "82", "andar": "8º Andar", "label": "Unidade 82 - 83m²", "slug": "jfl125"}, {"sap": "JFL00083", "numero": "83", "andar": "8º Andar", "label": "Unidade 83 - 83m²", "slug": "jfl125"}, {"sap": "JFL00084", "numero": "84", "andar": "8º Andar", "label": "Unidade 84 - 116m²", "slug": "jfl125"}, {"sap": "JFL00085", "numero": "85", "andar": "8º Andar", "label": "Unidade 85 - 60m²", "slug": "jfl125"}, {"sap": "JFL00086", "numero": "86", "andar": "8º Andar", "label": "Unidade 86 - 60m²", "slug": "jfl125"}, {"sap": "JFL00087", "numero": "87", "andar": "8º Andar", "label": "Unidade 87 - 60m²", "slug": "jfl125"}, {"sap": "JFL00088", "numero": "88", "andar": "8º Andar", "label": "Unidade 88 - 60m²", "slug": "jfl125"}, {"sap": "JFL00091", "numero": "91", "andar": "9º Andar", "label": "Unidade 91 - 116m²", "slug": "jfl125"}, {"sap": "JFL00092", "numero": "92", "andar": "9º Andar", "label": "Unidade 92 - 83m²", "slug": "jfl125"}, {"sap": "JFL00093", "numero": "93", "andar": "9º Andar", "label": "Unidade 93 - 83m²", "slug": "jfl125"}, {"sap": "JFL00094", "numero": "94", "andar": "9º Andar", "label": "Unidade 94 - 116m²", "slug": "jfl125"}, {"sap": "JFL00095", "numero": "95", "andar": "9º Andar", "label": "Unidade 95 - 60m²", "slug": "jfl125"}, {"sap": "JFL00096", "numero": "96", "andar": "9º Andar", "label": "Unidade 96 - 60m²", "slug": "jfl125"}, {"sap": "JFL00097", "numero": "97", "andar": "9º Andar", "label": "Unidade 97 - 60m²", "slug": "jfl125"}, {"sap": "JFL00098", "numero": "98", "andar": "9º Andar", "label": "Unidade 98 - 60m²", "slug": "jfl125"}, {"sap": "JFL00101", "numero": "101", "andar": "10º Andar", "label": "Unidade 101 - 116m²", "slug": "jfl125"}, {"sap": "JFL00102", "numero": "102", "andar": "10º Andar", "label": "Unidade 102 - 83m²", "slug": "jfl125"}, {"sap": "JFL00103", "numero": "103", "andar": "10º Andar", "label": "Unidade 103 - 83m²", "slug": "jfl125"}, {"sap": "JFL00104", "numero": "104", "andar": "10º Andar", "label": "Unidade 104 - 116m²", "slug": "jfl125"}, {"sap": "JFL00105", "numero": "105", "andar": "10º Andar", "label": "Unidade 105 - 60m²", "slug": "jfl125"}, {"sap": "JFL00106", "numero": "106", "andar": "10º Andar", "label": "Unidade 106 - 60m²", "slug": "jfl125"}, {"sap": "JFL00107", "numero": "107", "andar": "10º Andar", "label": "Unidade 107 - 60m²", "slug": "jfl125"}, {"sap": "JFL00108", "numero": "108", "andar": "10º Andar", "label": "Unidade 108 - 60m²", "slug": "jfl125"}, {"sap": "JFL00111", "numero": "111", "andar": "11º Andar", "label": "Unidade 111 - 116m²", "slug": "jfl125"}, {"sap": "JFL00112", "numero": "112", "andar": "11º Andar", "label": "Unidade 112 - 83m²", "slug": "jfl125"}, {"sap": "JFL00113", "numero": "113", "andar": "11º Andar", "label": "Unidade 113 - 83m²", "slug": "jfl125"}, {"sap": "JFL00114", "numero": "114", "andar": "11º Andar", "label": "Unidade 114 - 116m²", "slug": "jfl125"}, {"sap": "JFL00115", "numero": "115", "andar": "11º Andar", "label": "Unidade 115 - 60m²", "slug": "jfl125"}, {"sap": "JFL00116", "numero": "116", "andar": "11º Andar", "label": "Unidade 116 - 60m²", "slug": "jfl125"}, {"sap": "JFL00117", "numero": "117", "andar": "11º Andar", "label": "Unidade 117 - 60m²", "slug": "jfl125"}, {"sap": "JFL00118", "numero": "118", "andar": "11º Andar", "label": "Unidade 118 - 60m²", "slug": "jfl125"}, {"sap": "JFL00121", "numero": "121", "andar": "12º Andar", "label": "Unidade 121 - 116m²", "slug": "jfl125"}, {"sap": "JFL00122", "numero": "122", "andar": "12º Andar", "label": "Unidade 122 - 83m²", "slug": "jfl125"}, {"sap": "JFL00123", "numero": "123", "andar": "12º Andar", "label": "Unidade 123 - 83m²", "slug": "jfl125"}, {"sap": "JFL00124", "numero": "124", "andar": "12º Andar", "label": "Unidade 124 - 116m²", "slug": "jfl125"}, {"sap": "JFL00125", "numero": "125", "andar": "12º Andar", "label": "Unidade 125 - 60m²", "slug": "jfl125"}, {"sap": "JFL00126", "numero": "126", "andar": "12º Andar", "label": "Unidade 126 - 60m²", "slug": "jfl125"}, {"sap": "JFL00127", "numero": "127", "andar": "12º Andar", "label": "Unidade 127 - 60m²", "slug": "jfl125"}, {"sap": "JFL00128", "numero": "128", "andar": "12º Andar", "label": "Unidade 128 - 60m²", "slug": "jfl125"}, {"sap": "JFL00131", "numero": "131", "andar": "13º Andar", "label": "Unidade 131 - 116m²", "slug": "jfl125"}, {"sap": "JFL00132", "numero": "132", "andar": "13º Andar", "label": "Unidade 132 - 83m²", "slug": "jfl125"}, {"sap": "JFL00133", "numero": "133", "andar": "13º Andar", "label": "Unidade 133 - 83m²", "slug": "jfl125"}, {"sap": "JFL00134", "numero": "134", "andar": "13º Andar", "label": "Unidade 134 - 116m²", "slug": "jfl125"}, {"sap": "JFL00135", "numero": "135", "andar": "13º Andar", "label": "Unidade 135 - 60m²", "slug": "jfl125"}, {"sap": "JFL00136", "numero": "136", "andar": "13º Andar", "label": "Unidade 136 - 60m²", "slug": "jfl125"}, {"sap": "JFL00137", "numero": "137", "andar": "13º Andar", "label": "Unidade 137 - 60m²", "slug": "jfl125"}, {"sap": "JFL00138", "numero": "138", "andar": "13º Andar", "label": "Unidade 138 - 60m²", "slug": "jfl125"}, {"sap": "JFL00142", "numero": "142", "andar": "14º Andar", "label": "Unidade 142 - 196m²", "slug": "jfl125"}, {"sap": "JFL00143", "numero": "143", "andar": "14º Andar", "label": "Unidade 143 - 196m²", "slug": "jfl125"}, {"sap": "JFL00145", "numero": "145", "andar": "14º Andar", "label": "Unidade 145 - 60m²", "slug": "jfl125"}, {"sap": "JFL00146", "numero": "146", "andar": "14º Andar", "label": "Unidade 146 - 116m²", "slug": "jfl125"}, {"sap": "JFL00148", "numero": "148", "andar": "14º Andar", "label": "Unidade 148 - 60m²", "slug": "jfl125"}, {"sap": "JFL00152", "numero": "152", "andar": "15º Andar", "label": "Unidade 152 - 196m²", "slug": "jfl125"}, {"sap": "JFL00153", "numero": "153", "andar": "15º Andar", "label": "Unidade 153 - 196m²", "slug": "jfl125"}, {"sap": "JFL00155", "numero": "155", "andar": "15º Andar", "label": "Unidade 155 - 60m²", "slug": "jfl125"}, {"sap": "JFL00156", "numero": "156", "andar": "15º Andar", "label": "Unidade 156 - 116m²", "slug": "jfl125"}, {"sap": "JFL00158", "numero": "158", "andar": "15º Andar", "label": "Unidade 158 - 60m²", "slug": "jfl125"}, {"sap": "JFL00161", "numero": "161", "andar": "16º Andar", "label": "Unidade 161 - 178m²", "slug": "jfl125"}, {"sap": "JFL00162", "numero": "162", "andar": "16º Andar", "label": "Unidade 162 - 166m²", "slug": "jfl125"}, {"sap": "JFL00164", "numero": "164", "andar": "17º Andar", "label": "Unidade 164 - 178m²", "slug": "jfl125"}, {"sap": "JFL00166", "numero": "166", "andar": "16º Andar", "label": "Unidade 166 - 116m²", "slug": "jfl125"}, {"sap": "JFL00171", "numero": "171", "andar": "17º Andar", "label": "Unidade 171 - 178m²", "slug": "jfl125"}, {"sap": "JFL00172", "numero": "172", "andar": "17º Andar", "label": "Unidade 172 - 166m²", "slug": "jfl125"}, {"sap": "JFL00174", "numero": "174", "andar": "17º Andar", "label": "Unidade 174 - 178m²", "slug": "jfl125"}, {"sap": "JFL00176", "numero": "176", "andar": "17º Andar", "label": "Unidade 176 - 116m²", "slug": "jfl125"}, {"sap": "JFL00181", "numero": "181", "andar": "18º Andar", "label": "Unidade 181 - 178m²", "slug": "jfl125"}, {"sap": "JFL00182", "numero": "182", "andar": "18º Andar", "label": "Unidade 182 - 166m²", "slug": "jfl125"}, {"sap": "JFL00184", "numero": "184", "andar": "18º Andar", "label": "Unidade 184 - 178m²", "slug": "jfl125"}, {"sap": "JFL00186", "numero": "186", "andar": "18º Andar", "label": "Unidade 186 - 116m²", "slug": "jfl125"}, {"sap": "JFL00191", "numero": "191", "andar": "19º Andar", "label": "Unidade 191 - 178m²", "slug": "jfl125"}, {"sap": "JFL00192", "numero": "192", "andar": "19º Andar", "label": "Unidade 192 - 166m²", "slug": "jfl125"}, {"sap": "JFL00194", "numero": "194", "andar": "19º Andar", "label": "Unidade 194 - 178m²", "slug": "jfl125"}, {"sap": "JFL00196", "numero": "196", "andar": "19º Andar", "label": "Unidade 196 - 116m²", "slug": "jfl125"}, {"sap": "JFL00201", "numero": "201", "andar": "20º Andar", "label": "Unidade 201 - 178m²", "slug": "jfl125"}, {"sap": "JFL00202", "numero": "202", "andar": "20º Andar", "label": "Unidade 202 - 166m²", "slug": "jfl125"}, {"sap": "JFL00204", "numero": "204", "andar": "20º Andar", "label": "Unidade 204 - 178m²", "slug": "jfl125"}, {"sap": "JFL00206", "numero": "206", "andar": "20º Andar", "label": "Unidade 206 - 116m²", "slug": "jfl125"}, {"sap": "JFL00211", "numero": "211", "andar": "21º Andar", "label": "Unidade 211 - 178m²", "slug": "jfl125"}, {"sap": "JFL00212", "numero": "212", "andar": "21º Andar", "label": "Unidade 212 - 166m²", "slug": "jfl125"}, {"sap": "JFL00214", "numero": "214", "andar": "21º Andar", "label": "Unidade 214 - 178m²", "slug": "jfl125"}, {"sap": "JFL00216", "numero": "216", "andar": "21º Andar", "label": "Unidade 216 - 116m²", "slug": "jfl125"}, {"sap": "JFL00222", "numero": "222", "andar": "22º Andar", "label": "Unidade 222 - 258m²", "slug": "jfl125"}, {"sap": "JFL00223", "numero": "223", "andar": "22º Andar", "label": "Unidade 223 - 258m²", "slug": "jfl125"}, {"sap": "JFL00226", "numero": "226", "andar": "22º Andar", "label": "Unidade 226 - 116m²", "slug": "jfl125"}, {"sap": "JFL00232", "numero": "232", "andar": "23º Andar", "label": "Unidade 232 - 258m²", "slug": "jfl125"}, {"sap": "JFL00233", "numero": "233", "andar": "23º Andar", "label": "Unidade 233 - 258m²", "slug": "jfl125"}, {"sap": "JFL00236", "numero": "236", "andar": "23º Andar", "label": "Unidade 236 - 116m²", "slug": "jfl125"}, {"sap": "JFL00242", "numero": "242", "andar": "24º Andar", "label": "Unidade 242 - 431m²", "slug": "jfl125"}, {"sap": "JFL00243", "numero": "243", "andar": "24º Andar", "label": "Unidade 243 - 258m²", "slug": "jfl125"}, {"sap": "JFL00246", "numero": "246", "andar": "24º Andar", "label": "Unidade 246 - 230m²", "slug": "jfl125"}, {"sap": "JML00401", "numero": "401", "andar": "4º Andar", "label": "Unidade 401 - 44m²", "slug": "jml"}, {"sap": "JML00402", "numero": "402", "andar": "4º Andar", "label": "Unidade 402 - 44m²", "slug": "jml"}, {"sap": "JML00403", "numero": "403", "andar": "4º Andar", "label": "Unidade 403 - 44m²", "slug": "jml"}, {"sap": "JML00404", "numero": "404", "andar": "4º Andar", "label": "Unidade 404 - 44m²", "slug": "jml"}, {"sap": "JML00405", "numero": "405", "andar": "4º Andar", "label": "Unidade 405 - 44m²", "slug": "jml"}, {"sap": "JML00406", "numero": "406", "andar": "4º Andar", "label": "Unidade 406 - 44m²", "slug": "jml"}, {"sap": "JML00407", "numero": "407", "andar": "4º Andar", "label": "Unidade 407 - 44m²", "slug": "jml"}, {"sap": "JML00408", "numero": "408", "andar": "4º Andar", "label": "Unidade 408 - 44m²", "slug": "jml"}, {"sap": "JML00409", "numero": "409", "andar": "4º Andar", "label": "Unidade 409 - 44m²", "slug": "jml"}, {"sap": "JML00410", "numero": "410", "andar": "4º Andar", "label": "Unidade 410 - 44m²", "slug": "jml"}, {"sap": "JML00413", "numero": "413", "andar": "4º Andar", "label": "Unidade 413 - 44m²", "slug": "jml"}, {"sap": "JML00414", "numero": "414", "andar": "4º Andar", "label": "Unidade 414 - 44m²", "slug": "jml"}, {"sap": "JML00415", "numero": "415", "andar": "4º Andar", "label": "Unidade 415 - 44m²", "slug": "jml"}, {"sap": "JML00501", "numero": "501", "andar": "5º Andar", "label": "Unidade 501 - 44m²", "slug": "jml"}, {"sap": "JML00503", "numero": "503", "andar": "5º Andar", "label": "Unidade 503 - 84m²", "slug": "jml"}, {"sap": "JML00505", "numero": "505", "andar": "5º Andar", "label": "Unidade 505 - 84m²", "slug": "jml"}, {"sap": "JML00507", "numero": "507", "andar": "5º Andar", "label": "Unidade 507 - 74m²", "slug": "jml"}, {"sap": "JML00508", "numero": "508", "andar": "5º Andar", "label": "Unidade 508 - 44m²", "slug": "jml"}, {"sap": "JML00509", "numero": "509", "andar": "5º Andar", "label": "Unidade 509 - 44m²", "slug": "jml"}, {"sap": "JML00510", "numero": "510", "andar": "5º Andar", "label": "Unidade 510 - 44m²", "slug": "jml"}, {"sap": "JML00511", "numero": "511", "andar": "5º Andar", "label": "Unidade 511 - 44m²", "slug": "jml"}, {"sap": "JML00512", "numero": "512", "andar": "5º Andar", "label": "Unidade 512 - 44m²", "slug": "jml"}, {"sap": "JML00513", "numero": "513", "andar": "5º Andar", "label": "Unidade 513 - 44m²", "slug": "jml"}, {"sap": "JML00514", "numero": "514", "andar": "5º Andar", "label": "Unidade 514 - 44m²", "slug": "jml"}, {"sap": "JML00515", "numero": "515", "andar": "5º Andar", "label": "Unidade 515 - 44m²", "slug": "jml"}, {"sap": "JML00605", "numero": "605", "andar": "6º Andar", "label": "Unidade 605 - 84m²", "slug": "jml"}, {"sap": "JML00607", "numero": "607", "andar": "6º Andar", "label": "Unidade 607 - 74m²", "slug": "jml"}, {"sap": "JML00608", "numero": "608", "andar": "6º Andar", "label": "Unidade 608 - 44m²", "slug": "jml"}, {"sap": "JML00610", "numero": "610", "andar": "6º Andar", "label": "Unidade 610 - 44m²", "slug": "jml"}, {"sap": "JML00611", "numero": "611", "andar": "6º Andar", "label": "Unidade 611 - 44m²", "slug": "jml"}, {"sap": "JML00612", "numero": "612", "andar": "6º Andar", "label": "Unidade 612 - 44m²", "slug": "jml"}, {"sap": "JML00613", "numero": "613", "andar": "6º Andar", "label": "Unidade 613 - 44m²", "slug": "jml"}, {"sap": "JML00614", "numero": "614", "andar": "6º Andar", "label": "Unidade 614 - 44m²", "slug": "jml"}, {"sap": "JML00615", "numero": "615", "andar": "6º Andar", "label": "Unidade 615 - 44m²", "slug": "jml"}, {"sap": "JML00701", "numero": "701", "andar": "7º Andar", "label": "Unidade 701 - 44m²", "slug": "jml"}, {"sap": "JML00703", "numero": "703", "andar": "7º Andar", "label": "Unidade 703 - 74m²", "slug": "jml"}, {"sap": "JML00705", "numero": "705", "andar": "7º Andar", "label": "Unidade 705 - 84m²", "slug": "jml"}, {"sap": "JML00706", "numero": "706", "andar": "7º Andar", "label": "Unidade 706 - 44m²", "slug": "jml"}, {"sap": "JML00707", "numero": "707", "andar": "7º Andar", "label": "Unidade 707 - 148m²", "slug": "jml"}, {"sap": "JML00711", "numero": "711", "andar": "7º Andar", "label": "Unidade 711 - 84m²", "slug": "jml"}, {"sap": "JML00712", "numero": "712", "andar": "7º Andar", "label": "Unidade 712 - 44m²", "slug": "jml"}, {"sap": "JML00713", "numero": "713", "andar": "7º Andar", "label": "Unidade 713 - 44m²", "slug": "jml"}, {"sap": "JML00714", "numero": "714", "andar": "7º Andar", "label": "Unidade 714 - 44m²", "slug": "jml"}, {"sap": "JML00715", "numero": "715", "andar": "7º Andar", "label": "Unidade 715 - 44m²", "slug": "jml"}, {"sap": "JML00805", "numero": "805", "andar": "8º Andar", "label": "Unidade 805 - 84m²", "slug": "jml"}, {"sap": "JML00807", "numero": "807", "andar": "8º Andar", "label": "Unidade 807 - 84m²", "slug": "jml"}, {"sap": "JML00808", "numero": "808", "andar": "8º Andar", "label": "Unidade 808 - 44m²", "slug": "jml"}, {"sap": "JML00809", "numero": "809", "andar": "8º Andar", "label": "Unidade 809 - 44m²", "slug": "jml"}, {"sap": "JML00811", "numero": "811", "andar": "8º Andar", "label": "Unidade 811 - 84m²", "slug": "jml"}, {"sap": "JML00812", "numero": "812", "andar": "8º Andar", "label": "Unidade 812 - 44m²", "slug": "jml"}, {"sap": "JML00814", "numero": "814", "andar": "8º Andar", "label": "Unidade 814 - 124m²", "slug": "jml"}, {"sap": "JML00903", "numero": "901", "andar": "9º Andar", "label": "Unidade 901 - 44m²", "slug": "jml"}, {"sap": "JML00903", "numero": "903", "andar": "9º Andar", "label": "Unidade 903 - 74m²", "slug": "jml"}, {"sap": "JML00905", "numero": "905", "andar": "9º Andar", "label": "Unidade 905 - 84m²", "slug": "jml"}, {"sap": "JML00907", "numero": "907", "andar": "9º Andar", "label": "Unidade 907 - 84m²", "slug": "jml"}, {"sap": "JML00908", "numero": "908", "andar": "9º Andar", "label": "Unidade 908 - 44m²", "slug": "jml"}, {"sap": "JML00909", "numero": "909", "andar": "9º Andar", "label": "Unidade 909 - 44m²", "slug": "jml"}, {"sap": "JML00911", "numero": "911", "andar": "9º Andar", "label": "Unidade 911 - 130m²", "slug": "jml"}, {"sap": "JML00914", "numero": "914", "andar": "9º Andar", "label": "Unidade 914 - 130m²", "slug": "jml"}, {"sap": "JML01003", "numero": "1003", "andar": "10º Andar", "label": "Unidade 1003 - 74m²", "slug": "jml"}, {"sap": "JML01005", "numero": "1005", "andar": "10º Andar", "label": "Unidade 1005 - 84m²", "slug": "jml"}, {"sap": "JML01007", "numero": "1007", "andar": "10º Andar", "label": "Unidade 1007 - 84m²", "slug": "jml"}, {"sap": "JML01008", "numero": "1008", "andar": "10º Andar", "label": "Unidade 1008 - 44m²", "slug": "jml"}, {"sap": "JML01011", "numero": "1011", "andar": "10º Andar", "label": "Unidade 1011 - 84m²", "slug": "jml"}, {"sap": "JML01012", "numero": "1012", "andar": "10º Andar", "label": "Unidade 1012 - 44m²", "slug": "jml"}, {"sap": "JML01014", "numero": "1014", "andar": "10º Andar", "label": "Unidade 1014 - 130m²", "slug": "jml"}, {"sap": "JML01101", "numero": "1101", "andar": "11º Andar", "label": "Unidade 1101 - 44m²", "slug": "jml"}, {"sap": "JML01103", "numero": "1103", "andar": "11º Andar", "label": "Unidade 1103 - 74m²", "slug": "jml"}, {"sap": "JML01105", "numero": "1105", "andar": "11º Andar", "label": "Unidade 1105 - 84m²", "slug": "jml"}, {"sap": "JML01106", "numero": "1106", "andar": "11º Andar", "label": "Unidade 1106 - 44m²", "slug": "jml"}, {"sap": "JML01107", "numero": "1107", "andar": "11º Andar", "label": "Unidade 1107 - 148m²", "slug": "jml"}, {"sap": "JML01111", "numero": "1111", "andar": "11º Andar", "label": "Unidade 1111 - 84m²", "slug": "jml"}, {"sap": "JML01112", "numero": "1112", "andar": "11º Andar", "label": "Unidade 1112 - 44m²", "slug": "jml"}, {"sap": "JML01114", "numero": "1114", "andar": "11º Andar", "label": "Unidade 1114 - 130m²", "slug": "jml"}, {"sap": "JML01203", "numero": "1203", "andar": "12º Andar", "label": "Unidade 1203 - 74m²", "slug": "jml"}, {"sap": "JML01205", "numero": "1205", "andar": "12º Andar", "label": "Unidade 1205 - 90m²", "slug": "jml"}, {"sap": "JML01207", "numero": "1207", "andar": "12º Andar", "label": "Unidade 1207 - 90m²", "slug": "jml"}, {"sap": "JML01210", "numero": "1210", "andar": "12º Andar", "label": "Unidade 1210 - 136m²", "slug": "jml"}, {"sap": "JML01212", "numero": "1212", "andar": "12º Andar", "label": "Unidade 1212 - 44m²", "slug": "jml"}, {"sap": "JML01214", "numero": "1214", "andar": "12º Andar", "label": "Unidade 1214 - 136m²", "slug": "jml"}, {"sap": "JML01303", "numero": "1303", "andar": "13º Andar", "label": "Unidade 1303 - 74m²", "slug": "jml"}, {"sap": "JML01310", "numero": "1310", "andar": "13º Andar", "label": "Unidade 1310 - 136m²", "slug": "jml"}, {"sap": "JML01312", "numero": "1312", "andar": "13º Andar", "label": "Unidade 1312 - 44m²", "slug": "jml"}, {"sap": "JML01314", "numero": "1314", "andar": "13º Andar", "label": "Unidade 1314 - 90m²", "slug": "jml"}, {"sap": "JML01315", "numero": "1315", "andar": "13º Andar", "label": "Unidade 1315 - 44m²", "slug": "jml"}, {"sap": "JML01410", "numero": "1410", "andar": "14º Andar", "label": "Unidade 1410 - 136m²", "slug": "jml"}, {"sap": "JML01412", "numero": "1412", "andar": "14º Andar", "label": "Unidade 1412 - 44m²", "slug": "jml"}, {"sap": "JML01414", "numero": "1414", "andar": "14º Andar", "label": "Unidade 1414 - 90m²", "slug": "jml"}, {"sap": "JML01415", "numero": "1415", "andar": "14º Andar", "label": "Unidade 1415 - 44m²", "slug": "jml"}, {"sap": "JML01510", "numero": "1510", "andar": "15º Andar", "label": "Unidade 1510 - 130m²", "slug": "jml"}, {"sap": "JML01512", "numero": "1512", "andar": "15º Andar", "label": "Unidade 1512 - 44m²", "slug": "jml"}, {"sap": "JML01514", "numero": "1514", "andar": "15º Andar", "label": "Unidade 1514 - 84m²", "slug": "jml"}, {"sap": "JML01611", "numero": "1611", "andar": "16º Andar", "label": "Unidade 1611 - 130m²", "slug": "jml"}, {"sap": "JML01614", "numero": "1614", "andar": "16º Andar", "label": "Unidade 1614 - 84m²", "slug": "jml"}, {"sap": "JML01711", "numero": "1711", "andar": "17º Andar", "label": "Unidade 1711 - 130m²", "slug": "jml"}, {"sap": "JML01714", "numero": "1714", "andar": "17º Andar", "label": "Unidade 1714 - 84m²", "slug": "jml"}, {"sap": "JML01806", "numero": "1806", "andar": "18º Andar", "label": "Unidade 1806 - 79m²", "slug": "jml"}, {"sap": "JML01807", "numero": "1807", "andar": "18º Andar", "label": "Unidade 1807 - 79m²", "slug": "jml"}, {"sap": "JML01809", "numero": "1809", "andar": "18º Andar", "label": "Unidade 1809 - 70m²", "slug": "jml"}, {"sap": "JML01810", "numero": "1810", "andar": "18º Andar", "label": "Unidade 1810 - 142m²", "slug": "jml"}, {"sap": "JML01812", "numero": "1812", "andar": "18º Andar", "label": "Unidade 1812 - 70m²", "slug": "jml"}, {"sap": "JML01814", "numero": "1814", "andar": "18º Andar", "label": "Unidade 1814 - 212m²", "slug": "jml"}, {"sap": "VHO00701", "numero": "701", "andar": "7º Andar", "label": "Unidade 701 - 42m²", "slug": "vhouse"}, {"sap": "VHO00702", "numero": "702", "andar": "7º Andar", "label": "Unidade 702 - 36m²", "slug": "vhouse"}, {"sap": "VHO00704", "numero": "704", "andar": "7º Andar", "label": "Unidade 704 - 36m²", "slug": "vhouse"}, {"sap": "VHO00708", "numero": "708", "andar": "7º Andar", "label": "Unidade 708 - 36m²", "slug": "vhouse"}, {"sap": "VHO00710", "numero": "710", "andar": "7º Andar", "label": "Unidade 710 - 36m²", "slug": "vhouse"}, {"sap": "VHO00711", "numero": "711", "andar": "7º Andar", "label": "Unidade 711 - 46m²", "slug": "vhouse"}, {"sap": "VHO00712", "numero": "712", "andar": "7º Andar", "label": "Unidade 712 - 36m²", "slug": "vhouse"}, {"sap": "VHO00714", "numero": "714", "andar": "7º Andar", "label": "Unidade 714 - 42m²", "slug": "vhouse"}, {"sap": "VHO00801", "numero": "801", "andar": "8º Andar", "label": "Unidade 801 - 42m²", "slug": "vhouse"}, {"sap": "VHO00806", "numero": "806", "andar": "8º Andar", "label": "Unidade 806 - 72m²", "slug": "vhouse"}, {"sap": "VHO00808", "numero": "808", "andar": "8º Andar", "label": "Unidade 808 - 72m²", "slug": "vhouse"}, {"sap": "VHO00813", "numero": "813", "andar": "8º Andar", "label": "Unidade 813 - 64m²", "slug": "vhouse"}, {"sap": "VHO00814", "numero": "814", "andar": "8º Andar", "label": "Unidade 814 - 78m²", "slug": "vhouse"}, {"sap": "VHO00901", "numero": "901", "andar": "9º Andar", "label": "Unidade 901 - 42m²", "slug": "vhouse"}, {"sap": "VHO00903", "numero": "903", "andar": "9º Andar", "label": "Unidade 903 - 64m²", "slug": "vhouse"}, {"sap": "VHO00904", "numero": "904", "andar": "9º Andar", "label": "Unidade 904 - 36m²", "slug": "vhouse"}, {"sap": "VHO00905", "numero": "905", "andar": "9º Andar", "label": "Unidade 905 - 46m²", "slug": "vhouse"}, {"sap": "VHO00914", "numero": "914", "andar": "9º Andar", "label": "Unidade 914 - 42m²", "slug": "vhouse"}, {"sap": "VHO01003", "numero": "1003", "andar": "10º Andar", "label": "Unidade 1003 - 64m²", "slug": "vhouse"}, {"sap": "VHO01013", "numero": "1013", "andar": "10º Andar", "label": "Unidade 1013 - 64m²", "slug": "vhouse"}, {"sap": "VHO01014", "numero": "1014", "andar": "40º Andar", "label": "Unidade 1014 - 42m²", "slug": "vhouse"}, {"sap": "VHO01103", "numero": "1103", "andar": "11º Andar", "label": "Unidade 1103 - 64m²", "slug": "vhouse"}, {"sap": "VHO01104", "numero": "1104", "andar": "11º Andar", "label": "Unidade 1104 - 36m²", "slug": "vhouse"}, {"sap": "VHO01107", "numero": "1107", "andar": "11º Andar", "label": "Unidade 1107 - 46m²", "slug": "vhouse"}, {"sap": "VHO01108", "numero": "1108", "andar": "11º Andar", "label": "Unidade 1108 - 36m²", "slug": "vhouse"}, {"sap": "VHO01109", "numero": "1109", "andar": "11º Andar", "label": "Unidade 1109 - 46m²", "slug": "vhouse"}, {"sap": "VHO01113", "numero": "1113", "andar": "11º Andar", "label": "Unidade 1113 - 64m²", "slug": "vhouse"}, {"sap": "VHO01114", "numero": "1114", "andar": "11º Andar", "label": "Unidade 1114 - 42m²", "slug": "vhouse"}, {"sap": "VHO01201", "numero": "1201", "andar": "12º Andar", "label": "Unidade 1201 - 42m²", "slug": "vhouse"}, {"sap": "VHO01203", "numero": "1203", "andar": "12º Andar", "label": "Unidade 1203 - 64m²", "slug": "vhouse"}, {"sap": "VHO01205", "numero": "1205", "andar": "12º Andar", "label": "Unidade 1205 - 46m²", "slug": "vhouse"}, {"sap": "VHO01207", "numero": "1207", "andar": "12º Andar", "label": "Unidade 1207 - 46m²", "slug": "vhouse"}, {"sap": "VHO01208", "numero": "1208", "andar": "12º Andar", "label": "Unidade 1208 - 36m²", "slug": "vhouse"}, {"sap": "VHO01211", "numero": "1211", "andar": "12º Andar", "label": "Unidade 1211 - 46m²", "slug": "vhouse"}, {"sap": "VHO01214", "numero": "1214", "andar": "12º Andar", "label": "Unidade 1214 - 42m²", "slug": "vhouse"}, {"sap": "VHO01301", "numero": "1301", "andar": "13º Andar", "label": "Unidade 1301 - 42m²", "slug": "vhouse"}, {"sap": "VHO01406", "numero": "1406", "andar": "14º Andar", "label": "Unidade 1406 - 36m²", "slug": "vhouse"}, {"sap": "VHO01501", "numero": "1501", "andar": "15º Andar", "label": "Unidade 1501 - 78m²", "slug": "vhouse"}, {"sap": "VHO01513", "numero": "1513", "andar": "15º Andar", "label": "Unidade 1513 - 64m²", "slug": "vhouse"}, {"sap": "VHO01514", "numero": "1514", "andar": "15º Andar", "label": "Unidade 1514 - 42m²", "slug": "vhouse"}, {"sap": "VHO01601", "numero": "1601", "andar": "16º Andar", "label": "Unidade 1601 - 42m²", "slug": "vhouse"}, {"sap": "VHO01607", "numero": "1607", "andar": "16º Andar", "label": "Unidade 1607 - 46m²", "slug": "vhouse"}, {"sap": "VHO01609", "numero": "1609", "andar": "16º Andar", "label": "Unidade 1609 - 46m²", "slug": "vhouse"}, {"sap": "VHO01613", "numero": "1613", "andar": "16º Andar", "label": "Unidade 1613 - 64m²", "slug": "vhouse"}, {"sap": "VHO01614", "numero": "1614", "andar": "16º Andar", "label": "Unidade 1614 - 42m²", "slug": "vhouse"}, {"sap": "VHO01708", "numero": "1708", "andar": "17º Andar", "label": "Unidade 1708 - 72m²", "slug": "vhouse"}, {"sap": "VHO01714", "numero": "1714", "andar": "17º Andar", "label": "Unidade 1714 - 78m²", "slug": "vhouse"}, {"sap": "VHO01806", "numero": "1806", "andar": "18º Andar", "label": "Unidade 1806 - 36m²", "slug": "vhouse"}, {"sap": "VHO01808", "numero": "1808", "andar": "18º Andar", "label": "Unidade 1808 - 72m²", "slug": "vhouse"}, {"sap": "VHO01813", "numero": "1813", "andar": "18º Andar", "label": "Unidade 1813 - 64m²", "slug": "vhouse"}, {"sap": "VHO02001", "numero": "2001", "andar": "20º Andar", "label": "Unidade 2001 - 42m²", "slug": "vhouse"}, {"sap": "VHO02006", "numero": "2006", "andar": "20º Andar", "label": "Unidade 2006 - 36m²", "slug": "vhouse"}, {"sap": "VHO02008", "numero": "2008", "andar": "20º Andar", "label": "Unidade 2008 - 72m²", "slug": "vhouse"}, {"sap": "VHO02014", "numero": "2014", "andar": "20º Andar", "label": "Unidade 2014 - 78m²", "slug": "vhouse"}, {"sap": "VHO02103", "numero": "2103", "andar": "21º Andar", "label": "Unidade 2103 - 64m²", "slug": "vhouse"}, {"sap": "VHO02106", "numero": "2106", "andar": "21º Andar", "label": "Unidade 2106 - 72m²", "slug": "vhouse"}, {"sap": "VHO02107", "numero": "2107", "andar": "21º Andar", "label": "Unidade 2107 - 46m²", "slug": "vhouse"}, {"sap": "VHO02108", "numero": "2108", "andar": "21º Andar", "label": "Unidade 2108 - 72m²", "slug": "vhouse"}, {"sap": "VHO02109", "numero": "2109", "andar": "21º Andar", "label": "Unidade 2109 - 46m²", "slug": "vhouse"}, {"sap": "VHO02114", "numero": "2114", "andar": "21º Andar", "label": "Unidade 2114 - 78m²", "slug": "vhouse"}, {"sap": "VHO02201", "numero": "2201", "andar": "22º Andar", "label": "Unidade 2201 - 42m²", "slug": "vhouse"}, {"sap": "VHO02203", "numero": "2203", "andar": "22º Andar", "label": "Unidade 2203 - 64m²", "slug": "vhouse"}, {"sap": "VHO02205", "numero": "2205", "andar": "22º Andar", "label": "Unidade 2205 - 46m²", "slug": "vhouse"}, {"sap": "VHO02206", "numero": "2206", "andar": "22º Andar", "label": "Unidade 2206 - 72m²", "slug": "vhouse"}, {"sap": "VHO02208", "numero": "2208", "andar": "22º Andar", "label": "Unidade 2208 - 72m²", "slug": "vhouse"}, {"sap": "VHO02209", "numero": "2209", "andar": "22º Andar", "label": "Unidade 2209 - 46m²", "slug": "vhouse"}, {"sap": "VHO02213", "numero": "2213", "andar": "22º Andar", "label": "Unidade 2213 - 64m²", "slug": "vhouse"}, {"sap": "VHO02214", "numero": "2214", "andar": "22º Andar", "label": "Unidade 2214 - 78m²", "slug": "vhouse"}, {"sap": "VHO02301", "numero": "2301", "andar": "23º Andar", "label": "Unidade 2301 - 78m²", "slug": "vhouse"}, {"sap": "VHO02303", "numero": "2303", "andar": "23º Andar", "label": "Unidade 2303 - 64m²", "slug": "vhouse"}, {"sap": "VHO02306", "numero": "2306", "andar": "23º Andar", "label": "Unidade 2306 - 72m²", "slug": "vhouse"}, {"sap": "VHO02307", "numero": "2307", "andar": "23º Andar", "label": "Unidade 2307 - 136m²", "slug": "vhouse"}, {"sap": "VHO02308", "numero": "2308", "andar": "23º Andar", "label": "Unidade 2308 - 72m²", "slug": "vhouse"}, {"sap": "VHO02311", "numero": "2311", "andar": "23º Andar", "label": "Unidade 2311 - 46m²", "slug": "vhouse"}, {"sap": "VHO02313", "numero": "2313", "andar": "23º Andar", "label": "Unidade 2313 - 64m²", "slug": "vhouse"}, {"sap": "VHO02314", "numero": "2314", "andar": "23º Andar", "label": "Unidade 2314 - 78m²", "slug": "vhouse"}, {"sap": "VHO02403", "numero": "2403", "andar": "24º Andar", "label": "Unidade 2403 - 142m²", "slug": "vhouse"}, {"sap": "VHO02406", "numero": "2406", "andar": "24º Andar", "label": "Unidade 2406 - 72m²", "slug": "vhouse"}, {"sap": "VHO02408", "numero": "2408", "andar": "24º Andar", "label": "Unidade 2408 - 72m²", "slug": "vhouse"}, {"sap": "VHO02411", "numero": "2411", "andar": "24º Andar", "label": "Unidade 2411 - 46m²", "slug": "vhouse"}, {"sap": "VHO02413", "numero": "2413", "andar": "24º Andar", "label": "Unidade 2413 - 142m²", "slug": "vhouse"}, {"sap": "VHO02503", "numero": "2503", "andar": "25º Andar", "label": "Unidade 2503 - 142m²", "slug": "vhouse"}, {"sap": "VHO02506", "numero": "2506", "andar": "25º Andar", "label": "Unidade 2506 - 72m²", "slug": "vhouse"}, {"sap": "VHO02508", "numero": "2508", "andar": "25º Andar", "label": "Unidade 2508 - 72m²", "slug": "vhouse"}, {"sap": "VHO02513", "numero": "2513", "andar": "25º Andar", "label": "Unidade 2513 - 142m²", "slug": "vhouse"}, {"sap": "VHO02603", "numero": "2603", "andar": "26º Andar", "label": "Unidade 2603 - 142m²", "slug": "vhouse"}, {"sap": "VHO02606", "numero": "2606", "andar": "26º Andar", "label": "Unidade 2606 - 72m²", "slug": "vhouse"}, {"sap": "VHO02607", "numero": "2607", "andar": "26º Andar", "label": "Unidade 2607 - 136m²", "slug": "vhouse"}, {"sap": "VHO02608", "numero": "2608", "andar": "26º Andar", "label": "Unidade 2608 - 72m²", "slug": "vhouse"}, {"sap": "VHO02611", "numero": "2611", "andar": "26º Andar", "label": "Unidade 2611 - 46m²", "slug": "vhouse"}, {"sap": "VHO02613", "numero": "2613", "andar": "26º Andar", "label": "Unidade 2613 - 142m²", "slug": "vhouse"}, {"sap": "VHO02704", "numero": "2704", "andar": "27º Andar", "label": "Unidade 2704 - 36m²", "slug": "vhouse"}, {"sap": "VHO02708", "numero": "2708", "andar": "27º Andar", "label": "Unidade 2708 - 72m²", "slug": "vhouse"}, {"sap": "VHO02709", "numero": "2709", "andar": "27º Andar", "label": "Unidade 2709 - 46m²", "slug": "vhouse"}, {"sap": "VHO02714", "numero": "2714", "andar": "27º Andar", "label": "Unidade 2714 - 78m²", "slug": "vhouse"}, {"sap": "VHO02801", "numero": "2801", "andar": "28º Andar", "label": "Unidade 2801 - 265m²", "slug": "vhouse"}, {"sap": "VHO02804", "numero": "2804", "andar": "28º Andar", "label": "Unidade 2804 - 89m²", "slug": "vhouse"}, {"sap": "VHO02805", "numero": "2805", "andar": "28º Andar", "label": "Unidade 2805 - 119m²", "slug": "vhouse"}, {"sap": "VHO02806", "numero": "2806", "andar": "28º Andar", "label": "Unidade 2806 - 89m²", "slug": "vhouse"}, {"sap": "VHO02808", "numero": "2808", "andar": "28º Andar", "label": "Unidade 2808 - 156m²", "slug": "vhouse"}, {"sap": "VOO00011", "numero": "11", "andar": "1º Andar", "label": "Unidade 11 - 64m²", "slug": "vo699"}, {"sap": "VOO00012", "numero": "12", "andar": "1º Andar", "label": "Unidade 12 - 45m²", "slug": "vo699"}, {"sap": "VOO00013", "numero": "13", "andar": "1º Andar", "label": "Unidade 13 - 45m²", "slug": "vo699"}, {"sap": "VOO00014", "numero": "14", "andar": "1º Andar", "label": "Unidade 14 - 45m²", "slug": "vo699"}, {"sap": "VOO00015", "numero": "15", "andar": "1º Andar", "label": "Unidade 15 - 64m²", "slug": "vo699"}, {"sap": "VOO00021", "numero": "21", "andar": "2º Andar", "label": "Unidade 21 - 64m²", "slug": "vo699"}, {"sap": "VOO00022", "numero": "22", "andar": "2º Andar", "label": "Unidade 22 - 45m²", "slug": "vo699"}, {"sap": "VOO00023", "numero": "23", "andar": "2º Andar", "label": "Unidade 23 - 45m²", "slug": "vo699"}, {"sap": "VOO00024", "numero": "24", "andar": "2º Andar", "label": "Unidade 24 - 45m²", "slug": "vo699"}, {"sap": "VOO00025", "numero": "25", "andar": "2º Andar", "label": "Unidade 25 - 64m²", "slug": "vo699"}, {"sap": "VOO00031", "numero": "31", "andar": "3º Andar", "label": "Unidade 31 - 64m²", "slug": "vo699"}, {"sap": "VOO00032", "numero": "32", "andar": "3º Andar", "label": "Unidade 32 - 45m²", "slug": "vo699"}, {"sap": "VOO00033", "numero": "33", "andar": "3º Andar", "label": "Unidade 33 - 45m²", "slug": "vo699"}, {"sap": "VOO00034", "numero": "34", "andar": "3º Andar", "label": "Unidade 34 - 45m²", "slug": "vo699"}, {"sap": "VOO00035", "numero": "35", "andar": "3º Andar", "label": "Unidade 35 - 64m²", "slug": "vo699"}, {"sap": "VOO00041", "numero": "41", "andar": "4º Andar", "label": "Unidade 41 - 64m²", "slug": "vo699"}, {"sap": "VOO00042", "numero": "42", "andar": "4º Andar", "label": "Unidade 42 - 45m²", "slug": "vo699"}, {"sap": "VOO00043", "numero": "43", "andar": "4º Andar", "label": "Unidade 43 - 45m²", "slug": "vo699"}, {"sap": "VOO00044", "numero": "44", "andar": "4º Andar", "label": "Unidade 44 - 45m²", "slug": "vo699"}, {"sap": "VOO00045", "numero": "45", "andar": "4º Andar", "label": "Unidade 45 - 64m²", "slug": "vo699"}, {"sap": "VOO00051", "numero": "51", "andar": "5º Andar", "label": "Unidade 51 - 64m²", "slug": "vo699"}, {"sap": "VOO00052", "numero": "52", "andar": "5º Andar", "label": "Unidade 52 - 45m²", "slug": "vo699"}, {"sap": "VOO00053", "numero": "53", "andar": "5º Andar", "label": "Unidade 53 - 45m²", "slug": "vo699"}, {"sap": "VOO00054", "numero": "54", "andar": "5º Andar", "label": "Unidade 54 - 45m²", "slug": "vo699"}, {"sap": "VOO00055", "numero": "55", "andar": "5º Andar", "label": "Unidade 55 - 64m²", "slug": "vo699"}, {"sap": "VOO00061", "numero": "61", "andar": "6º Andar", "label": "Unidade 61 - 64m²", "slug": "vo699"}, {"sap": "VOO00062", "numero": "62", "andar": "6º Andar", "label": "Unidade 62 - 45m²", "slug": "vo699"}, {"sap": "VOO00063", "numero": "63", "andar": "6º Andar", "label": "Unidade 63 - 45m²", "slug": "vo699"}, {"sap": "VOO00064", "numero": "64", "andar": "6º Andar", "label": "Unidade 64 - 45m²", "slug": "vo699"}, {"sap": "VOO00065", "numero": "65", "andar": "6º Andar", "label": "Unidade 65 - 64m²", "slug": "vo699"}, {"sap": "VOO00071", "numero": "71", "andar": "7º Andar", "label": "Unidade 71 - 64m²", "slug": "vo699"}, {"sap": "VOO00072", "numero": "72", "andar": "7º Andar", "label": "Unidade 72 - 45m²", "slug": "vo699"}, {"sap": "VOO00073", "numero": "73", "andar": "7º Andar", "label": "Unidade 73 - 45m²", "slug": "vo699"}, {"sap": "VOO00074", "numero": "74", "andar": "7º Andar", "label": "Unidade 74 - 45m²", "slug": "vo699"}, {"sap": "VOO00075", "numero": "75", "andar": "7º Andar", "label": "Unidade 75 - 64m²", "slug": "vo699"}, {"sap": "VOO00081", "numero": "81", "andar": "8º Andar", "label": "Unidade 81 - 64m²", "slug": "vo699"}, {"sap": "VOO00082", "numero": "82", "andar": "8º Andar", "label": "Unidade 82 - 45m²", "slug": "vo699"}, {"sap": "VOO00083", "numero": "83", "andar": "8º Andar", "label": "Unidade 83 - 45m²", "slug": "vo699"}, {"sap": "VOO00084", "numero": "84", "andar": "8º Andar", "label": "Unidade 84 - 45m²", "slug": "vo699"}, {"sap": "VOO00085", "numero": "85", "andar": "8º Andar", "label": "Unidade 85 - 64m²", "slug": "vo699"}, {"sap": "VOO00091", "numero": "91", "andar": "9º Andar", "label": "Unidade 91 - 64m²", "slug": "vo699"}, {"sap": "VOO00092", "numero": "92", "andar": "9º Andar", "label": "Unidade 92 - 45m²", "slug": "vo699"}, {"sap": "VOO00093", "numero": "93", "andar": "9º Andar", "label": "Unidade 93 - 45m²", "slug": "vo699"}, {"sap": "VOO00094", "numero": "94", "andar": "9º Andar", "label": "Unidade 94 - 45m²", "slug": "vo699"}, {"sap": "VOO00095", "numero": "95", "andar": "9º Andar", "label": "Unidade 95 - 64m²", "slug": "vo699"}, {"sap": "VOO00101", "numero": "101", "andar": "10º Andar", "label": "Unidade 101 - 64m²", "slug": "vo699"}, {"sap": "VOO00102", "numero": "102", "andar": "10º Andar", "label": "Unidade 102 - 45m²", "slug": "vo699"}, {"sap": "VOO00103", "numero": "103", "andar": "10º Andar", "label": "Unidade 103 - 45m²", "slug": "vo699"}, {"sap": "VOO00104", "numero": "104", "andar": "10º Andar", "label": "Unidade 104 - 45m²", "slug": "vo699"}, {"sap": "VOO00105", "numero": "105", "andar": "10º Andar", "label": "Unidade 105 - 64m²", "slug": "vo699"}, {"sap": "VOO00111", "numero": "111", "andar": "11º Andar", "label": "Unidade 111 - 64m²", "slug": "vo699"}, {"sap": "VOO00112", "numero": "112", "andar": "11º Andar", "label": "Unidade 112 - 45m²", "slug": "vo699"}, {"sap": "VOO00113", "numero": "113", "andar": "11º Andar", "label": "Unidade 113 - 45m²", "slug": "vo699"}, {"sap": "VOO00114", "numero": "114", "andar": "11º Andar", "label": "Unidade 114 - 45m²", "slug": "vo699"}, {"sap": "VOO00115", "numero": "115", "andar": "11º Andar", "label": "Unidade 115 - 64m²", "slug": "vo699"}, {"sap": "VOO00121", "numero": "121", "andar": "12º Andar", "label": "Unidade 121 - 64m²", "slug": "vo699"}, {"sap": "VOO00122", "numero": "122", "andar": "12º Andar", "label": "Unidade 122 - 45m²", "slug": "vo699"}, {"sap": "VOO00123", "numero": "123", "andar": "12º Andar", "label": "Unidade 123 - 45m²", "slug": "vo699"}, {"sap": "VOO00124", "numero": "124", "andar": "12º Andar", "label": "Unidade 124 - 45m²", "slug": "vo699"}, {"sap": "VOO00125", "numero": "125", "andar": "12º Andar", "label": "Unidade 125 - 64m²", "slug": "vo699"}, {"sap": "VOO00131", "numero": "131", "andar": "13º Andar", "label": "Unidade 131 - 64m²", "slug": "vo699"}, {"sap": "VOO00132", "numero": "132", "andar": "13º Andar", "label": "Unidade 132 - 45m²", "slug": "vo699"}, {"sap": "VOO00133", "numero": "133", "andar": "13º Andar", "label": "Unidade 133 - 45m²", "slug": "vo699"}, {"sap": "VOO00134", "numero": "134", "andar": "13º Andar", "label": "Unidade 134 - 45m²", "slug": "vo699"}, {"sap": "VOO00135", "numero": "135", "andar": "13º Andar", "label": "Unidade 135 - 64m²", "slug": "vo699"}, {"sap": "VOO00141", "numero": "141", "andar": "14º Andar", "label": "Unidade 141 - 64m²", "slug": "vo699"}, {"sap": "VOO00142", "numero": "142", "andar": "14º Andar", "label": "Unidade 142 - 45m²", "slug": "vo699"}, {"sap": "VOO00143", "numero": "143", "andar": "14º Andar", "label": "Unidade 143 - 45m²", "slug": "vo699"}, {"sap": "VOO00144", "numero": "144", "andar": "14º Andar", "label": "Unidade 144 - 45m²", "slug": "vo699"}, {"sap": "VOO00145", "numero": "145", "andar": "14º Andar", "label": "Unidade 145 - 64m²", "slug": "vo699"}, {"sap": "VOO00151", "numero": "151", "andar": "15º Andar", "label": "Unidade 151 - 64m²", "slug": "vo699"}, {"sap": "VOO00152", "numero": "152", "andar": "15º Andar", "label": "Unidade 152 - 45m²", "slug": "vo699"}, {"sap": "VOO00153", "numero": "153", "andar": "15º Andar", "label": "Unidade 153 - 45m²", "slug": "vo699"}, {"sap": "VOO00154", "numero": "154", "andar": "15º Andar", "label": "Unidade 154 - 45m²", "slug": "vo699"}, {"sap": "VOO00155", "numero": "155", "andar": "15º Andar", "label": "Unidade 155 - 64m²", "slug": "vo699"}, {"sap": "VOO00161", "numero": "161", "andar": "16º Andar", "label": "Unidade 161 - 64m²", "slug": "vo699"}, {"sap": "VOO00162", "numero": "162", "andar": "16º Andar", "label": "Unidade 162 - 45m²", "slug": "vo699"}, {"sap": "VOO00163", "numero": "163", "andar": "16º Andar", "label": "Unidade 163 - 45m²", "slug": "vo699"}, {"sap": "VOO00164", "numero": "164", "andar": "16º Andar", "label": "Unidade 164 - 45m²", "slug": "vo699"}, {"sap": "VOO00165", "numero": "165", "andar": "16º Andar", "label": "Unidade 165 - 64m²", "slug": "vo699"}, {"sap": "VOO00171", "numero": "171", "andar": "17º Andar", "label": "Unidade 171 - 64m²", "slug": "vo699"}, {"sap": "VOO00172", "numero": "172", "andar": "17º Andar", "label": "Unidade 172 - 45m²", "slug": "vo699"}, {"sap": "VOO00173", "numero": "173", "andar": "17º Andar", "label": "Unidade 173 - 45m²", "slug": "vo699"}, {"sap": "VOO00174", "numero": "174", "andar": "17º Andar", "label": "Unidade 174 - 45m²", "slug": "vo699"}, {"sap": "VOO00175", "numero": "175", "andar": "17º Andar", "label": "Unidade 175 - 64m²", "slug": "vo699"}, {"sap": "VOO00181", "numero": "181", "andar": "18º Andar", "label": "Unidade 181 - 64m²", "slug": "vo699"}, {"sap": "VOO00182", "numero": "182", "andar": "18º Andar", "label": "Unidade 182 - 45m²", "slug": "vo699"}, {"sap": "VOO00183", "numero": "183", "andar": "18º Andar", "label": "Unidade 183 - 45m²", "slug": "vo699"}, {"sap": "VOO00184", "numero": "184", "andar": "18º Andar", "label": "Unidade 184 - 45m²", "slug": "vo699"}, {"sap": "VOO00185", "numero": "185", "andar": "18º Andar", "label": "Unidade 185 - 64m²", "slug": "vo699"}, {"sap": "VOO00191", "numero": "191", "andar": "19º Andar", "label": "Unidade 191 - 64m²", "slug": "vo699"}, {"sap": "VOO00192", "numero": "192", "andar": "19º Andar", "label": "Unidade 192 - 45m²", "slug": "vo699"}, {"sap": "VOO00193", "numero": "193", "andar": "19º Andar", "label": "Unidade 193 - 45m²", "slug": "vo699"}, {"sap": "VOO00194", "numero": "194", "andar": "19º Andar", "label": "Unidade 194 - 45m²", "slug": "vo699"}, {"sap": "VOO00195", "numero": "195", "andar": "19º Andar", "label": "Unidade 195 - 64m²", "slug": "vo699"}, {"sap": "VOO00201", "numero": "201", "andar": "20º Andar", "label": "Unidade 201 - 64m²", "slug": "vo699"}, {"sap": "VOO00202", "numero": "202", "andar": "20º Andar", "label": "Unidade 202 - 45m²", "slug": "vo699"}, {"sap": "VOO00203", "numero": "203", "andar": "20º Andar", "label": "Unidade 203 - 45m²", "slug": "vo699"}, {"sap": "VOO00204", "numero": "204", "andar": "20º Andar", "label": "Unidade 204 - 45m²", "slug": "vo699"}, {"sap": "VOO00205", "numero": "205", "andar": "20º Andar", "label": "Unidade 205 - 64m²", "slug": "vo699"}, {"sap": "VOO00211", "numero": "211", "andar": "21º Andar", "label": "Unidade 211 - 64m²", "slug": "vo699"}, {"sap": "VOO00212", "numero": "212", "andar": "21º Andar", "label": "Unidade 212 - 45m²", "slug": "vo699"}, {"sap": "VOO00213", "numero": "213", "andar": "21º Andar", "label": "Unidade 213 - 45m²", "slug": "vo699"}, {"sap": "VOO00214", "numero": "214", "andar": "21º Andar", "label": "Unidade 214 - 45m²", "slug": "vo699"}, {"sap": "VOO00215", "numero": "215", "andar": "21º Andar", "label": "Unidade 215 - 45m²", "slug": "vo699"}, {"sap": "VOO00221", "numero": "221", "andar": "22º Andar", "label": "Unidade 221 - 64m²", "slug": "vo699"}, {"sap": "VOO00222", "numero": "222", "andar": "22º Andar", "label": "Unidade 222 - 45m²", "slug": "vo699"}, {"sap": "VOO00223", "numero": "223", "andar": "22º Andar", "label": "Unidade 223 - 45m²", "slug": "vo699"}, {"sap": "VOO00224", "numero": "224", "andar": "22º Andar", "label": "Unidade 224 - 45m²", "slug": "vo699"}, {"sap": "VOO00225", "numero": "225", "andar": "22º Andar", "label": "Unidade 225 - 64m²", "slug": "vo699"}, {"sap": "VOO00231", "numero": "231", "andar": "23º Andar", "label": "Unidade 231 - 64m²", "slug": "vo699"}, {"sap": "VOO00232", "numero": "232", "andar": "23º Andar", "label": "Unidade 232 - 45m²", "slug": "vo699"}, {"sap": "VOO00233", "numero": "233", "andar": "23º Andar", "label": "Unidade 233 - 64m²", "slug": "vo699"}, {"sap": "VOO00235", "numero": "235", "andar": "23º Andar", "label": "Unidade 235 - 64m²", "slug": "vo699"}, {"sap": "VOO00241", "numero": "241", "andar": "24º Andar", "label": "Unidade 241 - 64m²", "slug": "vo699"}, {"sap": "VOO00242", "numero": "242", "andar": "24º Andar", "label": "Unidade 242 - 45m²", "slug": "vo699"}, {"sap": "VOO00243", "numero": "243", "andar": "24º Andar", "label": "Unidade 243 - 84m²", "slug": "vo699"}, {"sap": "VOO00245", "numero": "245", "andar": "24º Andar", "label": "Unidade 245 - 64m²", "slug": "vo699"}, {"sap": "VOO00251", "numero": "251", "andar": "25º Andar", "label": "Unidade 251 - 64m²", "slug": "vo699"}, {"sap": "VOO00252", "numero": "252", "andar": "25º Andar", "label": "Unidade 252 - 45m²", "slug": "vo699"}, {"sap": "VOO00253", "numero": "253", "andar": "25º Andar", "label": "Unidade 253 - 84m²", "slug": "vo699"}, {"sap": "VOO00255", "numero": "255", "andar": "25º Andar", "label": "Unidade 255 - 64m²", "slug": "vo699"}, {"sap": "VOO00261", "numero": "261", "andar": "26º Andar", "label": "Unidade 261 - 128m²", "slug": "vo699"}, {"sap": "VOO00262", "numero": "262", "andar": "26º Andar", "label": "Unidade 262 - 45m²", "slug": "vo699"}, {"sap": "VOO00263", "numero": "263", "andar": "26º Andar", "label": "Unidade 263 - 64m²", "slug": "vo699"}, {"sap": "VOO00271", "numero": "271", "andar": "27º Andar", "label": "Unidade 271 - 128m²", "slug": "vo699"}, {"sap": "VOO00272", "numero": "272", "andar": "27º Andar", "label": "Unidade 272 - 45m²", "slug": "vo699"}, {"sap": "VOO00273", "numero": "273", "andar": "27º Andar", "label": "Unidade 273 - 64m²", "slug": "vo699"}, {"sap": "VOO00281", "numero": "281", "andar": "28º Andar", "label": "Unidade 281 - 128m²", "slug": "vo699"}, {"sap": "VOO00282", "numero": "282", "andar": "28º Andar", "label": "Unidade 282 - 45m²", "slug": "vo699"}, {"sap": "VOO00283", "numero": "283", "andar": "84º Andar", "label": "Unidade 283 - 84m²", "slug": "vo699"}];
      // Busca mapa slug -> predio_id
      const { rows: predioRows } = await client.query('SELECT id, slug FROM predios');
      const slugMap = {};
      predioRows.forEach(p => slugMap[p.slug] = p.id);
      let inseridas = 0;
      for (const u of UNIDADES) {
        const pid = slugMap[u.slug];
        if (!pid) continue;
        await client.query(
          `INSERT INTO unidades (predio_id, sap, numero, andar, label)
           VALUES ($1,$2,$3,$4,$5) ON CONFLICT (sap) DO NOTHING`,
          [pid, u.sap, u.numero, u.andar, u.label]
        );
        inseridas++;
      }
      console.log(`✅ ${inseridas} unidades inseridas`);
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
