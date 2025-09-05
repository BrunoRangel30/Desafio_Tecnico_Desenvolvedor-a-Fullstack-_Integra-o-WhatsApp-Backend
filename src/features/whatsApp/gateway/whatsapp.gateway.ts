// gateway/whatsapp.gateway.ts
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  OnGatewayInit,
  ConnectedSocket
} from "@nestjs/websockets";
import { Server } from "socket.io";
import { WhatsappAdapter } from "../adapter/whatsapp.adapter";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { SendMessageDto } from "../dtos/send-message.dto";
import { Socket } from "socket.io"; // ✅ IMPORTAR O TIPO CORRETO

@WebSocketGateway({ cors: "*" })
export class WhatsappGateway implements OnGatewayInit {
  @WebSocketServer() server: Server;

  constructor(
    private readonly adapter: WhatsappAdapter,
    private readonly eventEmitter: EventEmitter2,
  ) { }

  afterInit() {
    // Escuta eventos do Service e envia para front
    this.eventEmitter.on("whatsapp.qr", ({ sessionId, payload }) => {
      this.server.emit(`qr_${sessionId}`, payload);
    });
    this.eventEmitter.on("whatsapp.status", ({ sessionId, payload }) => {
      this.server.emit(`status_${sessionId}`, payload);
    });
    this.eventEmitter.on("whatsapp.message", ({ sessionId, payload }) => {
      console.log("Enviando mensagem para a sessao", sessionId, payload);
      this.server.to(sessionId).emit("message", payload);
    });
  }

  /*@SubscribeMessage("create_session")
  async handleCreateSession(@MessageBody() data: { sessionId: string }) {
    const qr = await this.adapter.createSession(data.sessionId);
    return { status: "ok", qr };
  }*/

  @SubscribeMessage("message")
  async handleSendMessage(@MessageBody() data: SendMessageDto) {
    console.log("Mensagem recebida do front:", data);
    await this.adapter.sendMessage(data.sessionId, data.text);
    return { status: "ok" };
  }

  /** Checa a sessão atual */
  @SubscribeMessage("CHECK_SESSION")
  async handleCheckSession(@ConnectedSocket() client: Socket) {
    const sessionId = this.adapter.getSessionStatus();

    if (!sessionId) {
      client.emit("SESSION_SYNC", sessionId);
      return { status: "no_session" };
    }

    client.emit("SESSION_SYNC", sessionId );
    return sessionId;
  }

   // Cliente entra na "room" da sessão
  @SubscribeMessage("attach_session")
  handleAttachSession(@ConnectedSocket() client: Socket, @MessageBody() data: { sessionId: string }) {
    client.join(data.sessionId);
    console.log("Cliente entrou na room da sessão:", data.sessionId);
  }
}
