import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: 'http://localhost:3000', // frontend
    credentials: true,
  });


  // Habilita validação automática em todos os DTOs
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,        // remove propriedades não definidas no DTO
    forbidNonWhitelisted: true, // lança erro se passar propriedades extras
    transform: true,        // converte os tipos automaticamente
  }));

  await app.listen(3002);
}
bootstrap();
