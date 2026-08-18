/**
 * Puerto de salida de repositorio de pagos del módulo `payments`.
 *
 * Persistencia de pagos, reembolsos, webhooks y outbox (Master Spec §83).
 * Esqueleto: contrato declarado.
 */
export interface PaymentRepositoryPort {
  /** Busca un pago por id. */
  findById(paymentId: string): Promise<PaymentRecord | null>;
}

/** Registro de pago (modelo de dominio). */
export interface PaymentRecord {
  readonly id: string;
  readonly orderId: string;
  readonly amountCop: number;
  readonly status: 'PENDING' | 'APPROVED' | 'DECLINED' | 'REFUNDED';
}
