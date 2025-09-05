// src/shared/prisma.module.ts
import { Global, Module } from "@nestjs/common";
import { PrismaService } from "../services/prisma.service";

@Global() // 🔥 deixa disponível em toda a aplicação
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
