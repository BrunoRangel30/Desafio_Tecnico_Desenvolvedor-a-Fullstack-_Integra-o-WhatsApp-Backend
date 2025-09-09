import { Injectable, Logger } from "@nestjs/common";
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
      for (const msg of m.messages) {
        if (msg.key.fromMe) continue;
        if (msg.key.remoteJid?.endsWith("@g.us")) continue;

        const textContent = msg.message?.conversation || msg.message?.extendedTextMessage?.text;
        if (!textContent) continue;

        const incomingMessage = {
          id: randomUUID(),
          channel: "whatsapp",
          conversationId: msg.key.remoteJid!,
          from: msg.key.remoteJid!,
          to: "me",
          content: textContent,
          type: "text",
          timestamp: new Date().toISOString(),
          sessionId,
        };
        this.emitEvent("message", sessionId, incomingMessage);

        const response = await this.iaService.getResponse(textContent, []);
        await session.sock.sendMessage(msg.key.remoteJid!, { text: response });

        const aiMessage = {
          id: randomUUID(),
          channel: "whatsapp",
          conversationId: msg.key.remoteJid!,
          from: "me",
          to: msg.key.remoteJid!,
          content: response,
          type: "text",
          timestamp: new Date().toISOString(),
          sessionId,
        };
        this.emitEvent("message", sessionId, aiMessage);
      }
    });

    console.log('registerListeners');

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

    console.log('Sessão iniciada:', sessionId);

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

    //console.log(sessions, 'sessions');

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
     await this.connect(sessionId);

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

  // ========================
  // RESTORE SESSIONS ON START
  // ========================
  /*async restoreSessions() {
    const sessions = await this.prisma.whatsAppSession.findMany({
      where: { status: { not: "disconnected" } },
    });

    for (const dbSession of sessions) {
      const { sessionId } = dbSession;
      if (this.sessions[sessionId]) continue;

      try {
        this.logger.log(`Restaurando sessão ${sessionId}...`);
        await this.connect(sessionId);
        /*await this.prisma.whatsAppSession.update({
          where: { sessionId },
          data: { status: "pending" },
        });
      } catch (err) {
        this.logger.error(`Erro ao restaurar sessão ${sessionId}: ${err.message}`);
      }
    }
  }*/

  async simulateIncomingMessage(sessionId: string, text: string, conversationId?: string) {
    // Gera uma ID consistente se não foi passada
    const messageId = conversationId || randomUUID();

    // Chama a IA para gerar a resposta
    const response = await this.iaService.getResponse(text, []);

    // Mensagem simulada de entrada
    const incomingMessage = {
      id: messageId,
      channel: "bot",
      conversationId: messageId,
      from: "bot",
      to: "me",
      content: text,
      type: "text",
      timestamp: new Date().toISOString(),
      sessionId,
    };
    this.emitEvent("message", sessionId, incomingMessage);

    // Mensagem simulada de resposta da IA
    const aiMessage = {
      id: randomUUID(),
      channel: "bot",
      conversationId: messageId,
      from: "me",
      to: "bot",
      content: response,
      type: "text",
      timestamp: new Date().toISOString(),
      sessionId,
    };
    this.emitEvent("message", sessionId, aiMessage);

    return { incomingMessage, aiMessage };
  }
}
