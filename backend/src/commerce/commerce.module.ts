import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AdminController, CommerceController, CustomerController } from './commerce.controller.js';
import { CommerceService } from './commerce.service.js';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [CommerceController, CustomerController, AdminController],
  providers: [CommerceService],
})
export class CommerceModule {}
