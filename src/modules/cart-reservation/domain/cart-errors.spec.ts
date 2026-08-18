import { CartErrors } from './cart-errors';
import { DomainErrorCode } from '../../../shared/domain/domain-error';

describe('CartErrors', () => {
  it('adminStorefrontPurchaseForbidden retorna el código correcto', () => {
    const error = CartErrors.adminStorefrontPurchaseForbidden();
    expect(error.code).toBe(DomainErrorCode.ADMIN_STOREFRONT_PURCHASE_FORBIDDEN);
    expect(error.kind).toBe('authorization');
  });

  it('sessionExpired retorna el código correcto', () => {
    const error = CartErrors.sessionExpired();
    expect(error.code).toBe(DomainErrorCode.SESSION_EXPIRED);
    expect(error.kind).toBe('gone');
  });

  it('cartReservationExpired retorna el código correcto', () => {
    const error = CartErrors.cartReservationExpired();
    expect(error.code).toBe(DomainErrorCode.CART_RESERVATION_EXPIRED);
    expect(error.kind).toBe('gone');
  });

  it('stockInsufficient retorna el código correcto', () => {
    const error = CartErrors.stockInsufficient();
    expect(error.code).toBe(DomainErrorCode.STOCK_INSUFFICIENT);
    expect(error.kind).toBe('unprocessable');
  });

  it('reservationNotActive retorna el código correcto', () => {
    const error = CartErrors.reservationNotActive();
    expect(error.code).toBe(DomainErrorCode.RESERVATION_NOT_ACTIVE);
    expect(error.kind).toBe('unprocessable');
  });

  it('cartItemNotFound retorna el código correcto', () => {
    const error = CartErrors.cartItemNotFound();
    expect(error.code).toBe(DomainErrorCode.CART_ITEM_NOT_FOUND);
    expect(error.kind).toBe('not_found');
  });

  it('resourceNotFound retorna el código correcto', () => {
    const error = CartErrors.resourceNotFound();
    expect(error.code).toBe(DomainErrorCode.RESOURCE_NOT_FOUND);
    expect(error.kind).toBe('not_found');
  });

  it('idempotencyKeyReused retorna el código correcto', () => {
    const error = CartErrors.idempotencyKeyReused();
    expect(error.code).toBe(DomainErrorCode.IDEMPOTENCY_KEY_REUSED);
    expect(error.kind).toBe('conflict');
  });

  it('invalidDomainInput retorna el código correcto con detalles', () => {
    const error = CartErrors.invalidDomainInput('quantity', 'debe ser >= 1');
    expect(error.code).toBe(DomainErrorCode.INVALID_DOMAIN_INPUT);
    expect(error.kind).toBe('validation');
    expect(error.metadata).toEqual({
      details: [{ field: 'quantity', reason: 'debe ser >= 1' }],
    });
  });

  it('authenticationRequired retorna el código correcto', () => {
    const error = CartErrors.authenticationRequired();
    expect(error.code).toBe(DomainErrorCode.AUTHENTICATION_REQUIRED);
    expect(error.kind).toBe('authentication');
  });

  it('initialPasswordChangeRequired retorna el código correcto', () => {
    const error = CartErrors.initialPasswordChangeRequired();
    expect(error.code).toBe(DomainErrorCode.INITIAL_PASSWORD_CHANGE_REQUIRED);
    expect(error.kind).toBe('authorization');
  });

  it('technicalFailure retorna el código correcto', () => {
    const error = CartErrors.technicalFailure();
    expect(error.code).toBe(DomainErrorCode.TECHNICAL_DEPENDENCY_FAILURE);
    expect(error.kind).toBe('technical');
  });
});
