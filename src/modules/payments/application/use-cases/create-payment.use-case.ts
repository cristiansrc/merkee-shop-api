import { Result } from '../../../../shared/domain/result';
import { DomainError } from '../../../../shared/domain/domain-error';

/**
 * Puerto de entrada (caso de uso) de creación de pago.
 *
 * Esqueleto: contrato declarado; implementación en MSF-PAY-002.
 */
export interface CreatePaymentUseCase {
  execute(command: CreatePaymentCommand): Promise<Result<CreatePaymentResult, DomainError>>;
}

/** Comando de entrada del caso de uso. */
export interface CreatePaymentCommand {
  readonly orderId: string;
  readonly amountCop: number;
  readonly idempotencyKey: string;
}

/** Resultado de éxito de la creación de pago. */
export interface CreatePaymentResult {
  readonly paymentId: string;
  readonly status: 'PENDING' | 'APPROVED' | 'DECLINED';
}
