import { Module, Provider } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsWebhookController } from './infrastructure/http/payments-webhook.controller';
import { PAYMENTS_TOKENS } from './payments.tokens';
import { WompiPaymentAdapter } from './infrastructure/adapters/wompi-payment.adapter';
import { MercadoPagoPaymentAdapter } from './infrastructure/adapters/mercado-pago-payment.adapter';
import { WompiWebhookSignatureAdapter } from './infrastructure/adapters/wompi-webhook-signature.adapter';
import { MercadoPagoWebhookSignatureAdapter } from './infrastructure/adapters/mercado-pago-webhook-signature.adapter';
import { PrismaWebhookEventRepositoryAdapter } from './infrastructure/adapters/prisma-webhook-event-repository.adapter';
import { PrismaProcessWebhookUnitOfWorkAdapter } from './infrastructure/adapters/prisma-process-webhook-uow.adapter';
import { ProcessWebhookUseCaseImpl } from './application/use-cases/process-webhook.use-case';
import { PaymentProviderSelector } from './domain/ports/payment-provider-selector';
import { CartPrismaService } from '../cart-reservation/infrastructure/cart-prisma.service';
import {
  PaymentProviderConfig,
  DEFAULT_PAYMENT_TIMEOUT_MS,
  DEFAULT_PAYMENT_RETRIES,
  DEFAULT_REFUND_RETRIES,
} from './domain/payment-provider-config';
import { WebhookSignaturePort } from './domain/ports/webhook-signature.port';
import { ProcessWebhookUnitOfWorkPort } from './domain/ports/process-webhook-unit-of-work.port';
import { ProcessWebhookUseCase } from './domain/ports/process-webhook.port';
// MSF-PAY-004: Reconciliación
import { PrismaPaymentReconciliationAdapter } from './infrastructure/adapters/prisma-payment-reconciliation.adapter';
import { PrometheusPaymentReconciliationMetricsAdapter } from './infrastructure/adapters/prometheus-payment-reconciliation-metrics.adapter';
import { InMemoryPaymentReconciliationMetricsAdapter } from './infrastructure/adapters/in-memory-payment-reconciliation-metrics.adapter';
import { ReconcilePendingPaymentsUseCaseImpl } from './application/use-cases/reconcile-pending-payments.use-case';
import { PaymentReconciliationMetricsPort } from './domain/ports/payment-reconciliation-metrics.port';
import { PaymentReconciliationRepositoryPort } from './domain/ports/payment-reconciliation.port';

// ---------------------------------------------------------------------------
// Configuración de proveedores desde variables de entorno.
// Los secretos NUNCA se versionan en código (ADR-005 / Master Spec §95).
// ---------------------------------------------------------------------------

const wompiConfig: PaymentProviderConfig = {
  name: 'WOMPI',
  baseUrl: process.env.WOMPI_API_URL ?? 'https://api.wompi.co',
  secretKey: process.env.WOMPI_SECRET_KEY ?? '',
  timeoutMs: DEFAULT_PAYMENT_TIMEOUT_MS,
  paymentRetries: DEFAULT_PAYMENT_RETRIES,
  refundRetries: DEFAULT_REFUND_RETRIES,
};

const mercadoPagoConfig: PaymentProviderConfig = {
  name: 'MERCADO_PAGO',
  baseUrl: process.env.MERCADO_PAGO_API_URL ?? 'https://api.mercadopago.com',
  secretKey: process.env.MERCADO_PAGO_ACCESS_TOKEN ?? '',
  timeoutMs: DEFAULT_PAYMENT_TIMEOUT_MS,
  paymentRetries: DEFAULT_PAYMENT_RETRIES,
  refundRetries: DEFAULT_REFUND_RETRIES,
};

// ---------------------------------------------------------------------------
// Providers de adapters de salida (puertos → proveedor HTTP)
// ---------------------------------------------------------------------------

const wompiProvider: Provider = {
  provide: PAYMENTS_TOKENS.PAYMENT_PROVIDER_WOMPI,
  useFactory: (): WompiPaymentAdapter => new WompiPaymentAdapter(wompiConfig),
};

const mercadoPagoProvider: Provider = {
  provide: PAYMENTS_TOKENS.PAYMENT_PROVIDER_MERCADO_PAGO,
  useFactory: (): MercadoPagoPaymentAdapter => new MercadoPagoPaymentAdapter(mercadoPagoConfig),
};

// ---------------------------------------------------------------------------
// Selector de estrategia (Strategy pattern, sin if en use cases)
// ---------------------------------------------------------------------------

const selectorProvider: Provider = {
  provide: PAYMENTS_TOKENS.PAYMENT_PROVIDER_SELECTOR,
  useFactory: (
    wompi: WompiPaymentAdapter,
    mp: MercadoPagoPaymentAdapter,
  ): PaymentProviderSelector => new PaymentProviderSelector(wompi, mp),
  inject: [
    PAYMENTS_TOKENS.PAYMENT_PROVIDER_WOMPI,
    PAYMENTS_TOKENS.PAYMENT_PROVIDER_MERCADO_PAGO,
  ],
};

// ---------------------------------------------------------------------------
// Providers de webhooks (MSF-PAY-003)
// ---------------------------------------------------------------------------

const wompiSignatureProvider: Provider = {
  provide: PAYMENTS_TOKENS.WOMPI_WEBHOOK_SIGNATURE,
  useFactory: (): WompiWebhookSignatureAdapter =>
    new WompiWebhookSignatureAdapter(wompiConfig),
};

const mercadoPagoSignatureProvider: Provider = {
  provide: PAYMENTS_TOKENS.MERCADO_PAGO_WEBHOOK_SIGNATURE,
  useFactory: (): MercadoPagoWebhookSignatureAdapter =>
    new MercadoPagoWebhookSignatureAdapter(mercadoPagoConfig),
};

const webhookEventRepositoryProvider: Provider = {
  provide: PAYMENTS_TOKENS.WEBHOOK_EVENT_REPOSITORY,
  useClass: PrismaWebhookEventRepositoryAdapter,
};

const processWebhookUnitOfWorkProvider: Provider = {
  provide: PAYMENTS_TOKENS.PROCESS_WEBHOOK_UNIT_OF_WORK,
  useClass: PrismaProcessWebhookUnitOfWorkAdapter,
};

// ---------------------------------------------------------------------------
// Providers de reconciliación (MSF-PAY-004)
// ---------------------------------------------------------------------------

const reconciliationRepositoryProvider: Provider = {
  provide: PAYMENTS_TOKENS.PAYMENT_RECONCILIATION_REPOSITORY,
  useClass: PrismaPaymentReconciliationAdapter,
};

/**
 * Adapter de métricas de reconciliación.
 * En producción usa Prometheus; en tests se inyecta InMemory.
 * El adapter Prometheus se registra como default; los tests
 * inyectan InMemory directamente via providers override.
 */
const reconciliationMetricsProvider: Provider = {
  provide: PAYMENTS_TOKENS.PAYMENT_RECONCILIATION_METRICS,
  useClass: PrometheusPaymentReconciliationMetricsAdapter,
};

// ---------------------------------------------------------------------------
// Providers de casos de uso
// ---------------------------------------------------------------------------

const processWebhookUseCaseProvider: Provider = {
  provide: PAYMENTS_TOKENS.PROCESS_WEBHOOK_USE_CASE,
  useFactory: (
    unitOfWork: ProcessWebhookUnitOfWorkPort,
  ): ProcessWebhookUseCase =>
    new ProcessWebhookUseCaseImpl(unitOfWork),
  inject: [PAYMENTS_TOKENS.PROCESS_WEBHOOK_UNIT_OF_WORK],
};

const reconcilePendingPaymentsUseCaseProvider: Provider = {
  provide: PAYMENTS_TOKENS.RECONCILE_PENDING_PAYMENTS_USE_CASE,
  useFactory: (
    repository: PaymentReconciliationRepositoryPort,
    selector: PaymentProviderSelector,
  ): ReconcilePendingPaymentsUseCaseImpl =>
    new ReconcilePendingPaymentsUseCaseImpl(repository, selector),
  inject: [
    PAYMENTS_TOKENS.PAYMENT_RECONCILIATION_REPOSITORY,
    PAYMENTS_TOKENS.PAYMENT_PROVIDER_SELECTOR,
  ],
};

/**
 * Módulo `payments` (Master Spec §91-95 / ADR-005).
 *
 * Strategy/Adapter para Wompi y Mercado Pago; webhooks autoritativos y
 * reembolso compensatorio. Selector por provider sin if en casos de uso.
 *
 * Los secretos se obtienen de variables de entorno (WOMPI_SECRET_KEY,
 * MERCADO_PAGO_ACCESS_TOKEN). Nunca se versionan en código.
 *
 * MSF-PAY-003: webhooks firmados con deduplicación, consumo de hold
 * y compensación automática.
 *
 * MSF-PAY-004: reconciliación programada cada 15 minutos, métricas
 * y driving adapter local.
 */
@Module({
  controllers: [PaymentsController, PaymentsWebhookController],
  providers: [
    CartPrismaService,
    // Configuración
    { provide: PAYMENTS_TOKENS.PAYMENT_CONFIG_WOMPI, useValue: wompiConfig },
    { provide: PAYMENTS_TOKENS.PAYMENT_CONFIG_MERCADO_PAGO, useValue: mercadoPagoConfig },
    // Adapters de salida
    wompiProvider,
    mercadoPagoProvider,
    // Selector de estrategia
    selectorProvider,
    // Webhooks (MSF-PAY-003)
    wompiSignatureProvider,
    mercadoPagoSignatureProvider,
    webhookEventRepositoryProvider,
    processWebhookUnitOfWorkProvider,
    // Reconciliación (MSF-PAY-004)
    reconciliationRepositoryProvider,
    reconciliationMetricsProvider,
    // Casos de uso
    processWebhookUseCaseProvider,
    reconcilePendingPaymentsUseCaseProvider,
  ],
  exports: [
    PAYMENTS_TOKENS.PAYMENT_PROVIDER_SELECTOR,
    PAYMENTS_TOKENS.PAYMENT_PROVIDER_WOMPI,
    PAYMENTS_TOKENS.PAYMENT_PROVIDER_MERCADO_PAGO,
    PAYMENTS_TOKENS.PAYMENT_CONFIG_WOMPI,
    PAYMENTS_TOKENS.PAYMENT_CONFIG_MERCADO_PAGO,
    PAYMENTS_TOKENS.PROCESS_WEBHOOK_USE_CASE,
    PAYMENTS_TOKENS.WOMPI_WEBHOOK_SIGNATURE,
    PAYMENTS_TOKENS.MERCADO_PAGO_WEBHOOK_SIGNATURE,
    // MSF-PAY-004
    PAYMENTS_TOKENS.RECONCILE_PENDING_PAYMENTS_USE_CASE,
    PAYMENTS_TOKENS.PAYMENT_RECONCILIATION_REPOSITORY,
    PAYMENTS_TOKENS.PAYMENT_RECONCILIATION_METRICS,
  ],
})
export class PaymentsModule {}
