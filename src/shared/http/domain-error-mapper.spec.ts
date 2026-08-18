import { domainError, DomainErrorCode } from '../domain/domain-error';
import { mapDomainError, resolveMessage } from './domain-error-mapper';

describe('DomainErrorMapper (MSF-API-002)', () => {
  it('mapea INVALID_DOMAIN_INPUT a 400 BadRequest', () => {
    const mapped = mapDomainError(
      domainError(DomainErrorCode.INVALID_DOMAIN_INPUT, 'validation', 'invalid.input'),
    );
    expect(mapped.status).toBe(400);
    expect(mapped.error).toBe('Bad Request');
    expect(mapped.code).toBe('INVALID_DOMAIN_INPUT');
  });

  it('mapea códigos de autenticación a 401', () => {
    for (const code of [
      DomainErrorCode.AUTHENTICATION_REQUIRED,
      DomainErrorCode.INVALID_CREDENTIALS,
      DomainErrorCode.INVALID_WEBHOOK_SIGNATURE,
    ]) {
      const mapped = mapDomainError(domainError(code, 'authentication', 'auth.required'));
      expect(mapped.status).toBe(401);
      expect(mapped.code).toBe(code);
    }
  });

  it('mapea códigos de autorización a 403', () => {
    for (const code of [
      DomainErrorCode.ADMIN_STOREFRONT_PURCHASE_FORBIDDEN,
      DomainErrorCode.INITIAL_PASSWORD_CHANGE_REQUIRED,
      DomainErrorCode.ACTOR_NOT_AUTHORIZED,
    ]) {
      const mapped = mapDomainError(domainError(code, 'authorization', 'auth.actor_not_authorized'));
      expect(mapped.status).toBe(403);
      expect(mapped.code).toBe(code);
    }
  });

  it('mapea RESOURCE_NOT_FOUND y CART_ITEM_NOT_FOUND a 404', () => {
    for (const code of [DomainErrorCode.RESOURCE_NOT_FOUND, DomainErrorCode.CART_ITEM_NOT_FOUND]) {
      const mapped = mapDomainError(domainError(code, 'not_found', 'resource.not_found'));
      expect(mapped.status).toBe(404);
      expect(mapped.code).toBe(code);
    }
  });

  it('mapea códigos de conflicto a 409', () => {
    for (const code of [
      DomainErrorCode.EMAIL_ALREADY_REGISTERED,
      DomainErrorCode.IDEMPOTENCY_KEY_REUSED,
      DomainErrorCode.VERSION_MISMATCH,
      DomainErrorCode.DUPLICATE_WEBHOOK_EVENT,
      DomainErrorCode.ORDER_ALREADY_EXISTS,
      DomainErrorCode.INVALID_STATE_TRANSITION,
    ]) {
      const mapped = mapDomainError(domainError(code, 'conflict', 'state.invalid_transition'));
      expect(mapped.status).toBe(409);
      expect(mapped.code).toBe(code);
    }
  });

  it('mapea SESSION_EXPIRED y CART_RESERVATION_EXPIRED a 410 Gone', () => {
    for (const code of [DomainErrorCode.SESSION_EXPIRED, DomainErrorCode.CART_RESERVATION_EXPIRED]) {
      const mapped = mapDomainError(domainError(code, 'gone', 'session.expired'));
      expect(mapped.status).toBe(410);
      expect(mapped.error).toBe('Gone');
      expect(mapped.code).toBe(code);
    }
  });

  it('mapea códigos de negocio no procesable a 422', () => {
    for (const code of [
      DomainErrorCode.ACTIVATION_TOKEN_INVALID_OR_EXPIRED,
      DomainErrorCode.PASSWORD_RESET_TOKEN_INVALID_OR_EXPIRED,
      DomainErrorCode.CURRENT_PASSWORD_INVALID,
      DomainErrorCode.STOCK_INSUFFICIENT,
      DomainErrorCode.RESERVATION_NOT_ACTIVE,
      DomainErrorCode.CHECKOUT_NOT_ALLOWED,
      DomainErrorCode.PAYMENT_HOLD_NOT_CONSUMABLE,
    ]) {
      const mapped = mapDomainError(domainError(code, 'unprocessable', 'stock.insufficient'));
      expect(mapped.status).toBe(422);
      expect(mapped.code).toBe(code);
    }
  });

  it('mapea TECHNICAL_DEPENDENCY_FAILURE a 500', () => {
    const mapped = mapDomainError(
      domainError(DomainErrorCode.TECHNICAL_DEPENDENCY_FAILURE, 'technical', 'technical.dependency_failure'),
    );
    expect(mapped.status).toBe(500);
    expect(mapped.error).toBe('Internal Server Error');
    expect(mapped.code).toBe('TECHNICAL_DEPENDENCY_FAILURE');
  });

  it('no serializa un código desconocido: lo degrada a 500 TECHNICAL_DEPENDENCY_FAILURE', () => {
    const unknown = {
      code: 'NOT_IN_CATALOG',
      kind: 'technical',
      messageKey: 'unknown.key',
    } as never;
    const mapped = mapDomainError(unknown);
    expect(mapped.status).toBe(500);
    expect(mapped.code).toBe('TECHNICAL_DEPENDENCY_FAILURE');
  });

  it('resuelve el mensaje por messageKey y cae al default por código', () => {
    const byKey = domainError(DomainErrorCode.STOCK_INSUFFICIENT, 'unprocessable', 'stock.insufficient');
    expect(resolveMessage(byKey)).toBe('Stock insuficiente.');
    const byCode = domainError(DomainErrorCode.STOCK_INSUFFICIENT, 'unprocessable', 'no.such.key');
    expect(resolveMessage(byCode)).toBe('Stock insuficiente.');
  });

  it('incluye details seguros desde metadata y descarta entradas no seguras', () => {
    const mapped = mapDomainError(
      domainError(DomainErrorCode.INVALID_DOMAIN_INPUT, 'validation', 'invalid.input', {
        details: [
          { field: 'email', reason: 'Formato inválido.' },
          { field: 'password', reason: 'Debe tener al menos 12 caracteres.' },
          { field: 'secret', reason: 'token', token: 'should-not-leak' },
          'not-an-object',
        ],
      }),
    );
    expect(mapped.details).toEqual([
      { field: 'email', reason: 'Formato inválido.' },
      { field: 'password', reason: 'Debe tener al menos 12 caracteres.' },
    ]);
  });

  it('omite details cuando no hay metadata segura', () => {
    const mapped = mapDomainError(
      domainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'not_found', 'resource.not_found'),
    );
    expect(mapped.details).toBeUndefined();
  });
});
