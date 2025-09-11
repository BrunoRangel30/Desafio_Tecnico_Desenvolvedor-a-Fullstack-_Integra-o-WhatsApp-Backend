import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import makeWASocket, { useMultiFileAuthState, DisconnectReason, ConnectionState } from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import { IAService } from "../../ai/ai.service";
import { randomUUID } from "crypto";
import { rm } from "fs/promises";
import { PrismaService } from "../../../shared/services/prisma.service";

type SessionStatus = "pending" | "qr" | "connected" | "disconnected";

interface WhatsAppSessionRuntime {
  sock: ReturnType<typeof makeWASocket>;
  qrCode: string | null;
  status: SessionStatus;
  listenersRegistered: boolean;
}

@Injectable()
export class WhatsappService {
  private sessions: Record<string, WhatsAppSessionRuntime> = {}; // sessionId -> runtime
  private readonly logger = new Logger(WhatsappService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly iaService: IAService,
  ) { }

  // ========================
  // EVENTS
  // ========================
  private emitEvent(type: string, sessionId: string, payload?: any) {
    this.eventEmitter.emit(`whatsapp.${type}`, { sessionId, payload });
  }

  // ========================
  // CONNECTION UPDATE
  // ========================
  private async handleConnectionUpdate(sessionId: string, update: Partial<ConnectionState>) {
    const session = this.sessions[sessionId];
    if (!session) return;

    const { qr, connection, lastDisconnect } = update;
    console.log(connection, 'update');

    if (qr) {
      session.qrCode = qr;
      session.status = "qr";
      await this.prisma.whatsAppSession.update({
        where: { sessionId },
        data: { qr, status: "qr" },
      });
      this.emitEvent("qr", sessionId, qr);
    }

    if (connection === "open") {
      session.qrCode = null;
      session.status = "connected";
      await this.prisma.whatsAppSession.update({
        where: { sessionId },
        data: { qr: null, status: "connected" },
      });
      this.emitEvent("status", sessionId, "connected");
      this.logger.log(`Sessão ${sessionId} conectada`);
    }

    if (connection === "close") {
      const error = lastDisconnect?.error as Boom;
      const statusCode = error?.output?.statusCode;

      if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
        session.qrCode = null;
        session.status = "disconnected";
        await this.prisma.whatsAppSession.update({
          where: { sessionId },
          data: { qr: null, status: "disconnected" },
        });
        this.emitEvent("status", sessionId, "disconnected");
      } else {
        session.status = "pending";
        await this.prisma.whatsAppSession.update({
          where: { sessionId },
          data: { status: "pending" },
        });
        this.emitEvent("status", sessionId, "pending");

        setTimeout(() => this.connect(sessionId), 3000);
      }
    }
  }

  // ========================
  // 3 - LISTENERS
  // ========================
  private registerListeners(sessionId: string, saveCreds: () => Promise<void>) {
    const session = this.sessions[sessionId];
    if (!session || session.listenersRegistered) return;

    session.sock.ev.on("messages.upsert", async (m) => {
      console.log('chaamou a sessao', sessionId)
      for (const msg of m.messages) {
        if (msg.key.fromMe) continue;
        if (msg.key.remoteJid?.endsWith("@g.us")) continue;

        const textContent = msg.message?.conversation || msg.message?.extendedTextMessage?.text;
        if (!textContent) continue;
        // 1️⃣ Buscar ou criar a conversa
        let conversation = await this.prisma.conversation.findFirst({
          where: {
            sessionId,
            contactJid: msg.key.remoteJid!,
          },
        });

        if (!conversation) {
          conversation = await this.prisma.conversation.create({
            data: {
              sessionId,
              contactJid: msg.key.remoteJid!,
              contactName: msg.pushName || null,
              lastMessageAt: new Date(),
            },
          });
        }

        // 2️⃣ Salvar mensagem do usuário
        await this.prisma.message.create({
          data: {
            conversationId: conversation.id,
            waId: msg.key.remoteJid!,
            fromMe: false,
            body: textContent,
            type: "text",
          },
        });

        // Atualiza lastMessageAt
        await this.prisma.conversation.update({
          where: { id: conversation.id },
          data: { lastMessageAt: new Date() },
        });

        // 3️⃣ Obter resposta da IA
        const responseText = await this.iaService.getResponse(textContent, []);

        // 4️⃣ Criar mensagem da IA
        await this.prisma.message.create({
          data: {
            conversationId: conversation.id,
            waId: "me",
            fromMe: true,
            body: responseText,
            type: "text",
          },
        });

        // Atualiza lastMessageAt
        await this.prisma.conversation.update({
          where: { id: conversation.id },
          data: { lastMessageAt: new Date() },
        });

        await session.sock.sendMessage(msg.key.remoteJid!, { text: responseText });

        // 5️⃣ Buscar histórico completo da conversa
        const allMessages = await this.prisma.message.findMany({
          where: { conversationId: conversation.id },
          orderBy: { createdAt: "asc" },
        });

        // 6️⃣ Emitir evento com histórico completo
        this.emitEvent("message", sessionId, {
          id: conversation.id,
          messages: allMessages,
        });
      }
    });

    //console.log('registerListeners');

    session.sock.ev.on("connection.update", (update) => this.handleConnectionUpdate(sessionId, update));
    session.sock.ev.on("creds.update", saveCreds);

    session.listenersRegistered = true;
  }

  // ========================
  // 2 - CONNECT
  // ========================
  async connect(sessionId: string) {
    const { state, saveCreds } = await useMultiFileAuthState(`./sessions/${sessionId}`);
    const sock = makeWASocket({ auth: state, printQRInTerminal: false });

    this.sessions[sessionId] = {
      sock,
      qrCode: null,
      status: "pending",
      listenersRegistered: false,
    };

    this.registerListeners(sessionId, saveCreds);
  }

  // ========================
  // LIST SESSIONS
  // ========================
  async listSessionsByUser(userId: string) {
    // Busca no banco
    const sessions = await this.prisma.whatsAppSession.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });

    // Para cada sessão encontrada, se não estiver ativa em memória, conecta
    for (const s of sessions) {
      if (!this.sessions[s.sessionId] && s.status !== "disconnected") {
        this.logger.log(`Ativando sessão ${s.sessionId} do usuário ${userId}`);
        this.connect(s.sessionId); // não precisa await, pode ser paralelo
      }
    }

    return sessions;
  }

  async createAndConnectSession(userId: string, sessionId: string) {
    const newSession = await this.prisma.whatsAppSession.create({
      data: { sessionId, userId, status: "pending" },
    });

    // Atualiza a lista do usuário
    //await this.connect(sessionId);

    return newSession;
  }

  // ========================
  // GET ACTIVE SESSION
  // ========================
  async getActiveSession(userId: string): Promise<string | null> {
    const session = await this.prisma.whatsAppSession.findFirst({
      where: { userId, status: "connected" },
    });
    return session?.sessionId || null;
  }

  // ========================
  // DISCONNECT
  // ========================
  async disconnect(sessionId: string, clearData = false) {
    const session = this.sessions[sessionId];
    if (session?.sock) session.sock.end(undefined);
    delete this.sessions[sessionId];

    await this.prisma.whatsAppSession.update({
      where: { sessionId },
      data: { status: "disconnected" },
    });

    if (clearData) {
      await this.prisma.whatsAppSession.delete({ where: { sessionId } });
      await rm(`./sessions/${sessionId}`, { recursive: true, force: true });
    }
  }


  async simulateIncomingMessage(
    sessionId: string,
    text: string,
    conversationId: string // conversa já existente
  ) {
    console.log("📩 [simulateIncomingMessage] Nova mensagem recebida", {
      sessionId,
      text,
      conversationId,
    });

    // 1 Criar mensagem do usuário
    const userMessage = await this.prisma.message.create({
      data: {
        conversationId,
        waId: randomUUID(),
        fromMe: false,
        body: text,
        type: "text",
      },
    });


    //  Obter resposta da IA
    const responseText = await this.iaService.getResponse(text, []); // aqui pode passar histórico se quiser

    //  Criar mensagem da IA
    const aiMessage = await this.prisma.message.create({
      data: {
        conversationId,
        waId: randomUUID(),
        fromMe: true,
        body: responseText,
        type: "text",
      },
    });

   // console.log("🤖 [simulateIncomingMessage] Mensagem da IA salva:", aiMessage.id);

    //  Buscar todas as mensagens da conversa (histórico completo)
    const allMessages = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" }, // ordena pela criação da mensagem
    });

    //  Emitir evento com o histórico completo da conversa
    this.eventEmitter.emit("whatsapp.message", {
      sessionId,
      payload: {
        id: conversationId,
        messages: allMessages,
      },
    });

    return { conversationId, userMessage, aiMessage };
  }


  async createConversation(sessionId: string) {
    const conversation = await this.prisma.conversation.create({
      data: {
        sessionId,
        contactJid: `bot-${randomUUID()}`,
        contactName: "Chat IA",
        lastMessageAt: new Date(),
      },
    });

    return {
      ...conversation,
      messages: [], 
    };
  }


  async getConversationsBySession(sessionId: string) {
    const sessionExists = await this.prisma.whatsAppSession.findUnique({
      where: { sessionId },
    });

    if (!sessionExists) {
      throw new NotFoundException(`Sessão ${sessionId} não encontrada`);
    }

    return this.prisma.conversation.findMany({
      where: { sessionId },
      orderBy: { lastMessageAt: "desc" },
      include: {
        messages: { orderBy: { createdAt: "asc" } },
      },
    });
  }
}
