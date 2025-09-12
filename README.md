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
## 📊 Diagrama ERD (Banco de Dados)

model User {
  id        String            @id @default(uuid())
  email     String            @unique
  name      String?
  password  String?
  createdAt DateTime          @default(now())

  sessions  WhatsAppSession[]
}

model WhatsAppSession {
  id          String           @id @default(uuid())
  sessionId   String           @unique
  user        User?            @relation(fields: [userId], references: [id])
  userId      String?
  status      SessionStatus    @default(open)
  pairingCode String?
  qr          String?
  createdAt   DateTime         @default(now())
  updatedAt   DateTime         @updatedAt

  conversations Conversation[]
}

model Conversation {
  id            String           @id @default(uuid())
  session       WhatsAppSession  @relation(fields: [sessionId], references: [sessionId])
  sessionId     String
  contactJid    String
  contactName   String?
  lastMessageAt DateTime?

  messages Message[]

  @@unique([sessionId, contactJid]) 
}

model Message {
  id             String       @id @default(uuid())
  conversation   Conversation @relation(fields: [conversationId], references: [id])
  conversationId String
  waId           String
  fromMe         Boolean
  body           String       @db.Text
  type           MessageType  @default(text)
  createdAt      DateTime     @default(now())
}
