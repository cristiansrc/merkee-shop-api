import { Module } from '@nestjs/common';
import { AdminQueryController } from './admin-query.controller';

/**
 * Módulo `admin-query` (ADR-013).
 *
 * Solo lectura cross-cutting de órdenes para administración. Nunca escribe.
 * Esqueleto hexagonal sin reglas de negocio.
 */
@Module({
  controllers: [AdminQueryController],
})
export class AdminQueryModule {}
