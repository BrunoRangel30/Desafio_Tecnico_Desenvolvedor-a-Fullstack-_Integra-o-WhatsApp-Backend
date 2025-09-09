// adapter/whatsapp.adapter.ts
import { Injectable } from "@nestjs/common";
import { WhatsappService } from "../service/whatsapp.service";

@Injectable()
export class WhatsappAdapter {
  constructor(private readonly service: WhatsappService) { }

  /*createSession(sessionId: string) {
    return this.service.createAndConnectSession(sessionId);
  }*/

  sendMessage(sessionId: string, text: string, conversationId: string) {
    return this.service.simulateIncomingMessage(sessionId, text, conversationId);
  }


  getUserSessions(userId: any) {
    return this.service.listSessionsByUser(userId);
  }



  disconnect(sessionId: string) {
    return this.service.disconnect(sessionId);
  }
}
