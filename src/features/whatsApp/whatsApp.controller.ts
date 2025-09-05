import { Body, Controller, Post, Get } from "@nestjs/common";
import { WhatsappService } from "./service/whatsapp.service";
//import { SendMessageDto } from "./dtos/send-message.dto";
import { v4 as uuidv4 } from "uuid";
//import { PrismaService } from "../shared/services/prisma.service";
//import QRCode from 'qrcode';

@Controller("whatsapp")
export class WhatsappController {
  constructor(private readonly whatsappService: WhatsappService) { }


  @Post("/sessions/auto")
  async createAutoSession() {
    try {
      const sessionId = uuidv4();
      const qr = await this.whatsappService.createAndConnectSession(sessionId);
      //const qr = "QR_CODE_PLACEHOLDER"; // Substitua por qr real se necessário  
      return { sessionId, qr };
    } catch (err) {
      console.error("Erro ao criar sessão:", err);
      return { error: err };
    }
  }
}
