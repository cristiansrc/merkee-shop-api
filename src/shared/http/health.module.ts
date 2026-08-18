/**
 * Módulo de infraestructura HTTP para el endpoint de liveness.
 *
 * Registra `HealthController` como adapter de entrada HTTP sin dependencias
 * de dominio, aplicación o bases de datos.
 */

import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';

@Module({
  controllers: [HealthController],
})
export class HealthModule {}
