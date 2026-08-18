import { adminListCategories, adminCreateCategory, adminUpdateCategory, adminDeleteCategory } from './admin-category.use-cases';
import { CategoryRepositoryPort, CategoryRecord } from '../../domain/ports/category-repository.port';
import { ActorLookupPort, ActorInfo } from '../../domain/ports/actor-lookup.port';
import { CatalogIdempotencyPort } from '../../domain/ports/catalog-idempotency.port';
import { isSuccess, isFailure } from '../../../../shared/domain/result';

describe('admin category use cases (completo)', () => {
  const adminActor: ActorInfo = { id: 'admin-1', role: 'admin', mustChangePassword: false };
  const adminMustChange: ActorInfo = { id: 'admin-2', role: 'admin', mustChangePassword: true };
  const clientActor: ActorInfo = { id: 'client-1', role: 'cliente', mustChangePassword: false };

  const mockCategory: CategoryRecord = {
    id: 'cat-1', name: 'Bebidas', imageKey: 'img/bebidas.jpg', version: 1, deletedAt: null,
  };

  const mockCategoryRepo: jest.Mocked<CategoryRepositoryPort> = {
    listActive: jest.fn().mockResolvedValue([mockCategory]),
    listAll: jest.fn().mockResolvedValue([mockCategory]),
    findById: jest.fn().mockResolvedValue(mockCategory),
    findActiveById: jest.fn().mockResolvedValue(mockCategory),
    create: jest.fn().mockResolvedValue(mockCategory),
    update: jest.fn().mockResolvedValue({ ...mockCategory, version: 2 }),
    softDelete: jest.fn().mockResolvedValue(true),
    countActiveProducts: jest.fn().mockResolvedValue(0),
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
    mockCategoryRepo.listActive.mockResolvedValue([mockCategory]);
    mockCategoryRepo.listAll.mockResolvedValue([mockCategory]);
    mockCategoryRepo.findById.mockResolvedValue(mockCategory);
    mockCategoryRepo.findActiveById.mockResolvedValue(mockCategory);
    mockCategoryRepo.create.mockResolvedValue(mockCategory);
    mockCategoryRepo.update.mockResolvedValue({ ...mockCategory, version: 2 });
    mockCategoryRepo.softDelete.mockResolvedValue(true);
    mockCategoryRepo.countActiveProducts.mockResolvedValue(0);
    mockActorLookup.findById.mockResolvedValue(adminActor);
    mockIdempotency.find.mockResolvedValue(null);
  });

  describe('adminListCategories', () => {
    it('lista categorías exitosamente', async () => {
      const result = await adminListCategories(mockCategoryRepo);
      expect(isSuccess(result)).toBe(true);
      if (isSuccess(result)) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0].id).toBe('cat-1');
        expect(result.value[0].name).toBe('Bebidas');
      }
    });

    it('retorna technicalFailure cuando el repo falla', async () => {
      mockCategoryRepo.listAll.mockRejectedValue(new Error('DB fail'));
      const result = await adminListCategories(mockCategoryRepo);
      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error.code).toBe('TECHNICAL_DEPENDENCY_FAILURE');
      }
    });
  });

  describe('adminCreateCategory', () => {
    it('crea categoría exitosamente', async () => {
      const result = await adminCreateCategory(
        mockCategoryRepo, mockActorLookup, mockIdempotency,
        { actorId: 'admin-1', idempotencyKey: 'key-1', name: 'Bebidas', imageKey: 'img/bebidas.jpg' },
      );
      expect(isSuccess(result)).toBe(true);
      expect(mockCategoryRepo.create).toHaveBeenCalled();
      expect(mockIdempotency.save).toHaveBeenCalled();
    });

    it('rechaza actor no admin', async () => {
      mockActorLookup.findById.mockResolvedValue(clientActor);
      const result = await adminCreateCategory(
        mockCategoryRepo, mockActorLookup, mockIdempotency,
        { actorId: 'client-1', idempotencyKey: 'key-1', name: 'Bebidas', imageKey: 'img/bebidas.jpg' },
      );
      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error.code).toBe('ACTOR_NOT_AUTHORIZED');
      }
    });

    it('rechaza actor null', async () => {
      mockActorLookup.findById.mockResolvedValue(null);
      const result = await adminCreateCategory(
        mockCategoryRepo, mockActorLookup, mockIdempotency,
        { actorId: 'unknown', idempotencyKey: 'key-1', name: 'Bebidas', imageKey: 'img/bebidas.jpg' },
      );
      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error.code).toBe('ACTOR_NOT_AUTHORIZED');
      }
    });

    it('rechaza admin con mustChangePassword', async () => {
      mockActorLookup.findById.mockResolvedValue(adminMustChange);
      const result = await adminCreateCategory(
        mockCategoryRepo, mockActorLookup, mockIdempotency,
        { actorId: 'admin-2', idempotencyKey: 'key-1', name: 'Bebidas', imageKey: 'img/bebidas.jpg' },
      );
      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error.code).toBe('INITIAL_PASSWORD_CHANGE_REQUIRED');
      }
    });

    it('retorna replay en idempotencia con mismo hash', async () => {
      const { createHash } = require('crypto');
      const bodyHash = createHash('sha256')
        .update(JSON.stringify({ name: 'Bebidas', image_key: 'img/bebidas.jpg' }))
        .digest('hex');
      mockIdempotency.find.mockResolvedValue({
        scope: 'catalog-category-create:admin-1',
        idempotencyKey: 'key-1',
        bodyHash,
        responseJson: { id: 'cat-1', name: 'Bebidas', imageKey: 'img/bebidas.jpg', version: 1 },
      });
      const result = await adminCreateCategory(
        mockCategoryRepo, mockActorLookup, mockIdempotency,
        { actorId: 'admin-1', idempotencyKey: 'key-1', name: 'Bebidas', imageKey: 'img/bebidas.jpg' },
      );
      expect(isSuccess(result)).toBe(true);
      expect(mockCategoryRepo.create).not.toHaveBeenCalled();
    });

    it('retorna error en idempotencia divergente', async () => {
      mockIdempotency.find.mockResolvedValue({
        scope: 'catalog-category-create:admin-1',
        idempotencyKey: 'key-1',
        bodyHash: 'different-hash',
        responseJson: {},
      });
      const result = await adminCreateCategory(
        mockCategoryRepo, mockActorLookup, mockIdempotency,
        { actorId: 'admin-1', idempotencyKey: 'key-1', name: 'Bebidas', imageKey: 'img/bebidas.jpg' },
      );
      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
      }
    });

    it('retorna technicalFailure en excepción', async () => {
      mockActorLookup.findById.mockRejectedValue(new Error('DB error'));
      const result = await adminCreateCategory(
        mockCategoryRepo, mockActorLookup, mockIdempotency,
        { actorId: 'admin-1', idempotencyKey: 'key-1', name: 'Bebidas', imageKey: 'img/bebidas.jpg' },
      );
      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error.code).toBe('TECHNICAL_DEPENDENCY_FAILURE');
      }
    });
  });

  describe('adminUpdateCategory', () => {
    const validCommand = {
      actorId: 'admin-1',
      categoryId: 'cat-1',
      expectedVersion: 1,
      idempotencyKey: 'key-upd-1',
      name: 'Bebidas Actualizado',
      imageKey: 'img/bebidas-nuevo.jpg',
    };

    it('actualiza categoría exitosamente', async () => {
      const result = await adminUpdateCategory(mockCategoryRepo, mockActorLookup, mockIdempotency, validCommand);
      expect(isSuccess(result)).toBe(true);
      expect(mockCategoryRepo.update).toHaveBeenCalled();
      expect(mockIdempotency.save).toHaveBeenCalled();
    });

    it('rechaza actor no admin', async () => {
      mockActorLookup.findById.mockResolvedValue(clientActor);
      const result = await adminUpdateCategory(mockCategoryRepo, mockActorLookup, mockIdempotency, { ...validCommand, actorId: 'client-1' });
      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error.code).toBe('ACTOR_NOT_AUTHORIZED');
      }
    });

    it('rechaza actor null', async () => {
      mockActorLookup.findById.mockResolvedValue(null);
      const result = await adminUpdateCategory(mockCategoryRepo, mockActorLookup, mockIdempotency, { ...validCommand, actorId: 'unknown' });
      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error.code).toBe('ACTOR_NOT_AUTHORIZED');
      }
    });

    it('rechaza admin con mustChangePassword', async () => {
      mockActorLookup.findById.mockResolvedValue(adminMustChange);
      const result = await adminUpdateCategory(mockCategoryRepo, mockActorLookup, mockIdempotency, { ...validCommand, actorId: 'admin-2' });
      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error.code).toBe('INITIAL_PASSWORD_CHANGE_REQUIRED');
      }
    });

    it('retorna error cuando categoría no existe', async () => {
      mockCategoryRepo.findById.mockResolvedValue(null);
      const result = await adminUpdateCategory(mockCategoryRepo, mockActorLookup, mockIdempotency, validCommand);
      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error.code).toBe('RESOURCE_NOT_FOUND');
      }
    });

    it('retorna versionMismatch cuando update retorna null', async () => {
      mockCategoryRepo.update.mockResolvedValue(null);
      const result = await adminUpdateCategory(mockCategoryRepo, mockActorLookup, mockIdempotency, validCommand);
      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error.code).toBe('VERSION_MISMATCH');
      }
    });

    it('retorna replay en idempotencia con mismo hash', async () => {
      const { createHash } = require('crypto');
      const bodyHash = createHash('sha256')
        .update(JSON.stringify({ name: 'Bebidas Actualizado', image_key: 'img/bebidas-nuevo.jpg', version: 1 }))
        .digest('hex');
      mockIdempotency.find.mockResolvedValue({
        scope: 'catalog-category-update:admin-1',
        idempotencyKey: 'key-upd-1',
        bodyHash,
        responseJson: { id: 'cat-1', name: 'Bebidas Actualizado', imageKey: 'img/bebidas-nuevo.jpg', version: 2 },
      });
      const result = await adminUpdateCategory(mockCategoryRepo, mockActorLookup, mockIdempotency, validCommand);
      expect(isSuccess(result)).toBe(true);
      expect(mockCategoryRepo.update).not.toHaveBeenCalled();
    });

    it('retorna error en idempotencia divergente', async () => {
      mockIdempotency.find.mockResolvedValue({
        scope: 'catalog-category-update:admin-1',
        idempotencyKey: 'key-upd-1',
        bodyHash: 'different-hash',
        responseJson: {},
      });
      const result = await adminUpdateCategory(mockCategoryRepo, mockActorLookup, mockIdempotency, validCommand);
      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
      }
    });

    it('retorna technicalFailure en excepción', async () => {
      mockActorLookup.findById.mockRejectedValue(new Error('DB error'));
      const result = await adminUpdateCategory(mockCategoryRepo, mockActorLookup, mockIdempotency, validCommand);
      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error.code).toBe('TECHNICAL_DEPENDENCY_FAILURE');
      }
    });
  });

  describe('adminDeleteCategory', () => {
    const validCommand = {
      actorId: 'admin-1',
      categoryId: 'cat-1',
      idempotencyKey: 'key-del-1',
    };

    it('elimina categoría con éxito', async () => {
      const result = await adminDeleteCategory(mockCategoryRepo, mockActorLookup, mockIdempotency, validCommand);
      expect(isSuccess(result)).toBe(true);
      expect(mockCategoryRepo.softDelete).toHaveBeenCalledWith('cat-1');
      expect(mockIdempotency.save).toHaveBeenCalled();
    });

    it('rechaza actor no admin', async () => {
      mockActorLookup.findById.mockResolvedValue(clientActor);
      const result = await adminDeleteCategory(mockCategoryRepo, mockActorLookup, mockIdempotency, { ...validCommand, actorId: 'client-1' });
      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error.code).toBe('ACTOR_NOT_AUTHORIZED');
      }
    });

    it('rechaza actor null', async () => {
      mockActorLookup.findById.mockResolvedValue(null);
      const result = await adminDeleteCategory(mockCategoryRepo, mockActorLookup, mockIdempotency, { ...validCommand, actorId: 'unknown' });
      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error.code).toBe('ACTOR_NOT_AUTHORIZED');
      }
    });

    it('rechaza admin con mustChangePassword', async () => {
      mockActorLookup.findById.mockResolvedValue(adminMustChange);
      const result = await adminDeleteCategory(mockCategoryRepo, mockActorLookup, mockIdempotency, { ...validCommand, actorId: 'admin-2' });
      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error.code).toBe('INITIAL_PASSWORD_CHANGE_REQUIRED');
      }
    });

    it('retorna error cuando categoría no existe', async () => {
      mockCategoryRepo.findById.mockResolvedValue(null);
      const result = await adminDeleteCategory(mockCategoryRepo, mockActorLookup, mockIdempotency, validCommand);
      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error.code).toBe('RESOURCE_NOT_FOUND');
      }
    });

    it('rechaza cuando categoría tiene productos activos', async () => {
      mockCategoryRepo.countActiveProducts.mockResolvedValue(3);
      const result = await adminDeleteCategory(mockCategoryRepo, mockActorLookup, mockIdempotency, validCommand);
      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error.code).toBe('INVALID_STATE_TRANSITION');
      }
    });

    it('rechaza cuando softDelete retorna false', async () => {
      mockCategoryRepo.softDelete.mockResolvedValue(false);
      const result = await adminDeleteCategory(mockCategoryRepo, mockActorLookup, mockIdempotency, validCommand);
      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error.code).toBe('INVALID_STATE_TRANSITION');
      }
    });

    it('retorna replay en idempotencia con mismo hash', async () => {
      const { createHash } = require('crypto');
      const bodyHash = createHash('sha256')
        .update(JSON.stringify({ category_id: 'cat-1' }))
        .digest('hex');
      mockIdempotency.find.mockResolvedValue({
        scope: 'catalog-category-delete:admin-1',
        idempotencyKey: 'key-del-1',
        bodyHash,
        responseJson: { deleted: true },
      });
      const result = await adminDeleteCategory(mockCategoryRepo, mockActorLookup, mockIdempotency, validCommand);
      expect(isSuccess(result)).toBe(true);
      expect(mockCategoryRepo.softDelete).not.toHaveBeenCalled();
    });

    it('retorna error en idempotencia divergente', async () => {
      mockIdempotency.find.mockResolvedValue({
        scope: 'catalog-category-delete:admin-1',
        idempotencyKey: 'key-del-1',
        bodyHash: 'different-hash',
        responseJson: {},
      });
      const result = await adminDeleteCategory(mockCategoryRepo, mockActorLookup, mockIdempotency, validCommand);
      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
      }
    });

    it('retorna technicalFailure en excepción', async () => {
      mockActorLookup.findById.mockRejectedValue(new Error('DB error'));
      const result = await adminDeleteCategory(mockCategoryRepo, mockActorLookup, mockIdempotency, validCommand);
      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error.code).toBe('TECHNICAL_DEPENDENCY_FAILURE');
      }
    });
  });
});
