import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config'; 
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { IAService } from './features/ai/ai.service';
import { WhatsappModule } from './features/whatsApp/whatsApp.module';
import { PrismaModule } from './shared/modules/prisma.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, 
    }),
    WhatsappModule,
    PrismaModule,
    AuthModule
  ],
  controllers: [AppController],
  providers: [AppService, IAService],
})
export class AppModule {}
