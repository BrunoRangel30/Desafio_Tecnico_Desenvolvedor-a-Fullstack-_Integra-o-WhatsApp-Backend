// whatsapp.module.ts
import { Module } from "@nestjs/common";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { WhatsappService } from "./service/whatsapp.service";
import { WhatsappAdapter } from "./adapter/whatsapp.adapter";
import { WhatsappGateway } from "./gateway/whatsapp.gateway";
import { WhatsappController } from "./whatsApp.controller"; 
import { IAService } from "../ai/ai.service"; 

@Module({
  imports: [EventEmitterModule.forRoot()],
  providers: [WhatsappService, WhatsappAdapter, WhatsappGateway, IAService],
  controllers: [WhatsappController], // ⬅️ Registrar o controller
  exports: [WhatsappAdapter],
})
export class WhatsappModule {}
