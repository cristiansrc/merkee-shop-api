import {
  DomainError,
  domainError,
  DomainErrorCode,
} from '../../../shared/domain/domain-error';

/** Fábricas de DomainError del módulo `cart-reservation` (Master Spec §ROP). */
export const CartErrors = {
  /** Admin no puede tener carrito de compra (AC-03). */
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

  /** Stock insuficiente para la reserva solicitada → 422. */
  stockInsufficient(): DomainError {
    return domainError(
      DomainErrorCode.STOCK_INSUFFICIENT,
      'unprocessable',
      'stock.insufficient',
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

  /**Ítem de carrito no encontrado → 404. */
  cartItemNotFound(): DomainError {
    return domainError(
      DomainErrorCode.CART_ITEM_NOT_FOUND,
      'not_found',
      'cart.item.not.found',
    );
  },

  /** Recurso no encontrado (producto, carrito, sesión) → 404. */
  resourceNotFound(): DomainError {
    return domainError(
      DomainErrorCode.RESOURCE_NOT_FOUND,
      'not_found',
      'resource.not.found',
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

  /** Input de dominio inválido → 400. */
  invalidDomainInput(field: string, reason: string): DomainError {
    return domainError(
      DomainErrorCode.INVALID_DOMAIN_INPUT,
      'validation',
      'invalid.domain.input',
      { details: [{ field, reason }] },
    );
  },

  /** Autenticación requerida → 401. */
  authenticationRequired(): DomainError {
    return domainError(
      DomainErrorCode.AUTHENTICATION_REQUIRED,
      'authentication',
      'authentication.required',
    );
  },

  /** Admin con must_change_password → 403. */
  initialPasswordChangeRequired(): DomainError {
    return domainError(
      DomainErrorCode.INITIAL_PASSWORD_CHANGE_REQUIRED,
      'authorization',
      'initial.password.change.required',
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
