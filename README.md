# ⬡ Operação Predial

Sistema de helpdesk/tíquetes predial — multitenancy com seleção de prédio por sessão.  
Stack: **Node.js + Express + PostgreSQL** — 100% Railway, zero Supabase.

---

## Estrutura

```
operacao-predial/
├── backend/
│   ├── server.js        ← API + serve o frontend
│   └── package.json
├── frontend/
│   └── index.html       ← SPA completa (vanilla JS)
├── sql/
│   └── schema.sql       ← Tabelas + seed JML
└── README.md
```

---

## Fluxo de acesso

```
Login (email + senha)
        ↓
  1 prédio? → entra direto
  N prédios? → tela de seleção
        ↓
    Opera o prédio
        ↓
   Botão "Trocar prédio" no topbar → volta pra seleção
```

**Roles:**
| Role | Acesso |
|---|---|
| `superadmin` | Todos os prédios, cria novos prédios |
| `admin` | Todos os prédios, gerencia membros |
| `membro` | Só os prédios vinculados em `usuario_predios` |

---

## Deploy no Railway — passo a passo

### 1. GitHub

```bash
git init
git add .
git commit -m "init"
git remote add origin https://github.com/SEU_USUARIO/operacao-predial.git
git push -u origin main
```

### 2. Criar projeto no Railway

1. [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**
2. Seleciona o repositório
3. Railway pergunta o **Root Directory** → coloque `backend`

### 3. Banco PostgreSQL

1. No projeto → **+ New** → **Database** → **PostgreSQL**
2. Railway injeta `DATABASE_URL` automaticamente no serviço Node

### 4. Rodar o schema

1. Clique no serviço PostgreSQL → aba **Query**
2. Cole o conteúdo de `sql/schema.sql` → Execute

### 5. Variáveis de ambiente

No serviço Node.js → **Variables**:

| Variável | Valor |
|---|---|
| `JWT_SECRET` | string longa e aleatória |
| `NODE_ENV` | `production` |

Gerar JWT_SECRET:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### 6. Deploy

Railway faz deploy automático a cada `git push`.

---

## Primeiro acesso

```
URL: https://SEU-PROJETO.up.railway.app
E-mail: admin@operacao.com
Senha:  admin123
```

**Troque a senha imediatamente** — ou delete e crie um novo superadmin pelo painel.

---

## Criar novo prédio

Superadmin acessa o menu **Prédios** no sidebar e clica em **+ Novo prédio**.  
Preenche nome e slug → criado na hora.

## Adicionar membros

Admin acessa **Time** → **+ Adicionar** → preenche nome, e-mail, senha e marca quais prédios o membro pode acessar.

---

## Dev local

```bash
cd backend
npm install

# .env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/operacao
JWT_SECRET=dev-secret
NODE_ENV=development

npm run dev
# http://localhost:3000
```
