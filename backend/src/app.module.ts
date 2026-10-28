import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { ProductsModule } from './products/products.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { AuthModule } from './auth/auth.module.js';
import { CommerceModule } from './commerce/commerce.module.js';

@Module({
  imports: [ProductsModule, PrismaModule, AuthModule, CommerceModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
