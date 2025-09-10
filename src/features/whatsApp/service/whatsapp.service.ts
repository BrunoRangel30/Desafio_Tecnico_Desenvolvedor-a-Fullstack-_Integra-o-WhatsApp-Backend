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
      for (const msg of m.messages) {
        if (msg.key.fromMe) continue;
        if (msg.key.remoteJid?.endsWith("@g.us")) continue;

        const textContent = msg.message?.conversation || msg.message?.extendedTextMessage?.text;
        if (!textContent) continue;


        // 1 - Buscar ou criar a conversa
        /* let conversation = await this.prisma.conversation.findFirst({
           where: {
             sessionId,
             contactJid: msg.key.remoteJid!,
           },
         });;
 
         if (!conversation) {
           conversation = await this.prisma.conversation.create({
             data: {
               sessionId,
               contactJid: msg.key.remoteJid!,
               contactName: msg.pushName || null,
             },
           });
         }
 
         //////////////////////////////////////////
 
         // 2 - Salvar pergunta
         const userMessage = await this.prisma.message.create({
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
         });*/
        ////////////////////////////
        /* const incomingMessage = {
           id: randomUUID(),
           channel: "whatsapp",
           conversationId: msg.key.remoteJid!,
           from: msg.key.remoteJid!,
           to: "me",
           content: textContent,
           type: "text",
           timestamp: new Date().toISOString(),
           sessionId,
         };*/

        //this.emitEvent("message", sessionId, userMessage);

        // const response = await this.iaService.getResponse(textContent, []);
        //await session.sock.sendMessage(msg.key.remoteJid!, { text: response });

        /*const aiMessage = {
          id: randomUUID(),
          channel: "whatsapp",
          conversationId: msg.key.remoteJid!,
          from: "me",
          to: msg.key.remoteJid!,
          content: response,
          type: "text",
          timestamp: new Date().toISOString(),
          sessionId,
        };*/
        // 3 - Salvar resposta
        /*  const aiMessage = await this.prisma.message.create({
            data: {
              conversationId: conversation.id,
              waId: "me", // pode ser um identificador fixo
              fromMe: true,
              body: response,
              type: "text",
            },
          });
  
          await this.prisma.conversation.update({
            where: { id: conversation.id },
            data: { lastMessageAt: new Date() },
          });
          ///////////////
          this.emitEvent("message", sessionId, aiMessage);*/
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




  /*  async simulateIncomingMessage(sessionId: string, text: string, tempConversationId?: string) {
      // 1️⃣ Buscar ou criar conversa (usando upsert)
      const conversation = await this.prisma.conversation.upsert({
        where: tempConversationId
          ? { id: tempConversationId } // conversa temporária já persistida
          : { sessionId_contactJid: { sessionId, contactJid: `bot-${sessionId}` } },
        update: { lastMessageAt: new Date() },
        create: {
          sessionId,
          contactJid: "bot", // fixo para conversa com a IA
          contactName: "IA",
          lastMessageAt: new Date(),
        },
      });
  
      // 2️⃣ Criar mensagem de entrada (pergunta do usuário)
      const userMessage = await this.prisma.message.create({
        data: {
          conversationId: conversation.id,
          waId: conversation.contactJid, // remetente "bot"
          fromMe: false,                 // mensagem do contato
          body: text,
          type: "text",
          //timestamp: new Date(),
        },
      });
  
      // Emitir evento para atualizar frontend
      this.emitEvent("message", sessionId, userMessage);
  
      // 3️⃣ Chamar IA para gerar resposta (simulada aqui)
      const response = await this.iaService.getResponse(text, []);
  
      // 4️⃣ Criar mensagem de resposta da IA
      const aiMessage = await this.prisma.message.create({
        data: {
          conversationId: conversation.id,
          waId: "me",     // remetente fixo da IA
          fromMe: true,   // resposta do sistema
          body: response,
          type: "text",
          //timestamp: new Date(),
        },
      });
  
      // Emitir evento da resposta da IA
      this.emitEvent("message", sessionId, aiMessage);
  
      // Retornar objetos para o frontend atualizar a UI
      return {
        conversationId: conversation.id,
        userMessage,
        aiMessage,
      };
    }*/


  /*async simulateIncomingMessage(sessionId: string, text: string, tempConversationId?: string) {
    console.log("📩 [simulateIncomingMessage] Nova mensagem recebida", {
      sessionId,
      text,
      tempConversationId,
    });
  
    // 1️⃣ Buscar ou criar conversa (usando índice único sessionId+contactJid)
    const conversation = await this.prisma.conversation.upsert({
      where: {
        sessionId_contactJid: {
          sessionId,
          contactJid: `bot-${sessionId}`, // 🔑 sempre o mesmo "usuário IA" para cada sessão
        },
      },
      update: {
        lastMessageAt: new Date(),
      },
      create: {
        sessionId,
        contactJid: `bot-${sessionId}`,
        contactName: "Chat IA",
        lastMessageAt: new Date(),
      },
    });
  
    console.log("✅ [simulateIncomingMessage] Conversa vinculada:", conversation.id);
  
    // 2️⃣ Criar a mensagem do usuário
    const userMessage = await this.prisma.message.create({
      data: {
        conversationId: conversation.id,
        waId: randomUUID(),
        fromMe: false, // usuário
        body: text,
        type: "text",
      },
    });
  
    console.log("💬 [simulateIncomingMessage] Mensagem do usuário salva:", userMessage.id);
    let messages = userMessage
  
    // 🔹 Emitir evento da mensagem do usuário
    /*this.eventEmitter.emit("whatsapp.message", {
      sessionId,
       payload: {
      ...conversation,
      messages,
    },
    });*/


  //  const responseText = await this.iaService.getResponse(text, []); 
  // 👆 aqui você pode passar o histórico ou só o texto atual


  //const aiMessage = await this.prisma.message.create({
  /*  data: {
      conversationId: conversation.id,
      waId: randomUUID(),
      fromMe: true, // IA
      body: responseText,
      type: "text",
    },
  });

  console.log("🤖 [simulateIncomingMessage] Mensagem da IA salva:", aiMessage.id);
  messages = aiMessage
  // 🔹 Emitir evento da resposta da IA
  this.eventEmitter.emit("whatsapp.message", {
    sessionId,
    payload: {
    ...conversation,
    messages,
  },
  });

  // 5️⃣ Retornar ambos
  return { conversation, userMessage, aiMessage };
}*/
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

    // 1️⃣ Criar mensagem do usuário
    const userMessage = await this.prisma.message.create({
      data: {
        conversationId,
        waId: randomUUID(),
        fromMe: false,
        body: text,
        type: "text",
      },
    });

    console.log("💬 [simulateIncomingMessage] Mensagem do usuário salva:", userMessage.id);

    // 2️⃣ Obter resposta da IA
    const responseText = await this.iaService.getResponse(text, []); // aqui pode passar histórico se quiser

    // 3️⃣ Criar mensagem da IA
    const aiMessage = await this.prisma.message.create({
      data: {
        conversationId,
        waId: randomUUID(),
        fromMe: true,
        body: responseText,
        type: "text",
      },
    });

    console.log("🤖 [simulateIncomingMessage] Mensagem da IA salva:", aiMessage.id);

    // 4️⃣ Buscar todas as mensagens da conversa (histórico completo)
    const allMessages = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" }, // ordena pela criação da mensagem
    });

    // 5️⃣ Emitir evento com o histórico completo da conversa
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
        contactJid: `bot-${randomUUID()}`, // 🔑 IA vinculada a essa sessão
        contactName: "Chat IA",
        lastMessageAt: new Date(),
      },
    });

    return {
      ...conversation,
      messages: [], // 👈 frontend sempre espera array
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
