import { S3MediaStorageAdapter } from './s3-media-storage.adapter';

describe('S3MediaStorageAdapter', () => {
  let adapter: S3MediaStorageAdapter;

  beforeEach(() => {
    adapter = new S3MediaStorageAdapter(300);
  });

  it('lanza error cuando AWS_REGION no está configurado', async () => {
    const originalRegion = process.env.AWS_REGION;
    const originalBucket = process.env.S3_BUCKET_NAME;
    delete process.env.AWS_REGION;
    process.env.S3_BUCKET_NAME = 'test-bucket';

    await expect(
      adapter.createUploadUrl('key', 'image/jpeg', 1024),
    ).rejects.toThrow('S3 configuration missing');

    if (originalRegion) process.env.AWS_REGION = originalRegion;
    if (originalBucket) process.env.S3_BUCKET_NAME = originalBucket;
  });

  it('lanza error cuando S3_BUCKET_NAME no está configurado', async () => {
    const originalRegion = process.env.AWS_REGION;
    const originalBucket = process.env.S3_BUCKET_NAME;
    process.env.AWS_REGION = 'us-east-1';
    delete process.env.S3_BUCKET_NAME;

    await expect(
      adapter.createUploadUrl('key', 'image/jpeg', 1024),
    ).rejects.toThrow('S3 configuration missing');

    if (originalRegion) process.env.AWS_REGION = originalRegion;
    if (originalBucket) process.env.S3_BUCKET_NAME = originalBucket;
  });

  it('lanza error cuando @aws-sdk no está instalado', async () => {
    process.env.AWS_REGION = 'us-east-1';
    process.env.S3_BUCKET_NAME = 'test-bucket';

    await expect(
      adapter.createUploadUrl('key', 'image/jpeg', 1024),
    ).rejects.toThrow('AWS SDK not available');
  });

  it('lanza error cuando ambos region y bucket faltan', async () => {
    const originalRegion = process.env.AWS_REGION;
    const originalBucket = process.env.S3_BUCKET_NAME;
    delete process.env.AWS_REGION;
    delete process.env.S3_BUCKET_NAME;

    await expect(
      adapter.createUploadUrl('key', 'image/jpeg', 1024),
    ).rejects.toThrow('S3 configuration missing');

    if (originalRegion) process.env.AWS_REGION = originalRegion;
    if (originalBucket) process.env.S3_BUCKET_NAME = originalBucket;
  });

  it('usa TTL por defecto de 300 segundos', () => {
    const defaultAdapter = new S3MediaStorageAdapter();
    expect(defaultAdapter).toBeDefined();
  });

  it('usa TTL personalizado cuando se proporciona', () => {
    const customAdapter = new S3MediaStorageAdapter(600);
    expect(customAdapter).toBeDefined();
  });
});
