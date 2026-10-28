
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const origins = (process.env.FRONTEND_URL ?? 'http://localhost:3000').split(',').map((origin) => origin.trim());
  app.enableCors({ origin: origins, credentials: true });
  app.enableShutdownHooks();

  const swaggerConfig = new DocumentBuilder()
    .setTitle('ShopSmart AI API')
    .setDescription('Commerce, catalog, customer, admin, and recommendation endpoints.')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document, { swaggerOptions: { persistAuthorization: true } });

  await app.listen(Number(process.env.PORT ?? 3003), '0.0.0.0');
}

bootstrap();
