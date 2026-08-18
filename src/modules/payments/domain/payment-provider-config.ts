/**
 * Configuración de un proveedor de pagos (timeout, retries, endpoints).
 *
 * Secretos y credenciales se obtienen de configuración externa (env/config),
 * nunca se versionan en código.
 */

export interface PaymentProviderConfig {
  /** Nombre del proveedor. */
  readonly name: 'WOMPI' | 'MERCADO_PAGO';
  /** URL base del API del proveedor. */
  readonly baseUrl: string;
  /** Secreto/API key del proveedor (obtenido de env/config externa). */
  readonly secretKey: string;
  /** Timeout de la petición HTTP en milisegundos. */
  readonly timeoutMs: number;
  /** Configuración de reintentos para creación de pago. */
  readonly paymentRetries: RetryConfig;
  /** Configuración de reintentos para refunds. */
  readonly refundRetries: RetryConfig;
}

export interface RetryConfig {
  /** Número máximo de reintentos (excluyendo el intento inicial). */
  readonly maxRetries: number;
  /** Delays en milisegundos entre reintentos. */
  readonly delaysMs: readonly number[];
}

/** Configuración por defecto según Master Spec §95. */
export const DEFAULT_PAYMENT_TIMEOUT_MS = 10_000;

export const DEFAULT_PAYMENT_RETRIES: RetryConfig = {
  maxRetries: 3,
  delaysMs: [500, 2_000, 8_000],
};

export const DEFAULT_REFUND_RETRIES: RetryConfig = {
  maxRetries: 5,
  delaysMs: [60_000, 300_000, 900_000, 3_600_000, 21_600_000],
};
