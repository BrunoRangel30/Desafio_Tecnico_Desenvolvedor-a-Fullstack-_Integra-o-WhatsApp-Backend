// service/whatsapp.service.ts
import { Injectable, Logger } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import makeWASocket, { useMultiFileAuthState, WAMessage, DisconnectReason } from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import { Server } from "socket.io";
import { IAService } from "../../ai/ai.service";

type SessionStatus = "pending" | "qr" | "connected" | "disconnected";

interface WhatsAppSession {
  sock: ReturnType<typeof makeWASocket>;
  qrCode: string | null;
  status: SessionStatus;
  listenersRegistered: boolean;
}

@Injectable()
export class WhatsappService {
  private sessions: Record<string, WhatsAppSession> = {};
  private readonly logger = new Logger(WhatsappService.name);
  /** Mantém referência da sessão atual */
  public currentSessionId: string | null = null;
  constructor(private readonly eventEmitter: EventEmitter2, private readonly iaService: IAService,) { }

  /** Emite eventos para o frontend via Gateway */
  private emitEvent(type: string, sessionId: string, payload?: any) {
    this.eventEmitter.emit(`whatsapp.${type}`, { sessionId, payload });
  }

  /** Atualiza status local e emite evento */
  private async handleConnectionUpdate(sessionId: string, update: any) {
    const session = this.sessions[sessionId];
    if (!session) return;

    const { qr, connection, lastDisconnect } = update;

    if (qr) {
      session.qrCode = qr;
      session.status = "qr";
      this.emitEvent("qr", sessionId, qr);
    }

    if (connection === "open") {
      session.qrCode = null;
      session.status = "connected";
      this.emitEvent("status", sessionId, "connected");
      this.logger.log(`Sessão ${sessionId} conectada`);
    }

    if (connection === "close") {
      const error = lastDisconnect?.error as Boom;
      const statusCode = error?.output?.statusCode;

      if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
        session.qrCode = null;
        session.status = "disconnected";
        this.emitEvent("status", sessionId, "disconnected");
        this.currentSessionId = 'null';
      } else {
        this.currentSessionId = 'null';
        session.status = "pending";
        this.emitEvent("status", sessionId, "pending");
        // Tenta reconectar
        setTimeout(() => this.connect(sessionId), 3000);
      }
    }
  }

  /** Registra listeners de mensagens, conexão e credenciais */
  private registerListeners(sessionId: string, saveCreds: () => Promise<void>) {
    const session = this.sessions[sessionId];
    if (!session || session.listenersRegistered) return;

    // Mensagens recebidas
    session.sock.ev.on("messages.upsert", async (m) => {
      const msg = m.messages[0] as WAMessage;
      if (!msg.key.fromMe) {
        // Emite para frontend
        this.emitEvent("message", sessionId, msg);

        // Geração de resposta automática via IA
        const textContent =
          msg.message?.conversation ||
          msg.message?.extendedTextMessage?.text;

        if (textContent) {
          const aiReply = await this.generateAIResponse(textContent);
          await session.sock.sendMessage(msg.key.remoteJid!, { text: aiReply });
          this.emitEvent("message", sessionId, {
            originalMessage: msg,
            aiReply,
          });
        }
      }
    });

    // Eventos de conexão
    session.sock.ev.on("connection.update", (update) => this.handleConnectionUpdate(sessionId, update));

    // Atualiza credenciais
    session.sock.ev.on("creds.update", saveCreds);

    session.listenersRegistered = true;
  }

  /** Conecta à sessão do WhatsApp */
  async connect(sessionId: string) {
    const { state, saveCreds } = await useMultiFileAuthState(`./sessions/${sessionId}`);
    const sock = makeWASocket({ auth: state, printQRInTerminal: false });

    this.sessions[sessionId] = {
      sock,
      qrCode: null,
      status: "pending",
      listenersRegistered: false,
    };
    this.currentSessionId = sessionId;
    this.registerListeners(sessionId, saveCreds);
  }

  /** Cria sessão e conecta */
  async createAndConnectSession(sessionId: string) {
    await this.connect(sessionId);
    return this.sessions[sessionId].qrCode;
  }

  /** Envia mensagem via WhatsApp */
  async sendMessage(sessionId: string, jid: string, text: string) {
    const session = this.sessions[sessionId];
    if (!session || !session.sock) throw new Error("Sessão não conectada");
    await session.sock.sendMessage(jid, { text });
  }

  /** Desconecta sessão */
  async disconnect(sessionId: string) {
    const session = this.sessions[sessionId];
    if (session && session.sock) {
      session.sock.end(undefined);
    }
    delete this.sessions[sessionId];
  }



  getSession(): string | null {
    return this.currentSessionId;
  }
  /** Geração de resposta automática via IA (simulação) */
  private async generateAIResponse(message: string): Promise<string> {
    // Aqui você pode integrar com OpenAI/Gemini/etc.
    return `IA respondeu: ${message}`;
  }

  /** Simula mensagem recebida para testes */
  async simulateIncomingMessage(sessionId: string, text: string) {
    
     const response = await this.iaService.getResponse(text, []); 
     console.log("Resposta da IA:", response);
    //if (!session || !session.sock) return;

    const unifiedMessage = {
      id: `FAKE-${Date.now()}`,                // UUID ou timestamp
      channel: "whatsapp",
      from: "bot",                             // indica que é resposta
      to: "me",                                // para o usuário
      content: response,                           // texto da mensagem
      type: "text",
      timestamp: new Date().toISOString(),
      sessionId: sessionId,                    // mantém referência à sessão
    };

    //this.emitEvent("whatsapp.message", sessionId, fakeMessage);
    console.log("Mensagem enviada na sessao", sessionId);
    this.emitEvent("message", sessionId, unifiedMessage);
  }


}
