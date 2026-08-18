import { Injectable } from '@nestjs/common';
import { ClockPort } from '../../domain/ports/clock.port';

/**
 * Adapter de salida de reloj del sistema.
 *
 * Devuelve `new Date()` real. En tests se reemplaza por un stub
 * determinista.
 */
@Injectable()
export class SystemClockAdapter implements ClockPort {
  now(): Date {
    return new Date();
  }
}
