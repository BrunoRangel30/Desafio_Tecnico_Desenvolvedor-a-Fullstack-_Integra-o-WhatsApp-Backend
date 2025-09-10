// gateway/whatsapp.gateway.ts
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  OnGatewayInit,
  OnGatewayConnection,
  ConnectedSocket
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { WhatsappAdapter } from "../adapter/whatsapp.adapter";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { SendMessageDto } from "../dtos/send-message.dto";
import { JwtService } from "@nestjs/jwt";


@WebSocketGateway({ cors: "*" })
export class WhatsappGateway implements OnGatewayInit, OnGatewayConnection {
  @WebSocketServer() server: Server;

  constructor(
    private readonly adapter: WhatsappAdapter,
    private readonly eventEmitter: EventEmitter2,
    private readonly jwtService: JwtService,
  ) { }

  // 🔹 Valida o token no handshake e injeta o user no client
  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token;
      if (!token) {
        console.warn("❌ Conexão rejeitada: token não enviado");
        client.disconnect(true);
        return;
      }

      const payload = await this.jwtService.verifyAsync(token, {
        secret: process.env.JWT_SECRET || "secretKey",
      });

      (client as any).user = payload; // ✅ injeta user no socket
      console.log("🔗 Usuário conectado via WS:", payload.sub);
    } catch (err) {
      console.error("❌ Erro ao validar token do WS:", err.message);
      client.disconnect(true);
    }
  }

  afterInit() {
    // Escuta eventos do Service e envia para front
    this.eventEmitter.on("whatsapp.qr", ({ sessionId, payload }) => {
      this.server.emit(`qr_${sessionId}`, payload);
    });

    this.eventEmitter.on("whatsapp.status", ({ sessionId, payload }) => {
      console.log('resposta_satus_servdior', sessionId)
      this.server.emit(`status_${sessionId}`, payload);
    });

    this.eventEmitter.on("whatsapp.message", ({ sessionId, payload }) => {
      console.log("📩 Enviando mensagem para a sessao", sessionId, payload);
      this.server.to(sessionId).emit("message", payload);
    });
  }

  @SubscribeMessage("message")
  async handleSendMessage(@ConnectedSocket() client: Socket, @MessageBody() data: SendMessageDto) {
    const user = (client as any).user;
    if (!user) {
      return { status: "unauthorized" };
    }

    console.log("Mensagem recebida do front:", data, "de", user.sub);
    await this.adapter.sendMessage(data.sessionId, data.text, data.conversationId);
    return { status: "ok" };
  }

  @SubscribeMessage("SYNC_SESSIONS")
  async handleSyncSessions(@ConnectedSocket() client: Socket) {
    const user = (client as any).user; // ✅ user injetado no handleConnection
    if (!user?.sub) {
      client.emit("SESSIONS_UPDATE", []);
      return;
    }

    // 🔹 Busca sessões do usuário logado
    const sessions = await this.adapter.getUserSessions(user.sub);

    // Envia pro front
    client.emit("SESSIONS_UPDATE", sessions);

  }

  @SubscribeMessage("attach_session")
  handleAttachSession(@ConnectedSocket() client: Socket, @MessageBody() data: { sessionId: string }) {
    client.join(data.sessionId);
    //console.log("✅ Cliente entrou na room da sessão:", data.sessionId);
  }
}
