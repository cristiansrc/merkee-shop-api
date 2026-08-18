/**
 * Configuración del job de reconciliación de pagos (MSF-PAY-004).
 *
 * Constantes derivadas de Master Spec §95:
 * - Intervalo: cada 15 minutos.
 * - Ventana mínima: 5 minutos desde creación.
 * - Ventana máxima: 24 horas desde creación.
 * - Lote máximo: 100 pagos por batch.
 * - Reintentos: 3 intentos con backoff 1s / 5s / 15s.
 * - Timeout de consulta al proveedor: 10 segundos.
 */

/** Intervalo de ejecución del job de reconciliación en milisegundos (15 minutos). */
export const RECONCILIATION_INTERVAL_MS = 15 * 60 * 1000;

/** Ventana mínima desde creación del pago para reconciliación (5 minutos). */
export const RECONCILIATION_MIN_AGE_MS = 5 * 60 * 1000;

/** Ventana máxima desde creación del pago para reconciliación (24 horas). */
export const RECONCILIATION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Tamaño máximo de lote de reconciliación. */
export const RECONCILIATION_BATCH_SIZE = 100;

/** Timeout de consulta al proveedor en milisegundos (10 segundos). */
export const RECONCILIATION_PROVIDER_TIMEOUT_MS = 10_000;

/** Número máximo de reintentos ante fallo de batch. */
export const RECONCILIATION_MAX_RETRIES = 3;

/** Backoff de reintentos en milisegundos (1s, 5s, 15s). */
export const RECONCILIATION_RETRY_DELAYS_MS = [1_000, 5_000, 15_000];

/** Prefijo de métricas de reconciliación. */
export const RECONCILIATION_METRICS_PREFIX = 'payment_reconciliation';

/** Nombre del log de reconciliación (sin PII). */
export const RECONCILIATION_LOG_NAME = 'payments.reconciliation_completed';
