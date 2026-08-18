import { adminCreateStockAdjustment } from './admin-stock-adjustment.use-case';
import { ActorLookupPort, ActorInfo } from '../../domain/ports/actor-lookup.port';
import { CatalogIdempotencyPort } from '../../domain/ports/catalog-idempotency.port';
import { StockAdjustmentRepositoryPort, StockAdjustmentRecord } from '../../domain/ports/stock-adjustment-repository.port';
import { StockAdjustmentProductLockPort, ProductLockRecord } from '../../domain/ports/stock-adjustment-product-lock.port';
import { Result, isSuccess } from '../../../../shared/domain/result';

describe('adminCreateStockAdjustment', () => {
  const adminActor: ActorInfo = { id: 'admin-1', role: 'admin', mustChangePassword: false };
  const adminMustChange: ActorInfo = { id: 'admin-2', role: 'admin', mustChangePassword: true };
  const clientActor: ActorInfo = { id: 'client-1', role: 'cliente', mustChangePassword: false };

  const mockProduct: ProductLockRecord = {
    id: 'prod-1',
    stockOnHand: 100,
    stockReserved: 20,
  };

  const mockAdjustment: StockAdjustmentRecord = {
    id: 'adj-1',
    productId: 'prod-1',
    adminUserId: 'admin-1',
    quantityDelta: 10,
    reason: 'Reposición de inventario',
    stockOnHandBefore: 100,
    stockOnHandAfter: 110,
    stockReserved: 20,
    stockAvailable: 90,
    idempotencyKey: 'key-1',
    createdAt: new Date('2026-08-17T10:00:00Z'),
  };

  let mockActorLookup: ActorLookupPort;
  let mockIdempotency: CatalogIdempotencyPort;
  let mockProductLock: StockAdjustmentProductLockPort;
  let mockStockAdjustmentRepo: StockAdjustmentRepositoryPort;

  beforeEach(() => {
    mockActorLookup = {
      findById: jest.fn().mockResolvedValue(adminActor),
    };
    mockIdempotency = {
      find: jest.fn().mockResolvedValue(null),
      findForUpdate: jest.fn().mockResolvedValue(null),
      save: jest.fn(),
    };
    mockProductLock = {
      lockForUpdate: jest.fn().mockResolvedValue(mockProduct),
      updateStockOnHand: jest.fn().mockResolvedValue(true),
    };
    mockStockAdjustmentRepo = {
      insert: jest.fn().mockResolvedValue(mockAdjustment),
    };
  });

  it('creates stock adjustment successfully', async () => {
    const result = await adminCreateStockAdjustment(
      mockActorLookup,
      mockIdempotency,
      mockProductLock,
      mockStockAdjustmentRepo,
      {
        actorId: 'admin-1',
        productId: 'prod-1',
        idempotencyKey: 'key-1',
        quantityDelta: 10,
        reason: 'Reposición de inventario',
      },
    );
    expect(isSuccess(result)).toBe(true);
    expect(mockProductLock.lockForUpdate).toHaveBeenCalledWith('prod-1');
    expect(mockProductLock.updateStockOnHand).toHaveBeenCalledWith('prod-1', 110);
    expect(mockStockAdjustmentRepo.insert).toHaveBeenCalled();
    expect(mockIdempotency.save).toHaveBeenCalled();
  });

  it('rejects non-admin actor', async () => {
    (mockActorLookup.findById as jest.Mock).mockResolvedValue(clientActor);
    const result = await adminCreateStockAdjustment(
      mockActorLookup,
      mockIdempotency,
      mockProductLock,
      mockStockAdjustmentRepo,
      {
        actorId: 'client-1',
        productId: 'prod-1',
        idempotencyKey: 'key-1',
        quantityDelta: 10,
        reason: 'Reposición de inventario',
      },
    );
    expect(!isSuccess(result)).toBe(true);
    if (!isSuccess(result)) {
      expect(result.error.code).toBe('ACTOR_NOT_AUTHORIZED');
    }
  });

  it('rejects admin with must_change_password', async () => {
    (mockActorLookup.findById as jest.Mock).mockResolvedValue(adminMustChange);
    const result = await adminCreateStockAdjustment(
      mockActorLookup,
      mockIdempotency,
      mockProductLock,
      mockStockAdjustmentRepo,
      {
        actorId: 'admin-2',
        productId: 'prod-1',
        idempotencyKey: 'key-1',
        quantityDelta: 10,
        reason: 'Reposición de inventario',
      },
    );
    expect(!isSuccess(result)).toBe(true);
    if (!isSuccess(result)) {
      expect(result.error.code).toBe('INITIAL_PASSWORD_CHANGE_REQUIRED');
    }
  });

  it('returns replay on idempotent request', async () => {
    const { createHash } = require('crypto');
    const bodyHash = createHash('sha256')
      .update(JSON.stringify({
        product_id: 'prod-1',
        quantity_delta: 10,
        reason: 'Reposición de inventario',
      }))
      .digest('hex');
    const existingResponse = {
      id: 'adj-1',
      product_id: 'prod-1',
      quantity_delta: 10,
      reason: 'Reposición de inventario',
      stock_on_hand_before: 100,
      stock_on_hand_after: 110,
      stock_reserved: 20,
      stock_available: 90,
      created_at: '2026-08-17T10:00:00.000Z',
    };
    (mockIdempotency.find as jest.Mock).mockResolvedValue({
      scope: 'catalog-stock-adjustment:admin-1',
      idempotencyKey: 'key-1',
      bodyHash,
      responseJson: existingResponse,
    });
    const result = await adminCreateStockAdjustment(
      mockActorLookup,
      mockIdempotency,
      mockProductLock,
      mockStockAdjustmentRepo,
      {
        actorId: 'admin-1',
        productId: 'prod-1',
        idempotencyKey: 'key-1',
        quantityDelta: 10,
        reason: 'Reposición de inventario',
      },
    );
    expect(isSuccess(result)).toBe(true);
    expect(mockProductLock.lockForUpdate).not.toHaveBeenCalled();
  });

  it('rejects divergent idempotent request', async () => {
    const { createHash } = require('crypto');
    const bodyHash = createHash('sha256')
      .update(JSON.stringify({
        product_id: 'prod-1',
        quantity_delta: 20,
        reason: 'Diferente razón',
      }))
      .digest('hex');
    (mockIdempotency.find as jest.Mock).mockResolvedValue({
      scope: 'catalog-stock-adjustment:admin-1',
      idempotencyKey: 'key-1',
      bodyHash,
      responseJson: {},
    });
    const result = await adminCreateStockAdjustment(
      mockActorLookup,
      mockIdempotency,
      mockProductLock,
      mockStockAdjustmentRepo,
      {
        actorId: 'admin-1',
        productId: 'prod-1',
        idempotencyKey: 'key-1',
        quantityDelta: 10,
        reason: 'Reposición de inventario',
      },
    );
    expect(!isSuccess(result)).toBe(true);
    if (!isSuccess(result)) {
      expect(result.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
    }
  });

  it('rejects when product not found', async () => {
    (mockProductLock.lockForUpdate as jest.Mock).mockResolvedValue(null);
    const result = await adminCreateStockAdjustment(
      mockActorLookup,
      mockIdempotency,
      mockProductLock,
      mockStockAdjustmentRepo,
      {
        actorId: 'admin-1',
        productId: 'prod-nonexistent',
        idempotencyKey: 'key-1',
        quantityDelta: 10,
        reason: 'Reposición de inventario',
      },
    );
    expect(!isSuccess(result)).toBe(true);
    if (!isSuccess(result)) {
      expect(result.error.code).toBe('RESOURCE_NOT_FOUND');
    }
  });

  it('rejects when stock would go below reserved', async () => {
    (mockProductLock.lockForUpdate as jest.Mock).mockResolvedValue({
      id: 'prod-1',
      stockOnHand: 100,
      stockReserved: 95,
    });
    const result = await adminCreateStockAdjustment(
      mockActorLookup,
      mockIdempotency,
      mockProductLock,
      mockStockAdjustmentRepo,
      {
        actorId: 'admin-1',
        productId: 'prod-1',
        idempotencyKey: 'key-1',
        quantityDelta: -10,
        reason: 'Ajuste de descuento',
      },
    );
    expect(!isSuccess(result)).toBe(true);
    if (!isSuccess(result)) {
      expect(result.error.code).toBe('STOCK_INSUFFICIENT');
    }
  });

  it('allows negative delta when result stays above reserved', async () => {
    const result = await adminCreateStockAdjustment(
      mockActorLookup,
      mockIdempotency,
      mockProductLock,
      mockStockAdjustmentRepo,
      {
        actorId: 'admin-1',
        productId: 'prod-1',
        idempotencyKey: 'key-1',
        quantityDelta: -5,
        reason: 'Ajuste de descuento',
      },
    );
    expect(isSuccess(result)).toBe(true);
    expect(mockProductLock.updateStockOnHand).toHaveBeenCalledWith('prod-1', 95);
  });

  it('allows zero result when reserved is zero', async () => {
    (mockProductLock.lockForUpdate as jest.Mock).mockResolvedValue({
      id: 'prod-1',
      stockOnHand: 100,
      stockReserved: 0,
    });
    const result = await adminCreateStockAdjustment(
      mockActorLookup,
      mockIdempotency,
      mockProductLock,
      mockStockAdjustmentRepo,
      {
        actorId: 'admin-1',
        productId: 'prod-1',
        idempotencyKey: 'key-1',
        quantityDelta: -100,
        reason: 'Ajuste completo',
      },
    );
    expect(isSuccess(result)).toBe(true);
    expect(mockProductLock.updateStockOnHand).toHaveBeenCalledWith('prod-1', 0);
  });
});
