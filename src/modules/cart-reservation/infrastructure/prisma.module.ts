import { Module } from '@nestjs/common';
import { PrismaService } from '../../identity/infrastructure/prisma.service';

/**
 * Módulo compartido de Prisma (servicio de cliente Prisma).
 *
 * Vive en `cart-reservation` por compatibilidad con el wiring previo
 * (MSF-API-001 / MSF-ID-002) y expone `PrismaService` como provider
 * exportable. Otros módulos pueden importar este módulo y obtener el
 * servicio sin acoplamiento a una capa concreta.
 */
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
