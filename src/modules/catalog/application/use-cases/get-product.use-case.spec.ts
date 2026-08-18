import { getProduct } from './get-product.use-case';
import { ProductRepositoryPort, ProductWithImages } from '../../domain/ports/product-repository.port';
import { CategoryRepositoryPort, CategoryRecord } from '../../domain/ports/category-repository.port';
import { Result, isSuccess } from '../../../../shared/domain/result';

describe('getProduct', () => {
  const mockProduct: ProductWithImages = {
    product: {
      id: 'prod-1', categoryId: 'cat-1', name: 'Agua', description: 'Botella',
      regularPriceCop: 3000n, salePriceCop: 2500n, unit: 'unit',
      stockOnHand: 100, stockReserved: 5, version: 1, deletedAt: null,
    },
    images: [{ id: 'img-1', productId: 'prod-1', key: 'img/agua.jpg', altText: 'Agua', position: 0 }],
  };

  const mockCategory: CategoryRecord = {
    id: 'cat-1', name: 'Bebidas', imageKey: 'img/bebidas.jpg', version: 1, deletedAt: null,
  };

  const mockProductRepo: ProductRepositoryPort = {
    findById: jest.fn().mockResolvedValue(mockProduct),
    listActive: jest.fn(),
    listActiveByCategory: jest.fn(),
    searchActive: jest.fn(),
    listAll: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    softDelete: jest.fn(),
  };

  const mockCategoryRepo: CategoryRepositoryPort = {
    findActiveById: jest.fn().mockResolvedValue(mockCategory),
    listActive: jest.fn(),
    listAll: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    softDelete: jest.fn(),
    countActiveProducts: jest.fn(),
  };

  beforeEach(() => jest.clearAllMocks());

  it('returns product detail with category', async () => {
    const result = await getProduct(mockProductRepo, mockCategoryRepo, 'prod-1');
    expect(isSuccess(result)).toBe(true);
    if (isSuccess(result)) {
      expect(result.value.id).toBe('prod-1');
      expect(result.value.name).toBe('Agua');
      expect(result.value.category.name).toBe('Bebidas');
      expect(result.value.stockAvailable).toBe(95);
    }
  });

  it('returns 404 for non-existent product', async () => {
    (mockProductRepo.findById as jest.Mock).mockResolvedValue(null);
    const result = await getProduct(mockProductRepo, mockCategoryRepo, 'non-existent');
    expect(!isSuccess(result)).toBe(true);
    if (!isSuccess(result)) {
      expect(result.error.code).toBe('RESOURCE_NOT_FOUND');
    }
  });

  it('returns 404 for soft-deleted product', async () => {
    const deletedProduct = { ...mockProduct, product: { ...mockProduct.product, deletedAt: new Date() } };
    (mockProductRepo.findById as jest.Mock).mockResolvedValue(deletedProduct);
    const result = await getProduct(mockProductRepo, mockCategoryRepo, 'prod-1');
    expect(!isSuccess(result)).toBe(true);
  });
});
