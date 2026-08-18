import { FakeS3MediaStorageAdapter } from './fake-s3-media-storage.adapter';

describe('FakeS3MediaStorageAdapter', () => {
  it('genera URL prefirmada sintácticamente válida', async () => {
    const adapter = new FakeS3MediaStorageAdapter(300);
    const result = await adapter.createUploadUrl(
      'media/2026/08/17/test.jpg',
      'image/jpeg',
      1024,
    );
    expect(result.url).toContain('s3.amazonaws.com');
    expect(result.url).toContain('media%2F2026%2F08%2F17%2Ftest.jpg');
    expect(result.url).toContain('X-Amz-Algorithm=AWS4-HMAC-SHA256');
    expect(result.url).toContain('X-Amz-Expires=300');
    expect(result.expiresAt).toBeInstanceOf(Date);
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('usa TTL configurable', async () => {
    const adapter = new FakeS3MediaStorageAdapter(60);
    const result = await adapter.createUploadUrl(
      'media/2026/08/17/test.png',
      'image/png',
      2048,
    );
    expect(result.url).toContain('X-Amz-Expires=60');
  });

  it('no expone credenciales en la URL', async () => {
    const adapter = new FakeS3MediaStorageAdapter(300);
    const result = await adapter.createUploadUrl(
      'media/2026/08/17/test.webp',
      'image/webp',
      512,
    );
    // La URL contiene "fake" pero no credenciales reales
    expect(result.url).not.toContain('AKIA');
    expect(result.url).not.toContain('secret');
    expect(result.url).not.toContain('password');
  });

  it('codifica la clave correctamente en la URL', async () => {
    const adapter = new FakeS3MediaStorageAdapter(300);
    const result = await adapter.createUploadUrl(
      'media/2026/08/17/file with spaces.jpg',
      'image/jpeg',
      1024,
    );
    expect(result.url).toContain('file%20with%20spaces.jpg');
  });
});
