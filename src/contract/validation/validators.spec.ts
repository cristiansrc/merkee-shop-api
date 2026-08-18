/**
 * Tests unitarios de helpers de validación sintáctica (MSF-API-003).
 *
 * Verifica cada condición límite, invalid y nullable de los validadores.
 */

import {
  createContext,
  toResult,
  isRecord,
  checkRecord,
  checkRequired,
  checkString,
  checkNullableString,
  checkInteger,
  checkBoolean,
  checkEnum,
  checkUuid,
  checkEmail,
  checkDateTime,
  checkUri,
  checkArray,
  ValidationContext,
} from './validators';

describe('validators.ts (MSF-API-003)', () => {
  let ctx: ValidationContext;

  beforeEach(() => {
    ctx = createContext();
  });

  describe('createContext', () => {
    it('crea contexto vacío', () => {
      expect(ctx.issues).toEqual([]);
    });
  });

  describe('toResult', () => {
    it('retorna valid cuando no hay issues', () => {
      const result = toResult(ctx);
      expect(result.valid).toBe(true);
      expect(result.issues).toEqual([]);
    });

    it('retorna invalid cuando hay issues', () => {
      ctx.issues.push({ field: 'test', reason: 'error' });
      const result = toResult(ctx);
      expect(result.valid).toBe(false);
      expect(result.issues).toHaveLength(1);
    });
  });

  describe('isRecord', () => {
    it('retorna true para objetos planos', () => {
      expect(isRecord({})).toBe(true);
      expect(isRecord({ a: 1 })).toBe(true);
    });

    it('retorna false para null', () => {
      expect(isRecord(null)).toBe(false);
    });

    it('retorna false para undefined', () => {
      expect(isRecord(undefined)).toBe(false);
    });

    it('retorna false para arrays', () => {
      expect(isRecord([])).toBe(false);
      expect(isRecord([1, 2, 3])).toBe(false);
    });

    it('retorna false para primitivos', () => {
      expect(isRecord('string')).toBe(false);
      expect(isRecord(123)).toBe(false);
      expect(isRecord(true)).toBe(false);
    });
  });

  describe('checkRecord', () => {
    it('retorna true para objetos planos', () => {
      expect(checkRecord(ctx, 'field', {})).toBe(true);
      expect(checkRecord(ctx, 'field', { a: 1 })).toBe(true);
      expect(ctx.issues).toHaveLength(0);
    });

    it('agrega issue para null', () => {
      expect(checkRecord(ctx, 'field', null)).toBe(false);
      expect(ctx.issues).toHaveLength(1);
      expect(ctx.issues[0].field).toBe('field');
      expect(ctx.issues[0].reason).toBe('Debe ser un objeto.');
    });

    it('agrega issue para arrays', () => {
      expect(checkRecord(ctx, 'field', [1, 2])).toBe(false);
      expect(ctx.issues).toHaveLength(1);
    });

    it('agrega issue para primitivos', () => {
      expect(checkRecord(ctx, 'field', 'string')).toBe(false);
      expect(ctx.issues).toHaveLength(1);
    });
  });

  describe('checkRequired', () => {
    it('no agrega issue cuando el valor está presente', () => {
      checkRequired(ctx, 'field', 'value');
      expect(ctx.issues).toHaveLength(0);
    });

    it('no agrega issue cuando el valor es 0', () => {
      checkRequired(ctx, 'field', 0);
      expect(ctx.issues).toHaveLength(0);
    });

    it('no agrega issue cuando el valor es false', () => {
      checkRequired(ctx, 'field', false);
      expect(ctx.issues).toHaveLength(0);
    });

    it('agrega issue cuando el valor es undefined', () => {
      checkRequired(ctx, 'field', undefined);
      expect(ctx.issues).toHaveLength(1);
      expect(ctx.issues[0].reason).toBe('Campo requerido.');
    });

    it('no agrega issue cuando el valor es null (nullable)', () => {
      checkRequired(ctx, 'field', null);
      expect(ctx.issues).toHaveLength(0);
    });
  });

  describe('checkString', () => {
    it('retorna true para strings válidos', () => {
      expect(checkString(ctx, 'field', 'hello')).toBe(true);
      expect(ctx.issues).toHaveLength(0);
    });

    it('agrega issue para no strings', () => {
      expect(checkString(ctx, 'field', 123)).toBe(false);
      expect(ctx.issues).toHaveLength(1);
      expect(ctx.issues[0].reason).toBe('Debe ser una cadena.');
    });

    it('respeta minLength', () => {
      checkString(ctx, 'field', 'ab', { minLength: 3 });
      expect(ctx.issues).toHaveLength(1);
      expect(ctx.issues[0].reason).toBe('Longitud mínima 3.');
    });

    it('no agrega issue cuando cumple minLength', () => {
      checkString(ctx, 'field', 'abc', { minLength: 3 });
      expect(ctx.issues).toHaveLength(0);
    });

    it('respeta maxLength', () => {
      checkString(ctx, 'field', 'abcdef', { maxLength: 3 });
      expect(ctx.issues).toHaveLength(1);
      expect(ctx.issues[0].reason).toBe('Longitud máxima 3.');
    });

    it('no agrega issue cuando cumple maxLength', () => {
      checkString(ctx, 'field', 'abc', { maxLength: 3 });
      expect(ctx.issues).toHaveLength(0);
    });

    it('respeta pattern', () => {
      checkString(ctx, 'field', 'invalid', { pattern: /^\d+$/ });
      expect(ctx.issues).toHaveLength(1);
      expect(ctx.issues[0].reason).toBe('Formato inválido.');
    });

    it('no agrega issue cuando cumple pattern', () => {
      checkString(ctx, 'field', '12345', { pattern: /^\d+$/ });
      expect(ctx.issues).toHaveLength(0);
    });

    it('valida minLength y maxLength juntos', () => {
      checkString(ctx, 'field', 'ab', { minLength: 3, maxLength: 5 });
      expect(ctx.issues).toHaveLength(1);
      expect(ctx.issues[0].reason).toBe('Longitud mínima 3.');
    });

    it('valida string que excede ambos límites', () => {
      checkString(ctx, 'field', 'a', { minLength: 3, maxLength: 2 });
      expect(ctx.issues).toHaveLength(1);
      expect(ctx.issues[0].reason).toBe('Longitud mínima 3.');
    });
  });

  describe('checkNullableString', () => {
    it('acepta null sin agregar issues', () => {
      checkNullableString(ctx, 'field', null);
      expect(ctx.issues).toHaveLength(0);
    });

    it('valida string no nullable', () => {
      checkNullableString(ctx, 'field', 'hello');
      expect(ctx.issues).toHaveLength(0);
    });

    it('agrega issue para number', () => {
      checkNullableString(ctx, 'field', 123);
      expect(ctx.issues).toHaveLength(1);
    });

    it('respeta maxLength en nullable', () => {
      checkNullableString(ctx, 'field', 'abcdef', { maxLength: 3 });
      expect(ctx.issues).toHaveLength(1);
    });
  });

  describe('checkInteger', () => {
    it('retorna true para enteros válidos', () => {
      expect(checkInteger(ctx, 'field', 42)).toBe(true);
      expect(ctx.issues).toHaveLength(0);
    });

    it('agrega issue para floats', () => {
      expect(checkInteger(ctx, 'field', 3.14)).toBe(false);
      expect(ctx.issues).toHaveLength(1);
      expect(ctx.issues[0].reason).toBe('Debe ser un entero.');
    });

    it('agrega issue para strings', () => {
      expect(checkInteger(ctx, 'field', '42')).toBe(false);
      expect(ctx.issues).toHaveLength(1);
    });

    it('respeta minimum', () => {
      checkInteger(ctx, 'field', 5, { minimum: 10 });
      expect(ctx.issues).toHaveLength(1);
      expect(ctx.issues[0].reason).toBe('Mínimo 10.');
    });

    it('no agrega issue cuando cumple minimum', () => {
      checkInteger(ctx, 'field', 10, { minimum: 10 });
      expect(ctx.issues).toHaveLength(0);
    });

    it('respeta maximum', () => {
      checkInteger(ctx, 'field', 15, { maximum: 10 });
      expect(ctx.issues).toHaveLength(1);
      expect(ctx.issues[0].reason).toBe('Máximo 10.');
    });

    it('no agrega issue cuando cumple maximum', () => {
      checkInteger(ctx, 'field', 10, { maximum: 10 });
      expect(ctx.issues).toHaveLength(0);
    });

    it('valida minimum y maximum juntos', () => {
      checkInteger(ctx, 'field', 5, { minimum: 10, maximum: 20 });
      expect(ctx.issues).toHaveLength(1);
      expect(ctx.issues[0].reason).toBe('Mínimo 10.');
    });
  });

  describe('checkBoolean', () => {
    it('retorna true para booleans', () => {
      expect(checkBoolean(ctx, 'field', true)).toBe(true);
      expect(checkBoolean(ctx, 'field', false)).toBe(true);
      expect(ctx.issues).toHaveLength(0);
    });

    it('agrega issue para strings', () => {
      expect(checkBoolean(ctx, 'field', 'true')).toBe(false);
      expect(ctx.issues).toHaveLength(1);
      expect(ctx.issues[0].reason).toBe('Debe ser un booleano.');
    });

    it('agrega issue para numbers', () => {
      expect(checkBoolean(ctx, 'field', 1)).toBe(false);
      expect(ctx.issues).toHaveLength(1);
    });
  });

  describe('checkEnum', () => {
    const allowed = ['A', 'B', 'C'] as const;

    it('retorna true para valores permitidos', () => {
      expect(checkEnum(ctx, 'field', 'A', allowed)).toBe(true);
      expect(checkEnum(ctx, 'field', 'B', allowed)).toBe(true);
      expect(checkEnum(ctx, 'field', 'C', allowed)).toBe(true);
      expect(ctx.issues).toHaveLength(0);
    });

    it('agrega issue para valores no permitidos', () => {
      expect(checkEnum(ctx, 'field', 'D', allowed)).toBe(false);
      expect(ctx.issues).toHaveLength(1);
      expect(ctx.issues[0].reason).toBe('Valor no permitido.');
    });

    it('agrega issue para strings vacíos', () => {
      expect(checkEnum(ctx, 'field', '', allowed)).toBe(false);
      expect(ctx.issues).toHaveLength(1);
    });

    it('agrega issue para numbers', () => {
      expect(checkEnum(ctx, 'field', 1, allowed)).toBe(false);
      expect(ctx.issues).toHaveLength(1);
    });
  });

  describe('checkUuid', () => {
    it('acepta UUIDs válidos', () => {
      expect(checkUuid(ctx, 'field', '550e8400-e29b-41d4-a716-446655440000')).toBe(true);
      expect(checkUuid(ctx, 'field', '00000000-0000-4000-8000-000000000001')).toBe(true);
      expect(ctx.issues).toHaveLength(0);
    });

    it('rechaza UUIDs inválidos', () => {
      checkUuid(ctx, 'field', 'not-a-uuid');
      expect(ctx.issues).toHaveLength(1);
      expect(ctx.issues[0].reason).toBe('Formato inválido.');
    });

    it('rechaza UUIDs cortos', () => {
      ctx = createContext();
      checkUuid(ctx, 'field', '550e8400-e29b-41d4-a716');
      expect(ctx.issues).toHaveLength(1);
      expect(ctx.issues[0].reason).toBe('Formato inválido.');
    });

    it('rechaza strings vacíos como UUID', () => {
      ctx = createContext();
      checkUuid(ctx, 'field', '');
      expect(ctx.issues).toHaveLength(1);
    });
  });

  describe('checkEmail', () => {
    it('acepta emails válidos', () => {
      expect(checkEmail(ctx, 'field', 'user@example.com')).toBe(true);
      expect(checkEmail(ctx, 'field', 'test.user@domain.co')).toBe(true);
      expect(ctx.issues).toHaveLength(0);
    });

    it('rechaza emails inválidos', () => {
      checkEmail(ctx, 'field', 'not-an-email');
      expect(ctx.issues).toHaveLength(1);
      expect(ctx.issues[0].reason).toBe('Formato inválido.');
    });

    it('rechaza emails sin dominio', () => {
      ctx = createContext();
      checkEmail(ctx, 'field', '@domain.com');
      expect(ctx.issues).toHaveLength(1);
    });

    it('rechaza emails sin usuario', () => {
      ctx = createContext();
      checkEmail(ctx, 'field', 'user@');
      expect(ctx.issues).toHaveLength(1);
    });

    it('respeta maxLength', () => {
      ctx = createContext();
      const longEmail = 'a'.repeat(100) + '@example.com';
      checkEmail(ctx, 'field', longEmail, { maxLength: 50 });
      expect(ctx.issues).toHaveLength(1);
    });
  });

  describe('checkDateTime', () => {
    it('acepta fechas ISO 8601 válidas', () => {
      expect(checkDateTime(ctx, 'field', '2024-01-15T10:30:00Z')).toBe(true);
      expect(checkDateTime(ctx, 'field', '2024-01-15T10:30:00.000Z')).toBe(true);
      expect(ctx.issues).toHaveLength(0);
    });

    it('rechaza fechas inválidas', () => {
      expect(checkDateTime(ctx, 'field', 'not-a-date')).toBe(false);
      expect(ctx.issues).toHaveLength(1);
      expect(ctx.issues[0].reason).toBe('Fecha-hora inválida.');
    });

    it('rechaza numbers', () => {
      ctx = createContext();
      expect(checkDateTime(ctx, 'field', 1234567890)).toBe(false);
      expect(ctx.issues).toHaveLength(1);
    });
  });

  describe('checkUri', () => {
    it('acepta URIs válidas', () => {
      expect(checkUri(ctx, 'field', 'https://example.com')).toBe(true);
      expect(checkUri(ctx, 'field', 'http://localhost:3000/path')).toBe(true);
      expect(checkUri(ctx, 'field', 'ftp://files.example.com/file.txt')).toBe(true);
      expect(ctx.issues).toHaveLength(0);
    });

    it('rechaza URIs inválidas', () => {
      expect(checkUri(ctx, 'field', 'not-a-uri')).toBe(false);
      expect(ctx.issues).toHaveLength(1);
      expect(ctx.issues[0].reason).toBe('URI inválida.');
    });

    it('rechaza strings vacíos', () => {
      ctx = createContext();
      expect(checkUri(ctx, 'field', '')).toBe(false);
      expect(ctx.issues).toHaveLength(1);
    });

    it('rechaza numbers', () => {
      ctx = createContext();
      expect(checkUri(ctx, 'field', 123)).toBe(false);
      expect(ctx.issues).toHaveLength(1);
      expect(ctx.issues[0].reason).toBe('Debe ser una cadena.');
    });
  });

  describe('checkArray', () => {
    it('acepta arrays válidos', () => {
      expect(checkArray(ctx, 'field', [1, 2, 3])).toBe(true);
      expect(checkArray(ctx, 'field', [])).toBe(true);
      expect(ctx.issues).toHaveLength(0);
    });

    it('rechaza no arrays', () => {
      expect(checkArray(ctx, 'field', 'not-array')).toBe(false);
      expect(ctx.issues).toHaveLength(1);
      expect(ctx.issues[0].reason).toBe('Debe ser un array.');
    });

    it('rechaza numbers como no array', () => {
      ctx = createContext();
      expect(checkArray(ctx, 'field', 123)).toBe(false);
      expect(ctx.issues).toHaveLength(1);
    });

    it('rechaza objects como no array', () => {
      ctx = createContext();
      expect(checkArray(ctx, 'field', {})).toBe(false);
      expect(ctx.issues).toHaveLength(1);
    });

    it('respeta minItems', () => {
      ctx = createContext();
      checkArray(ctx, 'field', [1], { minItems: 2 });
      expect(ctx.issues).toHaveLength(1);
      expect(ctx.issues[0].reason).toBe('Mínimo 2 ítems.');
    });

    it('no agrega issue cuando cumple minItems', () => {
      checkArray(ctx, 'field', [1, 2], { minItems: 2 });
      expect(ctx.issues).toHaveLength(0);
    });

    it('respeta maxItems', () => {
      ctx = createContext();
      checkArray(ctx, 'field', [1, 2, 3], { maxItems: 2 });
      expect(ctx.issues).toHaveLength(1);
      expect(ctx.issues[0].reason).toBe('Máximo 2 ítems.');
    });

    it('no agrega issue cuando cumple maxItems', () => {
      checkArray(ctx, 'field', [1, 2], { maxItems: 2 });
      expect(ctx.issues).toHaveLength(0);
    });

    it('valida minItems y maxItems juntos', () => {
      ctx = createContext();
      checkArray(ctx, 'field', [1], { minItems: 2, maxItems: 5 });
      expect(ctx.issues).toHaveLength(1);
      expect(ctx.issues[0].reason).toBe('Mínimo 2 ítems.');
    });
  });
});
