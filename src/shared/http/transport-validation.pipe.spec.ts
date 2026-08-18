import { BadRequestException } from '@nestjs/common';
import { TransportValidationPipe } from './transport-validation.pipe';

describe('TransportValidationPipe (MSF-API-002)', () => {
  it('deja pasar un valor válido', () => {
    const pipe = new TransportValidationPipe<{ email: string }>((value) => ({
      valid: value.email.includes('@'),
    }));
    const input = { email: 'a@b.co' };
    expect(pipe.transform(input)).toBe(input);
  });

  it('lanza 400 INVALID_DOMAIN_INPUT con details seguros cuando falla', () => {
    const pipe = new TransportValidationPipe<{ email: string }>((value) => ({
      valid: value.email.includes('@'),
      details: [{ field: 'email', reason: 'Formato inválido.' }],
    }));
    let thrown: unknown;
    try {
      pipe.transform({ email: 'no-es-correo' });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(BadRequestException);
    const http = thrown as BadRequestException;
    expect(http.getStatus()).toBe(400);
    const body = http.getResponse() as Record<string, unknown>;
    expect(body.code).toBe('INVALID_DOMAIN_INPUT');
    expect(body.details).toEqual([{ field: 'email', reason: 'Formato inválido.' }]);
  });

  it('lanza 400 sin details cuando validación falla sin detalles', () => {
    const pipe = new TransportValidationPipe<{ name: string }>((_value) => ({
      valid: false,
    }));
    let thrown: unknown;
    try {
      pipe.transform({ name: '' });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(BadRequestException);
    const http = thrown as BadRequestException;
    expect(http.getStatus()).toBe(400);
    const body = http.getResponse() as Record<string, unknown>;
    expect(body.code).toBe('INVALID_DOMAIN_INPUT');
    expect(body.details).toBeUndefined();
  });

  it('incluye timestamp, error y trace_id en el body', () => {
    const pipe = new TransportValidationPipe<{ x: string }>(() => ({
      valid: false,
    }));
    let thrown: unknown;
    try {
      pipe.transform({ x: 'bad' });
    } catch (error) {
      thrown = error;
    }
    const body = (thrown as BadRequestException).getResponse() as Record<string, unknown>;
    expect(typeof body.timestamp).toBe('string');
    expect(body.error).toBe('Bad Request');
    expect(body.trace_id).toBe('');
    expect(body.path).toBe('/');
  });
});
