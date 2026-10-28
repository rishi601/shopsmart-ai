import { Module } from '@nestjs/common';
import { ProductsController } from './products.controller.js';
import { ProductsService } from './products.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { RedisCacheService } from '../cache/redis-cache.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [ProductsController],
  providers: [ProductsService, RedisCacheService],
})
export class ProductsModule {}
