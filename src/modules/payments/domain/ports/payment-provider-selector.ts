import { PaymentProviderPort, PaymentProviderName } from './payment-provider.port';

/**
 * Strategy selector para proveedores de pagos (ADR-005).
 *
 * Selector por provider sin if en casos de uso: la aplicación inyecta
 * este puerto y el wiring de NestJS resuelve la estrategia concreta.
 *
 * Los adapters Wompi/Mercado Pago se registran como providers y este
 * selector los resuelve por nombre. No contiene lógica de negocio.
 *
 * Este archivo NO importa NestJS, Prisma ni HTTP: es TypeScript puro.
 */
export class PaymentProviderSelector {
  private readonly providers: Map<PaymentProviderName, PaymentProviderPort>;

  constructor(
    ...providers: PaymentProviderPort[]
  ) {
    this.providers = new Map();
    for (const provider of providers) {
      this.providers.set(provider.provider, provider);
    }
  }

  /**
   * Resuelve el adapter de pago para el proveedor indicado.
   *
   * @throws Error si el proveedor no está registrado (error de wiring, no de negocio).
   */
  resolve(providerName: PaymentProviderName): PaymentProviderPort {
    const adapter = this.providers.get(providerName);
    if (!adapter) {
      throw new Error(
        `Payment provider not registered: ${providerName}. ` +
        'Check payments.module.ts providers array.',
      );
    }
    return adapter;
  }
}
