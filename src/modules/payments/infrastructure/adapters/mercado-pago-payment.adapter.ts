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
 * Adapter de salida para Mercado Pago (infrastructure).
 *
 * Implementa `PaymentProviderPort` y traduce errores técnicos de Mercado Pago
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
export class MercadoPagoPaymentAdapter implements PaymentProviderPort {
  readonly provider: PaymentProviderName = 'MERCADO_PAGO';

  constructor(private readonly config: PaymentProviderConfig) {}

  async createPayment(request: CreatePaymentRequest): Promise<CreatePaymentResult> {
    const result = await executeWithRetry(this.config, 'payment', () =>
      this.doCreatePayment(request),
    );

    if (!result.ok) {
      throw new PaymentProviderHttpError(
        `MercadoPago createPayment failed: ${result.error.code}`,
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
        `MercadoPago queryPaymentStatus failed: ${result.error.code}`,
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
        `MercadoPago refund failed: ${result.error.code}`,
        undefined,
        this.provider,
        false,
      );
    }

    return result.value;
  }

  /**
   * Implementación HTTP real de Mercado Pago createPayment.
   * Traduce errores HTTP a PaymentProviderHttpError con clasificación retryable.
   */
  private async doCreatePayment(request: CreatePaymentRequest): Promise<CreatePaymentResult> {
    const url = `${this.config.baseUrl}/v1/payments`;
    const body = JSON.stringify({
      transaction_amount: request.amountCop,
      external_reference: request.idempotencyKey,
      currency_id: 'COP',
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
        `MercadoPago HTTP ${statusCode}`,
        statusCode,
        this.provider,
        isRetryableHttpStatus(statusCode),
      );
    }

    const data = (await response.json()) as MercadoPagoPaymentResponse;

    return {
      providerPaymentId: String(data.id),
      status: mapMPStatus(data.status),
      checkoutUrl: data.init_point ?? '',
    };
  }

  /**
   * Implementación HTTP real de Mercado Pago refund.
   * Traduce errores HTTP a PaymentProviderHttpError con clasificación retryable.
   */
  private async doRefund(request: RefundRequest): Promise<RefundResult> {
    const url = `${this.config.baseUrl}/v1/payments/${request.providerPaymentId}/refunds`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.secretKey}`,
      },
      signal: AbortSignal.timeout(this.config.timeoutMs),
    });

    if (!response.ok) {
      const statusCode = response.status;
      throw new PaymentProviderHttpError(
        `MercadoPago HTTP ${statusCode}`,
        statusCode,
        this.provider,
        isRetryableHttpStatus(statusCode),
      );
    }

    const data = (await response.json()) as MercadoPagoRefundResponse;

    return {
      providerRefundId: String(data.id),
      status: mapMPRefundStatus(data.status),
    };
  }

  /**
   * Implementación HTTP real de Mercado Pago queryPaymentStatus.
   * Consulta el estado actual de un pago en Mercado Pago.
   */
  private async doQueryPaymentStatus(providerPaymentId: string): Promise<QueryPaymentStatusResult> {
    const url = `${this.config.baseUrl}/v1/payments/${providerPaymentId}`;

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
        `MercadoPago HTTP ${statusCode}`,
        statusCode,
        this.provider,
        isRetryableHttpStatus(statusCode),
      );
    }

    const data = (await response.json()) as MercadoPagoPaymentResponse;

    return { status: mapMPReconciliationStatus(data.status) };
  }
}

// ---------------------------------------------------------------------------
// Tipos de respuesta de Mercado Pago (extraídos del API, sin payload sensible)
// ---------------------------------------------------------------------------

interface MercadoPagoPaymentResponse {
  id: number;
  status: string;
  /** URL de redirección de checkout que Mercado Pago devuelve en el pago. */
  init_point?: string;
}

interface MercadoPagoRefundResponse {
  id: number;
  status: string;
}

function mapMPStatus(status: string): CreatePaymentResult['status'] {
  switch (status) {
    case 'pending':
      return 'PENDING';
    case 'approved':
      return 'APPROVED';
    case 'rejected':
      return 'DECLINED';
    default:
      return 'PENDING';
  }
}

function mapMPReconciliationStatus(status: string): QueryPaymentStatusResult['status'] {
  switch (status) {
    case 'approved':
      return 'APPROVED';
    case 'rejected':
      return 'DECLINED';
    case 'cancelled':
      return 'EXPIRED';
    case 'in_process':
      return 'PENDING';
    case 'pending':
      return 'PENDING';
    default:
      return 'PENDING';
  }
}

function mapMPRefundStatus(status: string): RefundResult['status'] {
  switch (status) {
    case 'pending':
      return 'PENDING';
    case 'approved':
      return 'COMPLETED';
    case 'rejected':
      return 'FAILED';
    default:
      return 'PENDING';
  }
}
