// whatsapp.module.ts
import { Module } from "@nestjs/common";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { WhatsappService } from "./service/whatsapp.service";
import { WhatsappAdapter } from "./adapter/whatsapp.adapter";
import { WhatsappGateway } from "./gateway/whatsapp.gateway";
import { WhatsappController } from "./whatsApp.controller";
import { IAService } from "../ai/ai.service";
import { JwtModule } from "@nestjs/jwt";

@Module({
  imports: [
    EventEmitterModule.forRoot(),
    JwtModule.register({
      secret: process.env.JWT_SECRET || "secretKey", 
      signOptions: { expiresIn: "1d" }, // ⏳ tempo de expiração do token
    }),
  ],
  providers: [
    WhatsappService,
    WhatsappAdapter,
    WhatsappGateway,
    IAService,
  ],
  controllers: [WhatsappController],
  exports: [WhatsappAdapter],
})
export class WhatsappModule {}
