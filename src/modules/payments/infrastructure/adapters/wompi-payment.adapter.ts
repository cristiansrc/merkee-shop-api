import {
  PaymentProviderPort,
  PaymentProviderName,
  CreatePaymentRequest,
  CreatePaymentResult,
  QueryPaymentStatusResult,
  RefundRequest,
  RefundResult,
} from '../../domain/ports/payment-provider.port';
import { PaymentProviderConfig } from '../../domain/payment-provider-config';
import {
  executeWithRetry,
  isRetryableHttpStatus,
  PaymentProviderHttpError,
} from '../http/payment-http-client';

/**
 * Adapter de salida para Wompi (infrastructure).
 *
 * Implementa `PaymentProviderPort` y traduce errores técnicos de Wompi
 * a `DomainError` en su límite (Master Spec §ROP / ADR-017).
 *
 * Reglas de seguridad:
 * - Nunca registra PAN/CVV/fecha en logs ni errores.
 * - Secretos se obtienen de configuración externa.
 * - La firma del webhook se valida sobre raw body (MSF-PAY-003).
 *
 * Configuración: timeout 10s, retries 0.5/2/8s solo red/5xx.
 * Refunds: retries 1m/5m/15m/1h/6h.
 */
export class WompiPaymentAdapter implements PaymentProviderPort {
  readonly provider: PaymentProviderName = 'WOMPI';

  constructor(private readonly config: PaymentProviderConfig) {}

  async createPayment(request: CreatePaymentRequest): Promise<CreatePaymentResult> {
    const result = await executeWithRetry(this.config, 'payment', () =>
      this.doCreatePayment(request),
    );

    if (!result.ok) {
      throw new PaymentProviderHttpError(
        `Wompi createPayment failed: ${result.error.code}`,
        undefined,
        this.provider,
        false,
      );
    }

    return result.value;
  }

  async queryPaymentStatus(providerPaymentId: string): Promise<QueryPaymentStatusResult> {
    const result = await executeWithRetry(this.config, 'payment', () =>
      this.doQueryPaymentStatus(providerPaymentId),
    );

    if (!result.ok) {
      throw new PaymentProviderHttpError(
        `Wompi queryPaymentStatus failed: ${result.error.code}`,
        undefined,
        this.provider,
        false,
      );
    }

    return result.value;
  }

  async refund(request: RefundRequest): Promise<RefundResult> {
    const result = await executeWithRetry(this.config, 'refund', () =>
      this.doRefund(request),
    );

    if (!result.ok) {
      throw new PaymentProviderHttpError(
        `Wompi refund failed: ${result.error.code}`,
        undefined,
        this.provider,
        false,
      );
    }

    return result.value;
  }

  /**
   * Implementación HTTP real de Wompi createPayment.
   * Traduce errores HTTP a PaymentProviderHttpError con clasificación retryable.
   */
  private async doCreatePayment(request: CreatePaymentRequest): Promise<CreatePaymentResult> {
    const url = `${this.config.baseUrl}/v1/transactions`;
    const body = JSON.stringify({
      amount_in_cents: request.amountCop * 100, // Wompi usa centavos
      reference: request.idempotencyKey,
      currency: 'COP',
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.secretKey}`,
      },
      body,
      signal: AbortSignal.timeout(this.config.timeoutMs),
    });

    if (!response.ok) {
      const statusCode = response.status;
      throw new PaymentProviderHttpError(
        `Wompi HTTP ${statusCode}`,
        statusCode,
        this.provider,
        isRetryableHttpStatus(statusCode),
      );
    }

    const data = (await response.json()) as WompiTransactionResponse;

    return {
      providerPaymentId: data.data.id,
      status: mapWompiStatus(data.data.status),
    };
  }

  /**
   * Implementación HTTP real de Wompi refund.
   * Traduce errores HTTP a PaymentProviderHttpError con clasificación retryable.
   */
  private async doRefund(request: RefundRequest): Promise<RefundResult> {
    const url = `${this.config.baseUrl}/v1/transactions/${request.providerPaymentId}/refund`;
    const body = JSON.stringify({
      amount_in_cents: request.amountCop * 100,
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.secretKey}`,
      },
      body,
      signal: AbortSignal.timeout(this.config.timeoutMs),
    });

    if (!response.ok) {
      const statusCode = response.status;
      throw new PaymentProviderHttpError(
        `Wompi HTTP ${statusCode}`,
        statusCode,
        this.provider,
        isRetryableHttpStatus(statusCode),
      );
    }

    const data = (await response.json()) as WompiRefundResponse;

    return {
      providerRefundId: data.data.id,
      status: mapWompiRefundStatus(data.data.status),
    };
  }

  /**
   * Implementación HTTP real de Wompi queryPaymentStatus.
   * Consulta el estado actual de una transacción en Wompi.
   */
  private async doQueryPaymentStatus(providerPaymentId: string): Promise<QueryPaymentStatusResult> {
    const url = `${this.config.baseUrl}/v1/transactions/${providerPaymentId}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.config.secretKey}`,
      },
      signal: AbortSignal.timeout(this.config.timeoutMs),
    });

    if (!response.ok) {
      const statusCode = response.status;
      throw new PaymentProviderHttpError(
        `Wompi HTTP ${statusCode}`,
        statusCode,
        this.provider,
        isRetryableHttpStatus(statusCode),
      );
    }

    const data = (await response.json()) as WompiTransactionResponse;

    return { status: mapWompiReconciliationStatus(data.data.status) };
  }
}

// ---------------------------------------------------------------------------
// Tipos de respuesta de Wompi (extraídos del API, sin payload sensible)
// ---------------------------------------------------------------------------

interface WompiTransactionResponse {
  data: {
    id: string;
    status: string;
  };
}

interface WompiRefundResponse {
  data: {
    id: string;
    status: string;
  };
}

function mapWompiStatus(status: string): CreatePaymentResult['status'] {
  switch (status) {
    case 'PENDING':
      return 'PENDING';
    case 'APPROVED':
      return 'APPROVED';
    case 'DECLINED':
      return 'DECLINED';
    default:
      return 'PENDING';
  }
}

function mapWompiReconciliationStatus(status: string): QueryPaymentStatusResult['status'] {
  switch (status) {
    case 'APPROVED':
      return 'APPROVED';
    case 'DECLINED':
      return 'DECLINED';
    case 'VOIDED':
      return 'ERROR';
    case 'ERROR':
      return 'ERROR';
    case 'PENDING':
      return 'PENDING';
    default:
      return 'PENDING';
  }
}

function mapWompiRefundStatus(status: string): RefundResult['status'] {
  switch (status) {
    case 'PENDING':
      return 'PENDING';
    case 'APPROVED':
      return 'COMPLETED';
    case 'DECLINED':
      return 'FAILED';
    default:
      return 'PENDING';
  }
}
