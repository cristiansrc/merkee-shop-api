import { CheckoutErrors } from './checkout-errors';
import { DomainErrorCode } from '../../../shared/domain/domain-error';

describe('CheckoutErrors', () => {
  it('adminStorefrontPurchaseForbidden returns correct error', () => {
    const error = CheckoutErrors.adminStorefrontPurchaseForbidden();
    expect(error.code).toBe(DomainErrorCode.ADMIN_STOREFRONT_PURCHASE_FORBIDDEN);
    expect(error.kind).toBe('authorization');
  });

  it('sessionExpired returns correct error', () => {
    const error = CheckoutErrors.sessionExpired();
    expect(error.code).toBe(DomainErrorCode.SESSION_EXPIRED);
    expect(error.kind).toBe('gone');
  });

  it('cartReservationExpired returns correct error', () => {
    const error = CheckoutErrors.cartReservationExpired();
    expect(error.code).toBe(DomainErrorCode.CART_RESERVATION_EXPIRED);
    expect(error.kind).toBe('gone');
  });

  it('reservationNotActive returns correct error', () => {
    const error = CheckoutErrors.reservationNotActive();
    expect(error.code).toBe(DomainErrorCode.RESERVATION_NOT_ACTIVE);
    expect(error.kind).toBe('unprocessable');
  });

  it('checkoutNotAllowed returns correct error', () => {
    const error = CheckoutErrors.checkoutNotAllowed();
    expect(error.code).toBe(DomainErrorCode.CHECKOUT_NOT_ALLOWED);
    expect(error.kind).toBe('unprocessable');
  });

  it('orderAlreadyExists returns correct error', () => {
    const error = CheckoutErrors.orderAlreadyExists();
    expect(error.code).toBe(DomainErrorCode.ORDER_ALREADY_EXISTS);
    expect(error.kind).toBe('conflict');
  });

  it('idempotencyKeyReused returns correct error', () => {
    const error = CheckoutErrors.idempotencyKeyReused();
    expect(error.code).toBe(DomainErrorCode.IDEMPOTENCY_KEY_REUSED);
    expect(error.kind).toBe('conflict');
  });

  it('resourceNotFound returns correct error', () => {
    const error = CheckoutErrors.resourceNotFound();
    expect(error.code).toBe(DomainErrorCode.RESOURCE_NOT_FOUND);
    expect(error.kind).toBe('not_found');
  });

  it('technicalFailure returns correct error', () => {
    const error = CheckoutErrors.technicalFailure();
    expect(error.code).toBe(DomainErrorCode.TECHNICAL_DEPENDENCY_FAILURE);
    expect(error.kind).toBe('technical');
  });
});
