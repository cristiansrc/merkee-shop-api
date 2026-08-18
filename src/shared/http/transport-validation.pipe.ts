/**
 * Pipe de validación de transporte (MSF-API-002).
 *
 * Valida únicamente la sintaxis/estructura de request/header/path (400
 * `BadRequest`). La validación semántica de negocio pertenece al dominio y se
 * devuelve por el rail `Failure` de `Result`, no aquí.
 *
 * Es un pipe genérico: recibe una función de validación pura y, si falla,
 * lanza una `BadRequestException` cuyo cuerpo es un `ApiErrorResponse` con
 * código `INVALID_DOMAIN_INPUT` y `details` seguros.
 */

import {
  BadRequestException,
  Injectable,
  PipeTransform,
} from '@nestjs/common';
import { ApiErrorDetail } from './api-error-response';
import { TRANSPORT_CODE_INVALID_INPUT } from './transport-error';

/** Resultado de una validación de transporte. */
export interface TransportValidationResult {
  readonly valid: boolean;
  readonly details?: readonly ApiErrorDetail[];
}

/** Función de validación pura de transporte. */
export type TransportValidator<T> = (value: T) => TransportValidationResult;

@Injectable()
export class TransportValidationPipe<T> implements PipeTransform<T, T> {
  constructor(private readonly validator: TransportValidator<T>) {}

  transform(value: T): T {
    const result = this.validator(value);
    if (result.valid) {
      return value;
    }
    const body = {
      timestamp: new Date().toISOString(),
      status: 400,
      error: 'Bad Request',
      code: TRANSPORT_CODE_INVALID_INPUT,
      message: 'La solicitud contiene datos inválidos.',
      path: '/',
      trace_id: '',
      ...(result.details ? { details: result.details } : {}),
    };
    throw new BadRequestException(body);
  }
}
