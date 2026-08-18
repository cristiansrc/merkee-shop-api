/**
 * Módulo HTTP compartido (MSF-API-002).
 *
 * Registra globalmente el filtro de excepciones que normaliza cualquier error
 * a `ApiErrorResponse` OpenAPI. Los controllers futuros reutilizan
 * `result-projector`, `TransportValidationPipe` y `TransportAuthGuard` desde
 * este módulo sin duplicar la proyección.
 */

import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { HttpExceptionFilter } from './http-exception.filter';

@Module({
  providers: [
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
  ],
  exports: [],
})
export class HttpModule {}
