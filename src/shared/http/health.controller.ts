/**
 * Adapter HTTP de entrada para el endpoint de liveness `/health`.
 *
 * Devuelve un JSON mínimo con el estado del proceso. No requiere
 * autenticación, no consulta bases de datos ni expone secretos,
 * versiones sensibles ni PII.
 *
 * La definición se mantiene deliberadamente simple: el controller
 * pertenece a la capa de transporte (adapter) y no tiene dependencias
 * de dominio, aplicación ni infraestructura externa.
 */

import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';

/** Respuesta JSON mínima del endpoint de liveness. */
interface HealthResponse {
  readonly status: 'ok';
  readonly timestamp: string;
}

@Controller()
export class HealthController {
  @Get('health')
  @HttpCode(HttpStatus.OK)
  check(): HealthResponse {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
