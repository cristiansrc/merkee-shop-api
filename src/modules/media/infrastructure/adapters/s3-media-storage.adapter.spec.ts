import { S3MediaStorageAdapter } from './s3-media-storage.adapter';

// Mock de @aws-sdk/client-s3
jest.mock('@aws-sdk/client-s3', () => {
  const mockSend = jest.fn().mockResolvedValue({});
  return {
    S3Client: jest.fn().mockImplementation(() => ({ send: mockSend })),
    PutObjectCommand: jest.fn().mockImplementation((input) => input),
  };
});

// Mock de @aws-sdk/s3-request-presigner
jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://s3.test-bucket.amazonaws.com/signed-url'),
}));

describe('S3MediaStorageAdapter', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    process.env.AWS_REGION = 'us-east-1';
    process.env.S3_BUCKET_NAME = 'test-bucket';
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('lanza error cuando AWS_REGION no está configurado', async () => {
    delete process.env.AWS_REGION;
    process.env.S3_BUCKET_NAME = 'test-bucket';

    const adapter = new S3MediaStorageAdapter(300);
    await expect(
      adapter.createUploadUrl('key', 'image/jpeg', 1024),
    ).rejects.toThrow('S3 configuration missing');
  });

  it('lanza error cuando S3_BUCKET_NAME no está configurado', async () => {
    process.env.AWS_REGION = 'us-east-1';
    delete process.env.S3_BUCKET_NAME;

    const adapter = new S3MediaStorageAdapter(300);
    await expect(
      adapter.createUploadUrl('key', 'image/jpeg', 1024),
    ).rejects.toThrow('S3 configuration missing');
  });

  it('lanza error cuando ambos region y bucket faltan', async () => {
    delete process.env.AWS_REGION;
    delete process.env.S3_BUCKET_NAME;

    const adapter = new S3MediaStorageAdapter(300);
    await expect(
      adapter.createUploadUrl('key', 'image/jpeg', 1024),
    ).rejects.toThrow('S3 configuration missing');
  });

  it('genera URL prefirmada cuando configuración es válida', async () => {
    const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
    const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');

    const adapter = new S3MediaStorageAdapter(300);
    const result = await adapter.createUploadUrl('media/test.jpg', 'image/jpeg', 2048);

    expect(S3Client).toHaveBeenCalledWith({ region: 'us-east-1' });
    expect(PutObjectCommand).toHaveBeenCalledWith({
      Bucket: 'test-bucket',
      Key: 'media/test.jpg',
      ContentType: 'image/jpeg',
      ContentLength: 2048,
    });
    expect(getSignedUrl).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      { expiresIn: 300 },
    );
    expect(result.url).toBe('https://s3.test-bucket.amazonaws.com/signed-url');
    expect(result.expiresAt).toBeInstanceOf(Date);
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('no envía ACL en el PutObjectCommand (BucketOwnerEnforced)', async () => {
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');

    const adapter = new S3MediaStorageAdapter(300);
    await adapter.createUploadUrl('media/test.jpg', 'image/jpeg', 2048);

    const commandInput = (PutObjectCommand as unknown as jest.Mock).mock.calls[0][0];
    expect(commandInput).not.toHaveProperty('ACL');
    expect(commandInput).not.toHaveProperty('Acl');
  });

  it('usa TTL personalizado', async () => {
    const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');

    const adapter = new S3MediaStorageAdapter(600);
    await adapter.createUploadUrl('media/test.png', 'image/png', 1024);

    expect(getSignedUrl).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      { expiresIn: 600 },
    );
  });

  it('usa TTL por defecto de 300 segundos', async () => {
    const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');

    const adapter = new S3MediaStorageAdapter();
    await adapter.createUploadUrl('media/test.png', 'image/png', 1024);

    expect(getSignedUrl).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      { expiresIn: 300 },
    );
  });

  it('lanza error técnico cuando S3 falla', async () => {
    const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
    (getSignedUrl as jest.Mock).mockRejectedValueOnce(new Error('S3 access denied'));

    const adapter = new S3MediaStorageAdapter(300);
    await expect(
      adapter.createUploadUrl('key', 'image/jpeg', 1024),
    ).rejects.toThrow('S3 presigned URL generation failed: S3 access denied');
  });
});
