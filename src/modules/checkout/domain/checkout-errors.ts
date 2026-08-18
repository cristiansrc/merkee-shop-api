import {
  DomainError,
  domainError,
  DomainErrorCode,
} from '../../../shared/domain/domain-error';

/** Fábricas de DomainError del módulo `checkout` (Master Spec §ROP). */
export const CheckoutErrors = {
  /** Admin no puede realizar checkout (AC-03). */
  adminStorefrontPurchaseForbidden(): DomainError {
    return domainError(
      DomainErrorCode.ADMIN_STOREFRONT_PURCHASE_FORBIDDEN,
      'authorization',
      'admin.storefront.purchase.forbidden',
    );
  },

  /** Sesión expirada o no encontrada → 410 Gone. */
  sessionExpired(): DomainError {
    return domainError(
      DomainErrorCode.SESSION_EXPIRED,
      'gone',
      'session.expired',
    );
  },

  /** Reserva de carrito expirada → 410 Gone. */
  cartReservationExpired(): DomainError {
    return domainError(
      DomainErrorCode.CART_RESERVATION_EXPIRED,
      'gone',
      'cart.reservation.expired',
    );
  },

  /** Reserva no activa (transición inválida) → 422. */
  reservationNotActive(): DomainError {
    return domainError(
      DomainErrorCode.RESERVATION_NOT_ACTIVE,
      'unprocessable',
      'reservation.not.active',
    );
  },

  /** Checkout no permitido (carrito vacío o estado inválido) → 422. */
  checkoutNotAllowed(): DomainError {
    return domainError(
      DomainErrorCode.CHECKOUT_NOT_ALLOWED,
      'unprocessable',
      'checkout.not.allowed',
    );
  },

  /** Orden ya existe para este carrito → 409. */
  orderAlreadyExists(): DomainError {
    return domainError(
      DomainErrorCode.ORDER_ALREADY_EXISTS,
      'conflict',
      'order.already.exists',
    );
  },

  /** Idempotencia divergente → 409. */
  idempotencyKeyReused(): DomainError {
    return domainError(
      DomainErrorCode.IDEMPOTENCY_KEY_REUSED,
      'conflict',
      'idempotency.key.reused',
    );
  },

  /** Recurso no encontrado → 404. */
  resourceNotFound(): DomainError {
    return domainError(
      DomainErrorCode.RESOURCE_NOT_FOUND,
      'not_found',
      'resource.not.found',
    );
  },

  /** Error técnico no clasificable → 500. */
  technicalFailure(): DomainError {
    return domainError(
      DomainErrorCode.TECHNICAL_DEPENDENCY_FAILURE,
      'technical',
      'technical.dependency.failure',
    );
  },
};
