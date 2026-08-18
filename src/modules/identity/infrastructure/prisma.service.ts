import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Servicio Prisma compartido para el módulo `identity`.
 *
 * Envuelve `PrismaClient` y gestiona la conexión al iniciar el módulo.
 * En tareas posteriores se extraerá a `src/shared/infrastructure` para
 * que otros módulos lo reutilicen sin dependencia circular.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }
}
