/**
 * Tests de los validadores de headers de transporte (MSF-API-003).
 *
 * Verifican que `Idempotency-Key` exige un UUID y que `If-Match` exige una
 * cadena numérica (`^[0-9]+$`), conforme al contrato OpenAPI.
 */

import {
  validateIdempotencyKey,
  validateIfMatch,
  validateWebhookHeader,
} from './header-validators';

describe('Header validators (MSF-API-003)', () => {
  it('Idempotency-Key: acepta un UUID válido', () => {
    const result = validateIdempotencyKey(
      '00000000-0000-4000-8000-000000000001',
    );
    expect(result.valid).toBe(true);
  });

  it('Idempotency-Key: rechaza un valor no UUID', () => {
    const result = validateIdempotencyKey('no-es-uuid');
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.field === 'Idempotency-Key')).toBe(true);
  });

  it('Idempotency-Key: rechaza un header ausente', () => {
    const result = validateIdempotencyKey(undefined);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.field === 'Idempotency-Key')).toBe(true);
  });

  it('If-Match: acepta una cadena numérica', () => {
    const result = validateIfMatch('3');
    expect(result.valid).toBe(true);
  });

  it('If-Match: rechaza una cadena no numérica', () => {
    const result = validateIfMatch('abc');
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.field === 'If-Match')).toBe(true);
  });

  it('If-Match: rechaza un header ausente', () => {
    const result = validateIfMatch(undefined);
    expect(result.valid).toBe(false);
  });

  it('webhook header: acepta un valor no vacío', () => {
    const result = validateWebhookHeader('X-Event-Signature', 'firma');
    expect(result.valid).toBe(true);
  });

  it('webhook header: rechaza un valor vacío', () => {
    const result = validateWebhookHeader('X-Event-Signature', '');
    expect(result.valid).toBe(false);
  });
});
