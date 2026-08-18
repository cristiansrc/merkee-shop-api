import { Injectable } from '@nestjs/common';
import {
  PaymentProviderPort,
  PaymentProviderName,
  CreatePaymentRequest,
  CreatePaymentResult,
  QueryPaymentStatusResult,
  RefundRequest,
  RefundResult,
} from '../../domain/ports/payment-provider.port';

/**
 * Adapter de salida de proveedor de pagos (infrastructure).
 *
 * Esqueleto vacío: las estrategias Wompi/Mercado Pago llegan en MSF-PAY-002.
 * Traducirá errores técnicos a `DomainError` en su límite y nunca registrará
 * PAN/CVV/fecha.
 */
@Injectable()
export class PaymentProviderAdapter implements PaymentProviderPort {
  readonly provider: PaymentProviderName = 'WOMPI';

  async createPayment(_request: CreatePaymentRequest): Promise<CreatePaymentResult> {
    throw new Error('PaymentProviderAdapter.createPayment no implementado (MSF-PAY-002)');
  }

  async queryPaymentStatus(_providerPaymentId: string): Promise<QueryPaymentStatusResult> {
    throw new Error('PaymentProviderAdapter.queryPaymentStatus no implementado (MSF-PAY-002)');
  }

  async refund(_refundRequest: RefundRequest): Promise<RefundResult> {
    throw new Error('PaymentProviderAdapter.refund no implementado (MSF-PAY-002)');
  }
}
