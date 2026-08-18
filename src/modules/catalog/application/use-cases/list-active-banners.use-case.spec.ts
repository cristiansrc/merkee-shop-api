import { listActiveBanners } from './list-active-banners.use-case';
import { BannerRepositoryPort } from '../../domain/ports/banner-repository.port';
import { isSuccess, isFailure } from '../../../../shared/domain/result';

describe('listActiveBanners', () => {
  const mockBannerRepo: jest.Mocked<BannerRepositoryPort> = {
    listActive: jest.fn(),
    listAll: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    softDelete: jest.fn(),
  };

  beforeEach(() => jest.clearAllMocks());

  it('retorna banners activos exitosamente', async () => {
    const banners = [
      { id: 'b-1', name: 'Banner 1', imageKey: 'img/1.jpg', targetPath: '/p1', displayOrder: 1, active: true, version: 1, deletedAt: null },
      { id: 'b-2', name: 'Banner 2', imageKey: 'img/2.jpg', targetPath: null, displayOrder: 2, active: true, version: 1, deletedAt: null },
    ];
    mockBannerRepo.listActive.mockResolvedValue(banners);

    const result = await listActiveBanners(mockBannerRepo);

    expect(isSuccess(result)).toBe(true);
    if (isSuccess(result)) {
      expect(result.value).toHaveLength(2);
      expect(result.value[0].id).toBe('b-1');
      expect(result.value[0].targetPath).toBe('/p1');
      expect(result.value[1].targetPath).toBeNull();
    }
  });

  it('retorna array vacío cuando no hay banners activos', async () => {
    mockBannerRepo.listActive.mockResolvedValue([]);
    const result = await listActiveBanners(mockBannerRepo);
    expect(isSuccess(result)).toBe(true);
    if (isSuccess(result)) {
      expect(result.value).toHaveLength(0);
    }
  });

  it('retorna technicalFailure cuando el repo falla', async () => {
    mockBannerRepo.listActive.mockRejectedValue(new Error('DB down'));
    const result = await listActiveBanners(mockBannerRepo);
    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect(result.error.code).toBe('TECHNICAL_DEPENDENCY_FAILURE');
      expect(result.error.kind).toBe('technical');
    }
  });
});
