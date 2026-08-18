import { domainError, DomainErrorCode } from './domain-error';

describe('Catálogo DomainError', () => {
  it('expone códigos estables del catálogo', () => {
    expect(DomainErrorCode.INVALID_DOMAIN_INPUT).toBe('INVALID_DOMAIN_INPUT');
    expect(DomainErrorCode.TECHNICAL_DEPENDENCY_FAILURE).toBe(
      'TECHNICAL_DEPENDENCY_FAILURE',
    );
    expect(DomainErrorCode.ADMIN_STOREFRONT_PURCHASE_FORBIDDEN).toBe(
      'ADMIN_STOREFRONT_PURCHASE_FORBIDDEN',
    );
  });

  it('construye un DomainError con code, kind y messageKey', () => {
    const error = domainError(
      DomainErrorCode.STOCK_INSUFFICIENT,
      'unprocessable',
      'stock.insufficient',
      { productId: 'p-1' },
    );
    expect(error.code).toBe(DomainErrorCode.STOCK_INSUFFICIENT);
    expect(error.kind).toBe('unprocessable');
    expect(error.messageKey).toBe('stock.insufficient');
    expect(error.metadata).toEqual({ productId: 'p-1' });
  });

  it('no incluye secretos ni PII en metadata por contrato', () => {
    const error = domainError(
      DomainErrorCode.TECHNICAL_DEPENDENCY_FAILURE,
      'technical',
      'technical.dependency_failure',
    );
    expect(error.metadata).toBeUndefined();
  });
});
