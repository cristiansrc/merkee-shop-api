import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Servicio Prisma compartido para el módulo `cart-reservation`.
 * Envuelve PrismaClient y gestiona la conexión al iniciar el módulo.
 */
@Injectable()
export class CartPrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }
}
