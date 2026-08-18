import { listProducts, ListProductsResult } from './list-products.use-case';
import { ProductRepositoryPort, ProductPage, ProductWithImages } from '../../domain/ports/product-repository.port';
import { Result, isSuccess } from '../../../../shared/domain/result';

describe('listProducts', () => {
  const mockProductPage: ProductPage = {
    items: [
      {
        product: {
          id: 'prod-1', categoryId: 'cat-1', name: 'Agua', description: 'Botella',
          regularPriceCop: 3000n, salePriceCop: 2500n, unit: 'unit',
          stockOnHand: 100, stockReserved: 5, version: 1, deletedAt: null,
        },
        images: [{ id: 'img-1', productId: 'prod-1', key: 'img/agua.jpg', altText: 'Agua', position: 0 }],
      },
    ],
    page: 1, size: 20, total: 1,
  };

  const mockRepo: ProductRepositoryPort = {
    listActive: jest.fn().mockResolvedValue(mockProductPage),
    listActiveByCategory: jest.fn().mockResolvedValue(mockProductPage),
    searchActive: jest.fn().mockResolvedValue(mockProductPage),
    findById: jest.fn(),
    listAll: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    softDelete: jest.fn(),
  };

  beforeEach(() => jest.clearAllMocks());

  it('lists active products with pagination', async () => {
    const result = await listProducts(mockRepo, { page: 1, size: 20 });
    expect(isSuccess(result)).toBe(true);
    if (isSuccess(result)) {
      const data = result.value as ListProductsResult;
      expect(data.items).toHaveLength(1);
      expect(data.page).toBe(1);
      expect(data.size).toBe(20);
      expect(data.total).toBe(1);
      expect(data.items[0].name).toBe('Agua');
    }
  });

  it('filters by category_id', async () => {
    await listProducts(mockRepo, { page: 1, size: 20, categoryId: 'cat-1' });
    expect(mockRepo.listActiveByCategory).toHaveBeenCalledWith('cat-1', 1, 20);
  });

  it('searches by q', async () => {
    await listProducts(mockRepo, { page: 1, size: 20, q: 'Agua' });
    expect(mockRepo.searchActive).toHaveBeenCalledWith('Agua', 1, 20);
  });

  it('returns technical failure on error', async () => {
    (mockRepo.listActive as jest.Mock).mockRejectedValue(new Error('DB'));
    const result = await listProducts(mockRepo, { page: 1, size: 20 });
    expect(!isSuccess(result)).toBe(true);
  });
});
