/**
 * Puerto de salida de repositorio de checkout.
 *
 * Gestiona la creación atómica de orden + pago pending dentro de una
 * transacción (Master Spec §91-95).
 */
import { Result } from '../../../../shared/domain/result';
import { DomainError } from '../../../../shared/domain/domain-error';

export interface CheckoutRepositoryPort {
  /**
   * Crea orden + pago pending en una única transacción.
   * Si la orden ya existe para el cartId, retorna Failure con ORDER_ALREADY_EXISTS.
   */
  createOrderAndPayment(
    params: CreateOrderParams,
  ): Promise<Result<CreateOrderResult, DomainError>>;

  /**
   * Verifica si ya existe una orden para el carrito dado.
   */
  orderExistsByCartId(cartId: string): Promise<boolean>;
}

/** Parámetros para crear una orden. */
export interface CreateOrderParams {
  readonly cartId: string;
  readonly userId: string;
  readonly itemsSubtotalCop: bigint;
  readonly deliveryFeeCop: bigint;
  readonly ivaCop: bigint;
  readonly taxRateBasisPoints: number;
  readonly totalCop: bigint;
  readonly deliveryRecipientName: string;
  readonly deliveryLine1: string;
  readonly deliveryCity: string;
  readonly deliveryPhone: string;
  readonly items: ReadonlyArray<{
    readonly productId: string;
    readonly productName: string;
    readonly unit: string;
    readonly unitPriceCop: bigint;
    readonly quantity: number;
    readonly subtotalCop: bigint;
  }>;
}

/** Resultado de crear una orden. */
export interface CreateOrderResult {
  readonly orderId: string;
  readonly orderNumber: string;
  readonly paymentId: string;
}
