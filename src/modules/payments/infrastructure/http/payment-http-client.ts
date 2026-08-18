import { PaymentProviderConfig, RetryConfig } from '../../domain/payment-provider-config';
import { paymentErrors } from '../../domain/payment-errors';
import { DomainError } from '../../../../shared/domain/domain-error';
import { Result, ok, fail } from '../../../../shared/domain/result';

/**
 * Error técnico de pago traducido desde errores HTTP/red del proveedor.
 *
 * Vivie en infrastructure y se traduce a `DomainError` en el límite del adapter.
 * Nunca contiene PAN/CVV/fecha ni payload sensible.
 */
export class PaymentProviderHttpError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number | undefined,
    public readonly providerName: string,
    public readonly isRetryable: boolean,
  ) {
    super(message);
    this.name = 'PaymentProviderHttpError';
  }
}

/**
 * Cliente HTTP con retry configurado para proveedores de pago.
 *
 * - Timeout 10s, retries solo red/5xx con backoff 0.5/2/8s (Master Spec §95).
 * - 4xx de negocio NO se reintentan.
 * - Refunds: retries 1m/5m/15m/1h/6h.
 * - Nunca registra PAN/CVV/fecha en logs ni errores.
 */
export async function executeWithRetry<T>(
  config: PaymentProviderConfig,
  operation: 'payment' | 'refund',
  requestFn: () => Promise<T>,
): Promise<Result<T, DomainError>> {
  const retryConfig =
    operation === 'payment' ? config.paymentRetries : config.refundRetries;

  let lastError: PaymentProviderHttpError | undefined;

  for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
    try {
      const result = await requestFn();
      return ok(result);
    } catch (error) {
      const httpError = normalizeError(error, config.name);
      lastError = httpError;

      if (!httpError.isRetryable) {
        return fail(paymentErrors.technicalFailure({
          provider: config.name,
          statusCode: httpError.statusCode,
        }));
      }

      // Si hay más reintentos, esperar el delay correspondiente
      if (attempt < retryConfig.maxRetries) {
        const delayMs = retryConfig.delaysMs[attempt] ?? 0;
        if (delayMs > 0) {
          await sleep(delayMs);
        }
      }
    }
  }

  // Se agotaron los reintentos
  return fail(paymentErrors.technicalFailure({
    provider: config.name,
    statusCode: lastError?.statusCode,
    retriesExhausted: true,
  }));
}

/**
 * Normaliza cualquier error a `PaymentProviderHttpError`.
 *
 * Clasifica como retryable solo errores de red (ECONNRESET, ETIMEDOUT, etc.)
 * y errores de servidor (5xx). Los 4xx de negocio NO son retryables.
 * Nunca incluye PAN/CVV/fecha ni payload sensible en el mensaje.
 */
function normalizeError(error: unknown, providerName: string): PaymentProviderHttpError {
  if (error instanceof PaymentProviderHttpError) {
    return error;
  }

  if (error instanceof Error) {
    const msg = error.message.toLowerCase();

    // Errores de red → retryable
    if (
      msg.includes('econnreset') ||
      msg.includes('etimedout') ||
      msg.includes('econnrefused') ||
      msg.includes('socket hang up') ||
      msg.includes('network') ||
      msg.includes('fetch failed')
    ) {
      return new PaymentProviderHttpError(
        'Network error',
        undefined,
        providerName,
        true,
      );
    }

    // Timeout
    if (msg.includes('timeout') || msg.includes('aborted')) {
      return new PaymentProviderHttpError(
        'Timeout',
        undefined,
        providerName,
        true,
      );
    }
  }

  // Error desconocido → no retryable (seguro por defecto)
  return new PaymentProviderHttpError(
    'Unknown provider error',
    undefined,
    providerName,
    false,
  );
}

/**
 * Evalúa si un status code HTTP es retryable (5xx) o no (4xx).
 * Exportado para uso en adapters con respuestas HTTP parseadas.
 */
export function isRetryableHttpStatus(statusCode: number): boolean {
  return statusCode >= 500 && statusCode < 600;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
