/**
 * Puerto de salida de proveedor de pagos del módulo `payments` (ADR-005).
 *
 * Strategy/Adapter para Wompi y Mercado Pago. El dominio/aplicación solo
 * conocen este contrato; los adapters traducen errores técnicos a
 * `DomainError` en su límite y nunca registran PAN/CVV/fecha.
 *
 * Selector por provider sin if en casos de uso: la aplicación inyecta
 * el puerto y el wiring de NestJS resuelve la estrategia concreta.
 */

export type PaymentProviderName = 'WOMPI' | 'MERCADO_PAGO';

export interface PaymentProviderPort {
  readonly provider: PaymentProviderName;
  /** Crea un intento de pago en el proveedor. */
  createPayment(request: CreatePaymentRequest): Promise<CreatePaymentResult>;
  /** Consulta el estado actual de un pago en el proveedor. */
  queryPaymentStatus(providerPaymentId: string): Promise<QueryPaymentStatusResult>;
  /** Solicita un reembolso en el proveedor. */
  refund(refundRequest: RefundRequest): Promise<RefundResult>;
}

/** Solicitud de creación de pago. */
export interface CreatePaymentRequest {
  readonly orderId: string;
  readonly amountCop: number;
  readonly idempotencyKey: string;
}

/** Resultado de creación de pago. */
export interface CreatePaymentResult {
  readonly providerPaymentId: string;
  readonly status: 'PENDING' | 'APPROVED' | 'DECLINED';
  /**
   * URL pública del proveedor a la que el cliente debe ser redirigido para
   * completar el pago (Wompi: `https://checkout.wompi.co/p/{id}`; Mercado
   * Pago: `init_point`). Es la fuente del `provider_checkout_url` contractual.
   */
  readonly checkoutUrl: string;
}

/** Solicitud de reembolso. */
export interface RefundRequest {
  readonly providerPaymentId: string;
  readonly amountCop: number;
  readonly idempotencyKey: string;
}

/** Resultado de consulta de estado de pago. */
export interface QueryPaymentStatusResult {
  readonly status: 'PENDING' | 'APPROVED' | 'DECLINED' | 'ERROR' | 'EXPIRED';
}

/** Resultado de reembolso. */
export interface RefundResult {
  readonly providerRefundId: string;
  readonly status: 'PENDING' | 'COMPLETED' | 'FAILED';
}
