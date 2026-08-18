import { adminListProducts, adminCreateProduct, adminUpdateProduct, adminDeleteProduct } from './admin-product.use-cases';
import { ProductRepositoryPort, ProductWithImages, ProductPage } from '../../domain/ports/product-repository.port';
import { ActorLookupPort, ActorInfo } from '../../domain/ports/actor-lookup.port';
import { CatalogIdempotencyPort } from '../../domain/ports/catalog-idempotency.port';
import { isSuccess, isFailure } from '../../../../shared/domain/result';

describe('admin product use cases', () => {
  const adminActor: ActorInfo = { id: 'admin-1', role: 'admin', mustChangePassword: false };
  const adminMustChange: ActorInfo = { id: 'admin-2', role: 'admin', mustChangePassword: true };
  const clientActor: ActorInfo = { id: 'client-1', role: 'cliente', mustChangePassword: false };

  const mockProductWithImages: ProductWithImages = {
    product: {
      id: 'prod-1',
      categoryId: 'cat-1',
      name: 'Producto Test',
      description: 'Descripción test',
      regularPriceCop: 50000n,
      salePriceCop: 40000n,
      unit: 'kg',
      stockOnHand: 100,
      stockReserved: 10,
      version: 1,
      deletedAt: null,
    },
    images: [
      { id: 'img-1', productId: 'prod-1', key: 'media/test.jpg', altText: 'Test', position: 0 },
    ],
  };

  const mockProductPage: ProductPage = {
    items: [mockProductWithImages],
    page: 1,
    size: 10,
    total: 1,
  };

  const mockProductRepo: jest.Mocked<ProductRepositoryPort> = {
    listAll: jest.fn().mockResolvedValue(mockProductPage),
    findById: jest.fn().mockResolvedValue(mockProductWithImages),
    listActive: jest.fn().mockResolvedValue(mockProductPage),
    listActiveByCategory: jest.fn().mockResolvedValue(mockProductPage),
    searchActive: jest.fn().mockResolvedValue(mockProductPage),
    create: jest.fn().mockResolvedValue(mockProductWithImages),
    update: jest.fn().mockResolvedValue(mockProductWithImages),
    softDelete: jest.fn().mockResolvedValue(true),
  };

  const mockActorLookup: jest.Mocked<ActorLookupPort> = {
    findById: jest.fn().mockResolvedValue(adminActor),
  };

  const mockIdempotency: jest.Mocked<CatalogIdempotencyPort> = {
    find: jest.fn().mockResolvedValue(null),
    findForUpdate: jest.fn().mockResolvedValue(null),
    save: jest.fn(),
  };

  beforeEach(() => {
    jest.resetAllMocks();
    mockProductRepo.listAll.mockResolvedValue(mockProductPage);
    mockProductRepo.findById.mockResolvedValue(mockProductWithImages);
    mockProductRepo.create.mockResolvedValue(mockProductWithImages);
    mockProductRepo.update.mockResolvedValue(mockProductWithImages);
    mockProductRepo.softDelete.mockResolvedValue(true);
    mockActorLookup.findById.mockResolvedValue(adminActor);
    mockIdempotency.find.mockResolvedValue(null);
  });

  describe('adminListProducts', () => {
    it('lista productos exitosamente', async () => {
      const result = await adminListProducts(mockProductRepo, 1, 10);
      expect(isSuccess(result)).toBe(true);
      if (isSuccess(result)) {
        expect(result.value.items).toHaveLength(1);
        expect(result.value.total).toBe(1);
        expect(result.value.page).toBe(1);
        expect(result.value.size).toBe(10);
      }
      expect(mockProductRepo.listAll).toHaveBeenCalledWith(1, 10);
    });

    it('retorna technicalFailure cuando el repo lanza excepción', async () => {
      mockProductRepo.listAll.mockRejectedValue(new Error('DB down'));
      const result = await adminListProducts(mockProductRepo, 1, 10);
      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error.code).toBe('TECHNICAL_DEPENDENCY_FAILURE');
      }
    });
  });

  describe('adminCreateProduct', () => {
    const validCommand = {
      actorId: 'admin-1',
      idempotencyKey: 'idem-1',
      categoryId: 'cat-1',
      name: 'Nuevo Producto',
      description: 'Descripción',
      regularPriceCop: 50000,
      salePriceCop: 40000,
      unit: 'kg',
      stockOnHand: 50,
      images: [{ key: 'media/img.jpg', altText: 'Img', position: 0 }],
    };

    it('crea producto exitosamente', async () => {
      const result = await adminCreateProduct(mockProductRepo, mockActorLookup, mockIdempotency, validCommand);
      expect(isSuccess(result)).toBe(true);
      expect(mockProductRepo.create).toHaveBeenCalled();
      expect(mockIdempotency.save).toHaveBeenCalled();
    });

    it('rechaza actor no admin', async () => {
      mockActorLookup.findById.mockResolvedValue(clientActor);
      const result = await adminCreateProduct(mockProductRepo, mockActorLookup, mockIdempotency, { ...validCommand, actorId: 'client-1' });
      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error.code).toBe('ACTOR_NOT_AUTHORIZED');
      }
    });

    it('rechaza actor null', async () => {
      mockActorLookup.findById.mockResolvedValue(null);
      const result = await adminCreateProduct(mockProductRepo, mockActorLookup, mockIdempotency, { ...validCommand, actorId: 'unknown' });
      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error.code).toBe('ACTOR_NOT_AUTHORIZED');
      }
    });

    it('rechaza admin con mustChangePassword', async () => {
      mockActorLookup.findById.mockResolvedValue(adminMustChange);
      const result = await adminCreateProduct(mockProductRepo, mockActorLookup, mockIdempotency, { ...validCommand, actorId: 'admin-2' });
      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error.code).toBe('INITIAL_PASSWORD_CHANGE_REQUIRED');
      }
    });

    it('retorna replay en idempotencia con mismo hash', async () => {
      const { createHash } = require('crypto');
      const bodyHash = createHash('sha256')
        .update(JSON.stringify({
          category_id: 'cat-1',
          name: 'Nuevo Producto',
          description: 'Descripción',
          regular_price_cop: 50000,
          sale_price_cop: 40000,
          unit: 'kg',
          stock_on_hand: 50,
          images: validCommand.images,
        }))
        .digest('hex');
      mockIdempotency.find.mockResolvedValue({
        scope: `catalog-product-create:admin-1`,
        idempotencyKey: 'idem-1',
        bodyHash,
        responseJson: { id: 'prod-1', name: 'Nuevo Producto' },
      });
      const result = await adminCreateProduct(mockProductRepo, mockActorLookup, mockIdempotency, validCommand);
      expect(isSuccess(result)).toBe(true);
      expect(mockProductRepo.create).not.toHaveBeenCalled();
    });

    it('retorna error en idempotencia divergente', async () => {
      mockIdempotency.find.mockResolvedValue({
        scope: `catalog-product-create:admin-1`,
        idempotencyKey: 'idem-1',
        bodyHash: 'different-hash',
        responseJson: {},
      });
      const result = await adminCreateProduct(mockProductRepo, mockActorLookup, mockIdempotency, validCommand);
      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
      }
    });

    it('retorna technicalFailure en excepción', async () => {
      mockActorLookup.findById.mockRejectedValue(new Error('DB error'));
      const result = await adminCreateProduct(mockProductRepo, mockActorLookup, mockIdempotency, validCommand);
      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error.code).toBe('TECHNICAL_DEPENDENCY_FAILURE');
      }
    });
  });

  describe('adminUpdateProduct', () => {
    const validCommand = {
      actorId: 'admin-1',
      productId: 'prod-1',
      expectedVersion: 1,
      idempotencyKey: 'idem-upd-1',
      categoryId: 'cat-1',
      name: 'Producto Actualizado',
      description: 'Nueva descripción',
      regularPriceCop: 60000,
      salePriceCop: 50000,
      unit: 'kg',
      images: [{ key: 'media/img2.jpg', altText: 'Img2', position: 0 }],
    };

    it('actualiza producto exitosamente', async () => {
      const result = await adminUpdateProduct(mockProductRepo, mockActorLookup, mockIdempotency, validCommand);
      expect(isSuccess(result)).toBe(true);
      expect(mockProductRepo.update).toHaveBeenCalled();
      expect(mockIdempotency.save).toHaveBeenCalled();
    });

    it('rechaza actor no admin', async () => {
      mockActorLookup.findById.mockResolvedValue(clientActor);
      const result = await adminUpdateProduct(mockProductRepo, mockActorLookup, mockIdempotency, { ...validCommand, actorId: 'client-1' });
      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error.code).toBe('ACTOR_NOT_AUTHORIZED');
      }
    });

    it('rechaza admin con mustChangePassword', async () => {
      mockActorLookup.findById.mockResolvedValue(adminMustChange);
      const result = await adminUpdateProduct(mockProductRepo, mockActorLookup, mockIdempotency, { ...validCommand, actorId: 'admin-2' });
      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error.code).toBe('INITIAL_PASSWORD_CHANGE_REQUIRED');
      }
    });

    it('retorna error cuando producto no existe', async () => {
      mockProductRepo.findById.mockResolvedValue(null);
      const result = await adminUpdateProduct(mockProductRepo, mockActorLookup, mockIdempotency, validCommand);
      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error.code).toBe('RESOURCE_NOT_FOUND');
      }
    });

    it('retorna error cuando producto está soft-deleted', async () => {
      mockProductRepo.findById.mockResolvedValue({
        ...mockProductWithImages,
        product: { ...mockProductWithImages.product, deletedAt: new Date() },
      });
      const result = await adminUpdateProduct(mockProductRepo, mockActorLookup, mockIdempotency, validCommand);
      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error.code).toBe('RESOURCE_NOT_FOUND');
      }
    });

    it('retorna versionMismatch cuando update retorna null', async () => {
      mockProductRepo.update.mockResolvedValue(null);
      const result = await adminUpdateProduct(mockProductRepo, mockActorLookup, mockIdempotency, validCommand);
      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error.code).toBe('VERSION_MISMATCH');
      }
    });

    it('retorna replay en idempotencia con mismo hash', async () => {
      const { createHash } = require('crypto');
      const bodyHash = createHash('sha256')
        .update(JSON.stringify({
          category_id: 'cat-1',
          name: 'Producto Actualizado',
          description: 'Nueva descripción',
          regular_price_cop: 60000,
          sale_price_cop: 50000,
          unit: 'kg',
          images: validCommand.images,
          version: 1,
        }))
        .digest('hex');
      mockIdempotency.find.mockResolvedValue({
        scope: `catalog-product-update:admin-1`,
        idempotencyKey: 'idem-upd-1',
        bodyHash,
        responseJson: { id: 'prod-1', name: 'Producto Actualizado' },
      });
      const result = await adminUpdateProduct(mockProductRepo, mockActorLookup, mockIdempotency, validCommand);
      expect(isSuccess(result)).toBe(true);
      expect(mockProductRepo.update).not.toHaveBeenCalled();
    });

    it('retorna error en idempotencia divergente', async () => {
      mockIdempotency.find.mockResolvedValue({
        scope: `catalog-product-update:admin-1`,
        idempotencyKey: 'idem-upd-1',
        bodyHash: 'different-hash',
        responseJson: {},
      });
      const result = await adminUpdateProduct(mockProductRepo, mockActorLookup, mockIdempotency, validCommand);
      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
      }
    });

    it('retorna technicalFailure en excepción', async () => {
      mockActorLookup.findById.mockRejectedValue(new Error('DB error'));
      const result = await adminUpdateProduct(mockProductRepo, mockActorLookup, mockIdempotency, validCommand);
      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error.code).toBe('TECHNICAL_DEPENDENCY_FAILURE');
      }
    });
  });

  describe('adminDeleteProduct', () => {
    const validCommand = {
      actorId: 'admin-1',
      productId: 'prod-1',
      idempotencyKey: 'idem-del-1',
    };

    it('elimina producto exitosamente', async () => {
      const result = await adminDeleteProduct(mockProductRepo, mockActorLookup, mockIdempotency, validCommand);
      expect(isSuccess(result)).toBe(true);
      expect(mockProductRepo.softDelete).toHaveBeenCalledWith('prod-1');
      expect(mockIdempotency.save).toHaveBeenCalled();
    });

    it('rechaza actor no admin', async () => {
      mockActorLookup.findById.mockResolvedValue(clientActor);
      const result = await adminDeleteProduct(mockProductRepo, mockActorLookup, mockIdempotency, { ...validCommand, actorId: 'client-1' });
      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error.code).toBe('ACTOR_NOT_AUTHORIZED');
      }
    });

    it('rechaza actor null', async () => {
      mockActorLookup.findById.mockResolvedValue(null);
      const result = await adminDeleteProduct(mockProductRepo, mockActorLookup, mockIdempotency, { ...validCommand, actorId: 'unknown' });
      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error.code).toBe('ACTOR_NOT_AUTHORIZED');
      }
    });

    it('rechaza admin con mustChangePassword', async () => {
      mockActorLookup.findById.mockResolvedValue(adminMustChange);
      const result = await adminDeleteProduct(mockProductRepo, mockActorLookup, mockIdempotency, { ...validCommand, actorId: 'admin-2' });
      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error.code).toBe('INITIAL_PASSWORD_CHANGE_REQUIRED');
      }
    });

    it('retorna error cuando producto no existe', async () => {
      mockProductRepo.findById.mockResolvedValue(null);
      const result = await adminDeleteProduct(mockProductRepo, mockActorLookup, mockIdempotency, validCommand);
      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error.code).toBe('RESOURCE_NOT_FOUND');
      }
    });

    it('retorna error cuando producto está soft-deleted', async () => {
      mockProductRepo.findById.mockResolvedValue({
        ...mockProductWithImages,
        product: { ...mockProductWithImages.product, deletedAt: new Date() },
      });
      const result = await adminDeleteProduct(mockProductRepo, mockActorLookup, mockIdempotency, validCommand);
      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error.code).toBe('RESOURCE_NOT_FOUND');
      }
    });

    it('retorna replay en idempotencia con mismo hash', async () => {
      const { createHash } = require('crypto');
      const bodyHash = createHash('sha256')
        .update(JSON.stringify({ product_id: 'prod-1' }))
        .digest('hex');
      mockIdempotency.find.mockResolvedValue({
        scope: `catalog-product-delete:admin-1`,
        idempotencyKey: 'idem-del-1',
        bodyHash,
        responseJson: { deleted: true },
      });
      const result = await adminDeleteProduct(mockProductRepo, mockActorLookup, mockIdempotency, validCommand);
      expect(isSuccess(result)).toBe(true);
      expect(mockProductRepo.softDelete).not.toHaveBeenCalled();
    });

    it('retorna error en idempotencia divergente', async () => {
      mockIdempotency.find.mockResolvedValue({
        scope: `catalog-product-delete:admin-1`,
        idempotencyKey: 'idem-del-1',
        bodyHash: 'different-hash',
        responseJson: {},
      });
      const result = await adminDeleteProduct(mockProductRepo, mockActorLookup, mockIdempotency, validCommand);
      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
      }
    });

    it('retorna technicalFailure en excepción', async () => {
      mockActorLookup.findById.mockRejectedValue(new Error('DB error'));
      const result = await adminDeleteProduct(mockProductRepo, mockActorLookup, mockIdempotency, validCommand);
      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error.code).toBe('TECHNICAL_DEPENDENCY_FAILURE');
      }
    });
  });
});
