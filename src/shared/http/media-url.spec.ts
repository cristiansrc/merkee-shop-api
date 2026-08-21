import {
  resolveMediaPublicUrl,
  DEFAULT_MEDIA_PUBLIC_BASE_URL,
} from './media-url';

describe('resolveMediaPublicUrl', () => {
  const ORIGINAL_ENV = process.env.MEDIA_PUBLIC_BASE_URL;

  beforeEach(() => {
    delete process.env.MEDIA_PUBLIC_BASE_URL;
  });

  afterAll(() => {
    if (ORIGINAL_ENV === undefined) {
      delete process.env.MEDIA_PUBLIC_BASE_URL;
    } else {
      process.env.MEDIA_PUBLIC_BASE_URL = ORIGINAL_ENV;
    }
  });

  it('expone el default seguro https://images.merkee.shop', () => {
    expect(DEFAULT_MEDIA_PUBLIC_BASE_URL).toBe('https://images.merkee.shop');
  });

  it('resuelve una key normal con segmentos conservados', () => {
    expect(resolveMediaPublicUrl('media/2026/08/20/uuid.jpg')).toBe(
      'https://images.merkee.shop/media/2026/08/20/uuid.jpg',
    );
  });

  it('conserva `/` como separador sin convertirlo en %2F', () => {
    const result = resolveMediaPublicUrl('media/2026/sub/dir/file.png');
    expect(result).toBe('https://images.merkee.shop/media/2026/sub/dir/file.png');
    expect(result).not.toContain('%2F');
  });

  it('codifica espacios dentro de un segmento', () => {
    expect(resolveMediaPublicUrl('media/2026/my file.jpg')).toBe(
      'https://images.merkee.shop/media/2026/my%20file.jpg',
    );
  });

  it('codifica caracteres peligrosos (#, ?, &, %) sin tocar separadores', () => {
    expect(resolveMediaPublicUrl('media/2026/a#b?c&d%e.jpg')).toBe(
      'https://images.merkee.shop/media/2026/a%23b%3Fc%26d%25e.jpg',
    );
  });

  it('devuelve cadena vacía cuando el key está vacío', () => {
    expect(resolveMediaPublicUrl('')).toBe('');
  });

  it('usa MEDIA_PUBLIC_BASE_URL cuando está definida', () => {
    process.env.MEDIA_PUBLIC_BASE_URL = 'https://cdn.example.com';
    expect(resolveMediaPublicUrl('media/2026/x.jpg')).toBe(
      'https://cdn.example.com/media/2026/x.jpg',
    );
  });

  it('ignora MEDIA_PUBLIC_BASE_URL vacía o solo espacios', () => {
    process.env.MEDIA_PUBLIC_BASE_URL = '   ';
    expect(resolveMediaPublicUrl('media/2026/x.jpg')).toBe(
      'https://images.merkee.shop/media/2026/x.jpg',
    );
  });

  it('elimina las barras finales de la base URL para evitar doble slash', () => {
    process.env.MEDIA_PUBLIC_BASE_URL = 'https://images.merkee.shop/';
    expect(resolveMediaPublicUrl('media/2026/x.jpg')).toBe(
      'https://images.merkee.shop/media/2026/x.jpg',
    );
    process.env.MEDIA_PUBLIC_BASE_URL = 'https://images.merkee.shop///';
    expect(resolveMediaPublicUrl('media/2026/x.jpg')).toBe(
      'https://images.merkee.shop/media/2026/x.jpg',
    );
  });
});
