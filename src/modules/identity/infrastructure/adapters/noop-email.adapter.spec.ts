import { NoopEmailAdapter } from './noop-email.adapter';

describe('NoopEmailAdapter', () => {
  let adapter: NoopEmailAdapter;

  beforeEach(() => {
    adapter = new NoopEmailAdapter();
  });

  describe('sendPasswordResetEmail', () => {
    it('siempre retorna ok sin enviar email', async () => {
      const result = await adapter.sendPasswordResetEmail(
        'user@example.com',
        'token-123',
      );
      expect(result.ok).toBe(true);
    });
  });
});
