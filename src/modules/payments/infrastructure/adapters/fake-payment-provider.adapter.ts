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
 * Fake adapter de proveedor de pagos para testing.
 *
 * Permite configurar respuestas, errores y comportamiento sin conectar
 * credenciales reales ni AWS. No contiene lógica de negocio.
 */
export class FakePaymentProviderAdapter implements PaymentProviderPort {
  readonly provider: PaymentProviderName;

  private createPaymentHandler?: (request: CreatePaymentRequest) => Promise<CreatePaymentResult>;
  private queryPaymentStatusHandler?: (providerPaymentId: string) => Promise<QueryPaymentStatusResult>;
  private refundHandler?: (request: RefundRequest) => Promise<RefundResult>;

  /** Contador de llamadas para verificación en tests. */
  public createPaymentCalls: CreatePaymentRequest[] = [];
  public queryPaymentStatusCalls: string[] = [];
  public refundCalls: RefundRequest[] = [];

  constructor(provider: PaymentProviderName = 'WOMPI') {
    this.provider = provider;
  }

  /** Configura el comportamiento de createPayment. */
  onCreatePayment(
    handler: (request: CreatePaymentRequest) => Promise<CreatePaymentResult>,
  ): this {
    this.createPaymentHandler = handler;
    return this;
  }

  /** Configura el comportamiento de queryPaymentStatus. */
  onQueryPaymentStatus(
    handler: (providerPaymentId: string) => Promise<QueryPaymentStatusResult>,
  ): this {
    this.queryPaymentStatusHandler = handler;
    return this;
  }

  /** Configura el comportamiento de refund. */
  onRefund(
    handler: (request: RefundRequest) => Promise<RefundResult>,
  ): this {
    this.refundHandler = handler;
    return this;
  }

  async createPayment(request: CreatePaymentRequest): Promise<CreatePaymentResult> {
    this.createPaymentCalls.push(request);
    if (this.createPaymentHandler) {
      return this.createPaymentHandler(request);
    }
    return {
      providerPaymentId: `fake-${request.idempotencyKey}`,
      status: 'APPROVED',
    };
  }

  async queryPaymentStatus(providerPaymentId: string): Promise<QueryPaymentStatusResult> {
    this.queryPaymentStatusCalls.push(providerPaymentId);
    if (this.queryPaymentStatusHandler) {
      return this.queryPaymentStatusHandler(providerPaymentId);
    }
    return { status: 'PENDING' };
  }

  async refund(request: RefundRequest): Promise<RefundResult> {
    this.refundCalls.push(request);
    if (this.refundHandler) {
      return this.refundHandler(request);
    }
    return {
      providerRefundId: `fake-refund-${request.providerPaymentId}`,
      status: 'COMPLETED',
    };
  }
}
