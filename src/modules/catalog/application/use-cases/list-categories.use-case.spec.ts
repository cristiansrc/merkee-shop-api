import { listCategories, CategoryView } from './list-categories.use-case';
import { CategoryRepositoryPort, CategoryRecord } from '../../domain/ports/category-repository.port';
import { Result, isSuccess } from '../../../../shared/domain/result';

describe('listCategories', () => {
  const mockCategories: readonly CategoryRecord[] = [
    { id: 'cat-1', name: 'Bebidas', imageKey: 'img/bebidas.jpg', version: 1, deletedAt: null },
    { id: 'cat-2', name: 'Lácteos', imageKey: 'img/lacteos.jpg', version: 2, deletedAt: null },
  ];

  const mockRepo: CategoryRepositoryPort = {
    listActive: jest.fn().mockResolvedValue(mockCategories),
    listAll: jest.fn(),
    findById: jest.fn(),
    findActiveById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    softDelete: jest.fn(),
    countActiveProducts: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns active categories mapped to view', async () => {
    const result = await listCategories(mockRepo);
    expect(isSuccess(result)).toBe(true);
    if (isSuccess(result)) {
      expect(result.value).toHaveLength(2);
      expect(result.value[0]).toEqual({
        id: 'cat-1',
        name: 'Bebidas',
        imageKey: 'img/bebidas.jpg',
        version: 1,
      });
    }
    expect(mockRepo.listActive).toHaveBeenCalledTimes(1);
  });

  it('returns empty array when no categories exist', async () => {
    (mockRepo.listActive as jest.Mock).mockResolvedValue([]);
    const result = await listCategories(mockRepo);
    expect(isSuccess(result)).toBe(true);
    if (isSuccess(result)) {
      expect(result.value).toHaveLength(0);
    }
  });

  it('returns technical failure on repo error', async () => {
    (mockRepo.listActive as jest.Mock).mockRejectedValue(new Error('DB error'));
    const result = await listCategories(mockRepo);
    expect(!isSuccess(result)).toBe(true);
    if (!isSuccess(result)) {
      expect(result.error.code).toBe('TECHNICAL_DEPENDENCY_FAILURE');
    }
  });
});
