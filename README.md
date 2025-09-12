# ⚙️ Backend - Desafio Técnico Fullstack
**Integração WhatsApp & IA**  

Este repositório contém o **Backend** do desafio técnico.  
O projeto foi desenvolvido em **NestJS + TypeScript**, utilizando **Prisma ORM (PostgreSQL)**, **Redis (cache)**, integração com **WhatsApp (Baileys)** e **Gemini (IA)**.

---

## 📌 Funcionalidades (Backend)

- **Integração WhatsApp**
  - Conexão via **QRCode** e **Pairing Code** (Baileys).
  - Registro de sessões no banco (status, QR, pairing code).

- **Persistência de Dados**
  - Armazenamento de **usuários, sessões, conversas e mensagens**.
  - Associação entre mensagens e conversas.
  - Registro de metadados (tipo de mensagem, remetente, timestamps).

- **IA (Gemini)**
  - Geração de respostas inteligentes.
  - Resumo de histórico para otimizar tokens.
  - Cache de respostas frequentes (Redis).

- **Cache (Redis)**
  - Armazenamento temporário de sessões ativas.
  - Reutilização de contexto de conversa sem bater sempre no DB.
  - Minimização de custos de API IA.

- **API REST + WebSockets**
  - Endpoints REST para login, gerenciamento de sessões e mensagens.
  - Canal WebSocket para eventos em tempo real (mensagens recebidas, status da sessão).

---

## 🛠️ Tecnologias Utilizadas

- **[NestJS](https://nestjs.com/)** (estrutura modular e escalável)
- **TypeScript**
- **[Prisma ORM](https://www.prisma.io/)** + **PostgreSQL**
- **[Baileys](https://github.com/WhiskeySockets/Baileys)** (integração WhatsApp)
- **[Gemini API](https://ai.google.dev/)** (IA para respostas)
- **Redis** (cache de contexto e respostas)
- **JWT (Auth)** para autenticação segura
- **Docker** 

---

## 📂 Estrutura de Pastas

```bash
backend/
│── src/
│   ├── 
│   │   ├── auth/             # Login e autenticação JWT
│   │   ├── features/         # CRUD de usuários
│   │   ├── shared/           # Sessões do WhatsApp (Baileys) 
│   ├── common/               # Middlewares, interceptors, guards
│   ├── database/             # Configuração Prisma
│   ├── app.module.ts         # Módulo raiz
│   └── main.ts               # Bootstrap
│── prisma/
│   ├── schema.prisma         # Modelagem do banco
│   └── migrations/           # Migrações Prisma
│── docker-compose.yml        # (Postgres + Redis)
│── .env.example              # Variáveis de ambiente
│── package.json
└── README.md

```bash
## 🗄️ Estrutura do Banco de Dados

- **User**
  - `id` (PK)
  - `email` (único)
  - `name`
  - `password`
  - `createdAt`
  - **Relacionamentos:**
    - 1 → N **WhatsAppSession**

---

- **WhatsAppSession**
  - `id` (PK)
  - `sessionId` (único)
  - `userId` (FK → User.id)
  - `status` (enum: open, connected, disconnected, close, pending, qr)
  - `pairingCode`
  - `qr`
  - `createdAt`
  - `updatedAt`
  - **Relacionamentos:**
    - 1 → N **Conversation**
    - N → 1 **User**

---

- **Conversation**
  - `id` (PK)
  - `sessionId` (FK → WhatsAppSession.sessionId)
  - `contactJid`
  - `contactName`
  - `lastMessageAt`
  - **Relacionamentos:**
    - 1 → N **Message**
    - N → 1 **WhatsAppSession**

---

- **Message**
  - `id` (PK)
  - `conversationId` (FK → Conversation.id)
  - `waId`
  - `fromMe` (boolean)
  - `body` (text)
  - `type` (enum: text, image, video, audio, file, sticker, unknown)
  - `createdAt`
  - **Relacionamentos:**
    - N → 1 **Conversation**

---

### 🔗 Resumo das Relações
- **User** possui várias **WhatsAppSession**  
- **WhatsAppSession** possui várias **Conversation**  
- **Conversation** possui várias **Message**  
