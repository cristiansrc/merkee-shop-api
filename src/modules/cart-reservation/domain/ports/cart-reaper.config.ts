/**
 * Configuración del reaper de reservas del módulo `cart-reservation`.
 *
 * Constantes derivadas de Master Spec AC-11 / §93:
 * - Intervalo: cada 1 minuto.
 * - Lote máximo: 500 reservas.
 * - Retención de reserva ACTIVE: 10 minutos.
 * - Timeout de transacción: 5 segundos.
 * - Reintentos: 3 intentos con backoff 1s / 5s / 15s.
 * - Scheduler habilitado por defecto (configurable vía env).
 */

/** Intervalo de ejecución del reaper en milisegundos (1 minuto). */
export const REAPER_INTERVAL_MS = 60_000;

/** Tamaño máximo de lote del reaper. */
export const REAPER_BATCH_SIZE = 500;

/** Duración de reserva ACTIVE en milisegundos (10 minutos). */
export const RESERVATION_ACTIVE_TTL_MS = 10 * 60 * 1000;

/** Timeout de transacción del reaper en milisegundos (5 segundos). */
export const REAPER_TRANSACTION_TIMEOUT_MS = 5_000;

/** Número máximo de reintentos del reaper ante fallo de batch. */
export const REAPER_MAX_RETRIES = 3;

/** Backoff de reintentos en milisegundos (1s, 5s, 15s). */
export const REAPER_RETRY_DELAYS_MS = [1_000, 5_000, 15_000];

/** Nombre del log del reaper (sin PII). */
export const REAPER_LOG_NAME = 'inventory.reservation_released';

/** Prefijo de métricas del reaper. */
export const REAPER_METRICS_PREFIX = 'reservation_reaper';
