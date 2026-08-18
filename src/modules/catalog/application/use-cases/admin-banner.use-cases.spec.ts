import { adminListBanners, adminCreateBanner, adminUpdateBanner, adminDeleteBanner } from './admin-banner.use-cases';
import { BannerRepositoryPort, BannerRecord } from '../../domain/ports/banner-repository.port';
import { ActorLookupPort, ActorInfo } from '../../domain/ports/actor-lookup.port';
import { CatalogIdempotencyPort } from '../../domain/ports/catalog-idempotency.port';
import { isSuccess, isFailure } from '../../../../shared/domain/result';

describe('admin banner use cases', () => {
  const adminActor: ActorInfo = { id: 'admin-1', role: 'admin', mustChangePassword: false };
  const adminMustChange: ActorInfo = { id: 'admin-2', role: 'admin', mustChangePassword: true };
  const clientActor: ActorInfo = { id: 'client-1', role: 'cliente', mustChangePassword: false };

  const mockBanner: BannerRecord = {
    id: 'banner-1',
    name: 'Banner Test',
    imageKey: 'media/banner.jpg',
    targetPath: '/products',
    displayOrder: 1,
    active: true,
    version: 1,
    deletedAt: null,
  };

  const mockBannerRepo: jest.Mocked<BannerRepositoryPort> = {
    listActive: jest.fn().mockResolvedValue([mockBanner]),
    listAll: jest.fn().mockResolvedValue([mockBanner]),
    findById: jest.fn().mockResolvedValue(mockBanner),
    create: jest.fn().mockResolvedValue(mockBanner),
    update: jest.fn().mockResolvedValue({ ...mockBanner, version: 2 }),
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
    mockBannerRepo.listActive.mockResolvedValue([mockBanner]);
    mockBannerRepo.listAll.mockResolvedValue([mockBanner]);
    mockBannerRepo.findById.mockResolvedValue(mockBanner);
    mockBannerRepo.create.mockResolvedValue(mockBanner);
    mockBannerRepo.update.mockResolvedValue({ ...mockBanner, version: 2 });
    mockBannerRepo.softDelete.mockResolvedValue(true);
    mockActorLookup.findById.mockResolvedValue(adminActor);
    mockIdempotency.find.mockResolvedValue(null);
  });

  describe('adminListBanners', () => {
    it('lista banners exitosamente', async () => {
      const result = await adminListBanners(mockBannerRepo);
      expect(isSuccess(result)).toBe(true);
      if (isSuccess(result)) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0].id).toBe('banner-1');
      }
    });

    it('retorna technicalFailure en excepción', async () => {
      mockBannerRepo.listAll.mockRejectedValue(new Error('DB down'));
      const result = await adminListBanners(mockBannerRepo);
      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error.code).toBe('TECHNICAL_DEPENDENCY_FAILURE');
      }
    });
  });

  describe('adminCreateBanner', () => {
    const validCommand = {
      actorId: 'admin-1',
      idempotencyKey: 'idem-b-1',
      name: 'Nuevo Banner',
      imageKey: 'media/new-banner.jpg',
      targetPath: '/catalog' as string | null,
      displayOrder: 2,
      active: true,
    };

    it('crea banner exitosamente', async () => {
      const result = await adminCreateBanner(mockBannerRepo, mockActorLookup, mockIdempotency, validCommand);
      expect(isSuccess(result)).toBe(true);
      expect(mockBannerRepo.create).toHaveBeenCalled();
      expect(mockIdempotency.save).toHaveBeenCalled();
    });

    it('rechaza actor no admin', async () => {
      mockActorLookup.findById.mockResolvedValue(clientActor);
      const result = await adminCreateBanner(mockBannerRepo, mockActorLookup, mockIdempotency, { ...validCommand, actorId: 'client-1' });
      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error.code).toBe('ACTOR_NOT_AUTHORIZED');
      }
    });

    it('rechaza actor null', async () => {
      mockActorLookup.findById.mockResolvedValue(null);
      const result = await adminCreateBanner(mockBannerRepo, mockActorLookup, mockIdempotency, { ...validCommand, actorId: 'unknown' });
      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error.code).toBe('ACTOR_NOT_AUTHORIZED');
      }
    });

    it('rechaza admin con mustChangePassword', async () => {
      mockActorLookup.findById.mockResolvedValue(adminMustChange);
      const result = await adminCreateBanner(mockBannerRepo, mockActorLookup, mockIdempotency, { ...validCommand, actorId: 'admin-2' });
      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error.code).toBe('INITIAL_PASSWORD_CHANGE_REQUIRED');
      }
    });

    it('retorna replay en idempotencia con mismo hash', async () => {
      const { createHash } = require('crypto');
      const bodyHash = createHash('sha256')
        .update(JSON.stringify({
          name: 'Nuevo Banner',
          image_key: 'media/new-banner.jpg',
          target_path: '/catalog',
          display_order: 2,
          active: true,
        }))
        .digest('hex');
      mockIdempotency.find.mockResolvedValue({
        scope: 'catalog-banner-create:admin-1',
        idempotencyKey: 'idem-b-1',
        bodyHash,
        responseJson: { id: 'banner-1', name: 'Nuevo Banner' },
      });
      const result = await adminCreateBanner(mockBannerRepo, mockActorLookup, mockIdempotency, validCommand);
      expect(isSuccess(result)).toBe(true);
      expect(mockBannerRepo.create).not.toHaveBeenCalled();
    });

    it('retorna error en idempotencia divergente', async () => {
      mockIdempotency.find.mockResolvedValue({
        scope: 'catalog-banner-create:admin-1',
        idempotencyKey: 'idem-b-1',
        bodyHash: 'different-hash',
        responseJson: {},
      });
      const result = await adminCreateBanner(mockBannerRepo, mockActorLookup, mockIdempotency, validCommand);
      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
      }
    });

    it('retorna technicalFailure en excepción', async () => {
      mockActorLookup.findById.mockRejectedValue(new Error('DB error'));
      const result = await adminCreateBanner(mockBannerRepo, mockActorLookup, mockIdempotency, validCommand);
      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error.code).toBe('TECHNICAL_DEPENDENCY_FAILURE');
      }
    });
  });

  describe('adminUpdateBanner', () => {
    const validCommand = {
      actorId: 'admin-1',
      bannerId: 'banner-1',
      expectedVersion: 1,
      idempotencyKey: 'idem-upd-b-1',
      name: 'Banner Actualizado',
      imageKey: 'media/updated-banner.jpg',
      targetPath: '/catalog' as string | null,
      displayOrder: 3,
      active: false,
    };

    it('actualiza banner exitosamente', async () => {
      const result = await adminUpdateBanner(mockBannerRepo, mockActorLookup, mockIdempotency, validCommand);
      expect(isSuccess(result)).toBe(true);
      expect(mockBannerRepo.update).toHaveBeenCalled();
      expect(mockIdempotency.save).toHaveBeenCalled();
    });

    it('rechaza actor no admin', async () => {
      mockActorLookup.findById.mockResolvedValue(clientActor);
      const result = await adminUpdateBanner(mockBannerRepo, mockActorLookup, mockIdempotency, { ...validCommand, actorId: 'client-1' });
      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error.code).toBe('ACTOR_NOT_AUTHORIZED');
      }
    });

    it('rechaza admin con mustChangePassword', async () => {
      mockActorLookup.findById.mockResolvedValue(adminMustChange);
      const result = await adminUpdateBanner(mockBannerRepo, mockActorLookup, mockIdempotency, { ...validCommand, actorId: 'admin-2' });
      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error.code).toBe('INITIAL_PASSWORD_CHANGE_REQUIRED');
      }
    });

    it('retorna error cuando banner no existe', async () => {
      mockBannerRepo.findById.mockResolvedValue(null);
      const result = await adminUpdateBanner(mockBannerRepo, mockActorLookup, mockIdempotency, validCommand);
      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error.code).toBe('RESOURCE_NOT_FOUND');
      }
    });

    it('retorna versionMismatch cuando update retorna null', async () => {
      mockBannerRepo.update.mockResolvedValue(null);
      const result = await adminUpdateBanner(mockBannerRepo, mockActorLookup, mockIdempotency, validCommand);
      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error.code).toBe('VERSION_MISMATCH');
      }
    });

    it('retorna replay en idempotencia con mismo hash', async () => {
      const { createHash } = require('crypto');
      const bodyHash = createHash('sha256')
        .update(JSON.stringify({
          name: 'Banner Actualizado',
          image_key: 'media/updated-banner.jpg',
          target_path: '/catalog',
          display_order: 3,
          active: false,
          version: 1,
        }))
        .digest('hex');
      mockIdempotency.find.mockResolvedValue({
        scope: 'catalog-banner-update:admin-1',
        idempotencyKey: 'idem-upd-b-1',
        bodyHash,
        responseJson: { id: 'banner-1', name: 'Banner Actualizado' },
      });
      const result = await adminUpdateBanner(mockBannerRepo, mockActorLookup, mockIdempotency, validCommand);
      expect(isSuccess(result)).toBe(true);
      expect(mockBannerRepo.update).not.toHaveBeenCalled();
    });

    it('retorna error en idempotencia divergente', async () => {
      mockIdempotency.find.mockResolvedValue({
        scope: 'catalog-banner-update:admin-1',
        idempotencyKey: 'idem-upd-b-1',
        bodyHash: 'different-hash',
        responseJson: {},
      });
      const result = await adminUpdateBanner(mockBannerRepo, mockActorLookup, mockIdempotency, validCommand);
      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
      }
    });

    it('retorna technicalFailure en excepción', async () => {
      mockActorLookup.findById.mockRejectedValue(new Error('DB error'));
      const result = await adminUpdateBanner(mockBannerRepo, mockActorLookup, mockIdempotency, validCommand);
      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error.code).toBe('TECHNICAL_DEPENDENCY_FAILURE');
      }
    });
  });

  describe('adminDeleteBanner', () => {
    const validCommand = {
      actorId: 'admin-1',
      bannerId: 'banner-1',
      idempotencyKey: 'idem-del-b-1',
    };

    it('elimina banner exitosamente', async () => {
      const result = await adminDeleteBanner(mockBannerRepo, mockActorLookup, mockIdempotency, validCommand);
      expect(isSuccess(result)).toBe(true);
      expect(mockBannerRepo.softDelete).toHaveBeenCalledWith('banner-1');
      expect(mockIdempotency.save).toHaveBeenCalled();
    });

    it('rechaza actor no admin', async () => {
      mockActorLookup.findById.mockResolvedValue(clientActor);
      const result = await adminDeleteBanner(mockBannerRepo, mockActorLookup, mockIdempotency, { ...validCommand, actorId: 'client-1' });
      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error.code).toBe('ACTOR_NOT_AUTHORIZED');
      }
    });

    it('rechaza actor null', async () => {
      mockActorLookup.findById.mockResolvedValue(null);
      const result = await adminDeleteBanner(mockBannerRepo, mockActorLookup, mockIdempotency, { ...validCommand, actorId: 'unknown' });
      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error.code).toBe('ACTOR_NOT_AUTHORIZED');
      }
    });

    it('rechaza admin con mustChangePassword', async () => {
      mockActorLookup.findById.mockResolvedValue(adminMustChange);
      const result = await adminDeleteBanner(mockBannerRepo, mockActorLookup, mockIdempotency, { ...validCommand, actorId: 'admin-2' });
      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error.code).toBe('INITIAL_PASSWORD_CHANGE_REQUIRED');
      }
    });

    it('retorna error cuando banner no existe', async () => {
      mockBannerRepo.findById.mockResolvedValue(null);
      const result = await adminDeleteBanner(mockBannerRepo, mockActorLookup, mockIdempotency, validCommand);
      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error.code).toBe('RESOURCE_NOT_FOUND');
      }
    });

    it('retorna replay en idempotencia con mismo hash', async () => {
      const { createHash } = require('crypto');
      const bodyHash = createHash('sha256')
        .update(JSON.stringify({ banner_id: 'banner-1' }))
        .digest('hex');
      mockIdempotency.find.mockResolvedValue({
        scope: 'catalog-banner-delete:admin-1',
        idempotencyKey: 'idem-del-b-1',
        bodyHash,
        responseJson: { deleted: true },
      });
      const result = await adminDeleteBanner(mockBannerRepo, mockActorLookup, mockIdempotency, validCommand);
      expect(isSuccess(result)).toBe(true);
      expect(mockBannerRepo.softDelete).not.toHaveBeenCalled();
    });

    it('retorna error en idempotencia divergente', async () => {
      mockIdempotency.find.mockResolvedValue({
        scope: 'catalog-banner-delete:admin-1',
        idempotencyKey: 'idem-del-b-1',
        bodyHash: 'different-hash',
        responseJson: {},
      });
      const result = await adminDeleteBanner(mockBannerRepo, mockActorLookup, mockIdempotency, validCommand);
      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
      }
    });

    it('retorna technicalFailure en excepción', async () => {
      mockActorLookup.findById.mockRejectedValue(new Error('DB error'));
      const result = await adminDeleteBanner(mockBannerRepo, mockActorLookup, mockIdempotency, validCommand);
      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error.code).toBe('TECHNICAL_DEPENDENCY_FAILURE');
      }
    });
  });
});
