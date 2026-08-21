import { ok, fail } from '../../shared/domain/result';
import { HttpException } from '@nestjs/common';

jest.mock('./application/use-cases/list-categories.use-case', () => ({ listCategories: jest.fn() }));
jest.mock('./application/use-cases/list-products.use-case', () => ({ listProducts: jest.fn() }));
jest.mock('./application/use-cases/get-product.use-case', () => ({ getProduct: jest.fn() }));
jest.mock('./application/use-cases/list-active-banners.use-case', () => ({ listActiveBanners: jest.fn() }));
jest.mock('./application/use-cases/admin-category.use-cases', () => ({
  adminListCategories: jest.fn(), adminCreateCategory: jest.fn(),
  adminUpdateCategory: jest.fn(), adminDeleteCategory: jest.fn(),
}));
jest.mock('./application/use-cases/admin-product.use-cases', () => ({
  adminListProducts: jest.fn(), adminCreateProduct: jest.fn(),
  adminUpdateProduct: jest.fn(), adminDeleteProduct: jest.fn(),
}));
jest.mock('./application/use-cases/admin-banner.use-cases', () => ({
  adminListBanners: jest.fn(), adminCreateBanner: jest.fn(),
  adminUpdateBanner: jest.fn(), adminDeleteBanner: jest.fn(),
}));
jest.mock('./application/use-cases/admin-stock-adjustment.use-case', () => ({ adminCreateStockAdjustment: jest.fn() }));
jest.mock('../../contract/validation/request-validators');
jest.mock('../../contract/validation/header-validators');

import { CatalogController } from './catalog.controller';
import * as listCategoriesFn from './application/use-cases/list-categories.use-case';
import * as listProductsFn from './application/use-cases/list-products.use-case';
import * as getProductFn from './application/use-cases/get-product.use-case';
import * as listActiveBannersFn from './application/use-cases/list-active-banners.use-case';
import * as adminCategoryFns from './application/use-cases/admin-category.use-cases';
import * as adminProductFns from './application/use-cases/admin-product.use-cases';
import * as adminBannerFns from './application/use-cases/admin-banner.use-cases';
import * as adminStockAdjFn from './application/use-cases/admin-stock-adjustment.use-case';
import * as requestValidators from '../../contract/validation/request-validators';
import * as headerValidators from '../../contract/validation/header-validators';

function req(overrides: Record<string, any> = {}): any {
  return { headers: {}, query: {}, user: { id: 'admin-1' }, path: '/', originalUrl: '/', ...overrides };
}

const VALID_UUID = '11111111-1111-4111-8111-111111111111';
const TECH_FAIL = fail({ code: 'TECHNICAL_DEPENDENCY_FAILURE', kind: 'technical', messageKey: 'technical' });
const FAIL = () => (expected: any) => expect(Promise.reject(expected)).rejects.toThrow(HttpException);

describe('CatalogController', () => {
  let ports: any;
  let c: CatalogController;

  beforeEach(() => {
    jest.clearAllMocks();
    ports = { categoryRepo: {}, productRepo: {}, bannerRepo: {}, idempotencyPort: {}, actorLookup: {}, stockAdjustmentRepo: {}, productLockPort: {} };
    c = new CatalogController(ports.categoryRepo, ports.productRepo, ports.bannerRepo, ports.idempotencyPort, ports.actorLookup, ports.stockAdjustmentRepo, ports.productLockPort);
    (requestValidators.validateCategoryWriteRequest as jest.Mock).mockReturnValue({ valid: true, issues: [] });
    (requestValidators.validateProductWriteRequest as jest.Mock).mockReturnValue({ valid: true, issues: [] });
    (requestValidators.validateProductUpdateRequest as jest.Mock).mockReturnValue({ valid: true, issues: [] });
    (requestValidators.validateBannerWriteRequest as jest.Mock).mockReturnValue({ valid: true, issues: [] });
    (requestValidators.validateStockAdjustmentRequest as jest.Mock).mockReturnValue({ valid: true, issues: [] });
    (headerValidators.validateIdempotencyKey as jest.Mock).mockReturnValue({ valid: true });
    (headerValidators.validateIfMatch as jest.Mock).mockReturnValue({ valid: true });
  });

  describe('Public GET /categories', () => {
    it('ok', async () => {
      (listCategoriesFn.listCategories as jest.Mock).mockResolvedValue(ok([{ id: 'c1', name: 'F', imageKey: 'i', version: 1 }]));
      expect(await c.listCategories(req())).toEqual([expect.objectContaining({ id: 'c1' })]);
    });
    it('error', async () => {
      (listCategoriesFn.listCategories as jest.Mock).mockResolvedValue(TECH_FAIL);
      await expect(c.listCategories(req())).rejects.toThrow(HttpException);
    });
  });

  describe('Public GET /products', () => {
    const item = { id: 'p1', category: { id: 'c1', name: 'F' }, name: 'M', description: '', regularPriceCop: 1, salePriceCop: 1, unit: 'u', stockAvailable: 1, images: [], version: 1 };
    it('ok', async () => {
      (listProductsFn.listProducts as jest.Mock).mockResolvedValue(ok({ items: [item], page: 1, size: 20, total: 1 }));
      expect(await c.listProducts(undefined, undefined, undefined, undefined, req())).toBeDefined();
    });
    it('con page/size', async () => {
      (listProductsFn.listProducts as jest.Mock).mockResolvedValue(ok({ items: [], page: 2, size: 10, total: 0 }));
      expect(await c.listProducts('2', '10', undefined, undefined, req())).toBeDefined();
    });
    it('error', async () => {
      (listProductsFn.listProducts as jest.Mock).mockResolvedValue(TECH_FAIL);
      await expect(c.listProducts(undefined, undefined, undefined, undefined, req())).rejects.toThrow(HttpException);
    });
  });

  describe('Public GET /products/:id', () => {
    it('ok', async () => {
      (getProductFn.getProduct as jest.Mock).mockResolvedValue(ok({ id: 'p1', category: { id: 'c1', name: 'F' }, name: 'M', description: '', regularPriceCop: 1, salePriceCop: 1, unit: 'u', stockAvailable: 1, images: [], version: 1 }));
      expect(await c.getProduct('p1', req())).toBeDefined();
    });
    it('not found', async () => {
      (getProductFn.getProduct as jest.Mock).mockResolvedValue(fail({ code: 'RESOURCE_NOT_FOUND', kind: 'domain', messageKey: 'not.found' }));
      await expect(c.getProduct('x', req())).rejects.toThrow(HttpException);
    });
  });

  describe('Public GET /banners', () => {
    it('ok', async () => {
      (listActiveBannersFn.listActiveBanners as jest.Mock).mockResolvedValue(ok([{ id: 'b1', name: 'B', imageKey: 'i', targetPath: '/', displayOrder: 1, active: true, version: 1 }]));
      expect(await c.listActiveBanners(req())).toBeDefined();
    });
    it('error', async () => {
      (listActiveBannersFn.listActiveBanners as jest.Mock).mockResolvedValue(TECH_FAIL);
      await expect(c.listActiveBanners(req())).rejects.toThrow(HttpException);
    });
  });

  describe('Admin GET /admin/categories', () => {
    it('ok', async () => {
      (adminCategoryFns.adminListCategories as jest.Mock).mockResolvedValue(ok([{ id: 'c1', name: 'F', imageKey: 'i', version: 1 }]));
      expect(await c.adminListCategories(req())).toBeDefined();
    });
    it('error', async () => {
      (adminCategoryFns.adminListCategories as jest.Mock).mockResolvedValue(TECH_FAIL);
      await expect(c.adminListCategories(req())).rejects.toThrow(HttpException);
    });
  });

  describe('Admin POST /admin/categories', () => {
    it('ok', async () => {
      (adminCategoryFns.adminCreateCategory as jest.Mock).mockResolvedValue(ok({ id: 'c1', name: 'V', imageKey: 'i', version: 1 }));
      expect(await c.adminCreateCategory({ name: 'V', image_key: 'i' }, VALID_UUID, req())).toBeDefined();
    });
    it('error', async () => {
      (adminCategoryFns.adminCreateCategory as jest.Mock).mockResolvedValue(TECH_FAIL);
      await expect(c.adminCreateCategory({ name: 'V', image_key: 'i' }, VALID_UUID, req())).rejects.toThrow(HttpException);
    });
  });

  describe('Admin PATCH /admin/categories/:id', () => {
    it('ok', async () => {
      (adminCategoryFns.adminUpdateCategory as jest.Mock).mockResolvedValue(ok({ id: 'c1', name: 'N', imageKey: 'i', version: 2 }));
      expect(await c.adminUpdateCategory('c1', { name: 'N', image_key: 'i' }, '1', VALID_UUID, req())).toBeDefined();
    });
    it('bad if-match', async () => {
      (headerValidators.validateIfMatch as jest.Mock).mockReturnValue({ valid: false });
      await expect(c.adminUpdateCategory('c1', { name: 'N', image_key: 'i' }, 'bad', VALID_UUID, req())).rejects.toThrow(HttpException);
    });
    it('bad idempotency', async () => {
      (headerValidators.validateIdempotencyKey as jest.Mock).mockReturnValue({ valid: false });
      await expect(c.adminUpdateCategory('c1', { name: 'N', image_key: 'i' }, '1', 'bad', req())).rejects.toThrow(HttpException);
    });
    it('error', async () => {
      (adminCategoryFns.adminUpdateCategory as jest.Mock).mockResolvedValue(TECH_FAIL);
      await expect(c.adminUpdateCategory('c1', { name: 'N', image_key: 'i' }, '1', VALID_UUID, req())).rejects.toThrow(HttpException);
    });
  });

  describe('Admin DELETE /admin/categories/:id', () => {
    it('ok', async () => {
      (adminCategoryFns.adminDeleteCategory as jest.Mock).mockResolvedValue(ok(undefined));
      await expect(c.adminDeleteCategory('c1', VALID_UUID, req())).resolves.toBeUndefined();
    });
    it('error', async () => {
      (adminCategoryFns.adminDeleteCategory as jest.Mock).mockResolvedValue(TECH_FAIL);
      await expect(c.adminDeleteCategory('c1', VALID_UUID, req())).rejects.toThrow(HttpException);
    });
  });

  describe('Admin GET /admin/products', () => {
    it('ok', async () => {
      (adminProductFns.adminListProducts as jest.Mock).mockResolvedValue(ok({ items: [{ id: 'p1', categoryId: 'c1', name: 'M', description: '', regularPriceCop: 1, salePriceCop: 1, unit: 'u', stockOnHand: 1, stockReserved: 0, images: [], version: 1 }], page: 1, size: 20, total: 1 }));
      expect(await c.adminListProducts('1', '10', req())).toBeDefined();
    });
    it('error', async () => {
      (adminProductFns.adminListProducts as jest.Mock).mockResolvedValue(TECH_FAIL);
      await expect(c.adminListProducts('1', '10', req())).rejects.toThrow(HttpException);
    });
  });

  describe('Admin POST /admin/products', () => {
    it('ok', async () => {
      (adminProductFns.adminCreateProduct as jest.Mock).mockResolvedValue(ok({ id: 'p1', categoryId: 'c1', name: 'N', description: '', regularPriceCop: 1, salePriceCop: 1, unit: 'u', stockOnHand: 1, stockReserved: 0, images: [], version: 1 }));
      expect(await c.adminCreateProduct({ category_id: 'c1', name: 'N', description: '', regular_price_cop: 1, sale_price_cop: 1, unit: 'u', images: [] }, VALID_UUID, req())).toBeDefined();
    });
    it('error', async () => {
      (adminProductFns.adminCreateProduct as jest.Mock).mockResolvedValue(TECH_FAIL);
      await expect(c.adminCreateProduct({ category_id: 'c1', name: 'N', description: '', regular_price_cop: 1, sale_price_cop: 1, unit: 'u', images: [] }, VALID_UUID, req())).rejects.toThrow(HttpException);
    });
  });

  describe('Admin PATCH /admin/products/:id', () => {
    it('ok', async () => {
      (adminProductFns.adminUpdateProduct as jest.Mock).mockResolvedValue(ok({ id: 'p1', categoryId: 'c1', name: 'V2', description: '', regularPriceCop: 1, salePriceCop: 1, unit: 'u', stockOnHand: 1, stockReserved: 0, images: [], version: 2 }));
      expect(await c.adminUpdateProduct('p1', { category_id: 'c1', name: 'V2', description: '', regular_price_cop: 1, sale_price_cop: 1, unit: 'u', images: [] }, '1', VALID_UUID, req())).toBeDefined();
    });
    it('bad if-match', async () => {
      (headerValidators.validateIfMatch as jest.Mock).mockReturnValue({ valid: false });
      await expect(c.adminUpdateProduct('p1', { category_id: 'c1', name: 'M', description: '', regular_price_cop: 1, sale_price_cop: 1, unit: 'u', images: [] }, 'bad', VALID_UUID, req())).rejects.toThrow(HttpException);
    });
    it('bad idempotency', async () => {
      (headerValidators.validateIdempotencyKey as jest.Mock).mockReturnValue({ valid: false });
      await expect(c.adminUpdateProduct('p1', { category_id: 'c1', name: 'M', description: '', regular_price_cop: 1, sale_price_cop: 1, unit: 'u', images: [] }, '1', 'bad', req())).rejects.toThrow(HttpException);
    });
    it('error', async () => {
      (adminProductFns.adminUpdateProduct as jest.Mock).mockResolvedValue(TECH_FAIL);
      await expect(c.adminUpdateProduct('p1', { category_id: 'c1', name: 'M', description: '', regular_price_cop: 1, sale_price_cop: 1, unit: 'u', images: [] }, '1', VALID_UUID, req())).rejects.toThrow(HttpException);
    });
  });

  describe('Admin DELETE /admin/products/:id', () => {
    it('ok', async () => {
      (adminProductFns.adminDeleteProduct as jest.Mock).mockResolvedValue(ok(undefined));
      await expect(c.adminDeleteProduct('p1', VALID_UUID, req())).resolves.toBeUndefined();
    });
    it('error', async () => {
      (adminProductFns.adminDeleteProduct as jest.Mock).mockResolvedValue(TECH_FAIL);
      await expect(c.adminDeleteProduct('p1', VALID_UUID, req())).rejects.toThrow(HttpException);
    });
  });

  describe('Admin POST /admin/products/:id/stock-adjustments', () => {
    it('ok', async () => {
      (adminStockAdjFn.adminCreateStockAdjustment as jest.Mock).mockResolvedValue(ok({ id: 'sa1', product_id: 'p1', quantity_delta: 10, reason: 'R', stock_on_hand_before: 50, stock_on_hand_after: 60, stock_reserved: 0, stock_available: 60, created_at: new Date() }));
      expect(await c.adminCreateStockAdjustment('p1', { quantity_delta: 10, reason: 'R' }, VALID_UUID, req())).toBeDefined();
    });
    it('error', async () => {
      (adminStockAdjFn.adminCreateStockAdjustment as jest.Mock).mockResolvedValue(TECH_FAIL);
      await expect(c.adminCreateStockAdjustment('p1', { quantity_delta: 10, reason: 'R' }, VALID_UUID, req())).rejects.toThrow(HttpException);
    });
  });

  describe('Admin GET /admin/banners', () => {
    it('ok', async () => {
      (adminBannerFns.adminListBanners as jest.Mock).mockResolvedValue(ok([{ id: 'b1', name: 'B', imageKey: 'i', targetPath: '/', displayOrder: 1, active: true, version: 1 }]));
      expect(await c.adminListBanners(req())).toBeDefined();
    });
    it('error', async () => {
      (adminBannerFns.adminListBanners as jest.Mock).mockResolvedValue(TECH_FAIL);
      await expect(c.adminListBanners(req())).rejects.toThrow(HttpException);
    });
  });

  describe('Admin POST /admin/banners', () => {
    it('ok', async () => {
      (adminBannerFns.adminCreateBanner as jest.Mock).mockResolvedValue(ok({ id: 'b1', name: 'B', imageKey: 'i', targetPath: '/', displayOrder: 1, active: true, version: 1 }));
      expect(await c.adminCreateBanner({ name: 'B', image_key: 'i', display_order: 1, active: true }, VALID_UUID, req())).toBeDefined();
    });
    it('error', async () => {
      (adminBannerFns.adminCreateBanner as jest.Mock).mockResolvedValue(TECH_FAIL);
      await expect(c.adminCreateBanner({ name: 'B', image_key: 'i', display_order: 1, active: true }, VALID_UUID, req())).rejects.toThrow(HttpException);
    });
  });

  describe('Admin PATCH /admin/banners/:id', () => {
    it('ok', async () => {
      (adminBannerFns.adminUpdateBanner as jest.Mock).mockResolvedValue(ok({ id: 'b1', name: 'A', imageKey: 'i', targetPath: null, displayOrder: 1, active: true, version: 2 }));
      expect(await c.adminUpdateBanner('b1', { name: 'A', image_key: 'i', display_order: 1, active: true }, '1', VALID_UUID, req())).toBeDefined();
    });
    it('bad if-match', async () => {
      (headerValidators.validateIfMatch as jest.Mock).mockReturnValue({ valid: false });
      await expect(c.adminUpdateBanner('b1', { name: 'B', image_key: 'i', display_order: 1, active: true }, 'bad', VALID_UUID, req())).rejects.toThrow(HttpException);
    });
    it('bad idempotency', async () => {
      (headerValidators.validateIdempotencyKey as jest.Mock).mockReturnValue({ valid: false });
      await expect(c.adminUpdateBanner('b1', { name: 'B', image_key: 'i', display_order: 1, active: true }, '1', 'bad', req())).rejects.toThrow(HttpException);
    });
    it('error', async () => {
      (adminBannerFns.adminUpdateBanner as jest.Mock).mockResolvedValue(TECH_FAIL);
      await expect(c.adminUpdateBanner('b1', { name: 'B', image_key: 'i', display_order: 1, active: true }, '1', VALID_UUID, req())).rejects.toThrow(HttpException);
    });
  });

  describe('Admin DELETE /admin/banners/:id', () => {
    it('ok', async () => {
      (adminBannerFns.adminDeleteBanner as jest.Mock).mockResolvedValue(ok(undefined));
      await expect(c.adminDeleteBanner('b1', VALID_UUID, req())).resolves.toBeUndefined();
    });
    it('error', async () => {
      (adminBannerFns.adminDeleteBanner as jest.Mock).mockResolvedValue(TECH_FAIL);
      await expect(c.adminDeleteBanner('b1', VALID_UUID, req())).rejects.toThrow(HttpException);
    });
  });

  describe('Edge', () => {
    it('adminCreateCategory sin actor', async () => {
      (adminCategoryFns.adminCreateCategory as jest.Mock).mockResolvedValue(ok({ id: 'c1', name: 'V', imageKey: 'i', version: 1 }));
      expect(await c.adminCreateCategory({ name: 'V', image_key: 'i' }, VALID_UUID, req({ user: undefined }))).toBeDefined();
    });
    it('listProducts page 0', async () => {
      (listProductsFn.listProducts as jest.Mock).mockResolvedValue(ok({ items: [], page: 1, size: 20, total: 0 }));
      expect(await c.listProducts('0', '0', undefined, undefined, req())).toBeDefined();
    });
  });

  describe('Media public URL mapping', () => {
    const KEY = 'media/2026/08/20/uuid.jpg';
    const URL = 'https://images.merkee.shop/media/2026/08/20/uuid.jpg';

    it('resuelve url en categoría pública', async () => {
      (listCategoriesFn.listCategories as jest.Mock).mockResolvedValue(ok([{ id: 'c1', name: 'F', imageKey: KEY, version: 1 }]));
      const res: any = await c.listCategories(req());
      expect(res).toEqual([{ id: 'c1', name: 'F', image: { key: KEY, url: URL, alt_text: '', position: 0 }, version: 1 }]);
    });

    it('resuelve url en banner público', async () => {
      (listActiveBannersFn.listActiveBanners as jest.Mock).mockResolvedValue(ok([{ id: 'b1', name: 'B', imageKey: KEY, targetPath: '/', displayOrder: 1, active: true, version: 1 }]));
      const res: any = await c.listActiveBanners(req());
      expect(res).toEqual([{ id: 'b1', name: 'B', image: { key: KEY, url: URL, alt_text: '', position: 0 }, target_path: '/', display_order: 1, active: true, version: 1 }]);
    });

    it('resuelve url en imágenes de producto público (categoría embebida sin key queda vacía)', async () => {
      const item = { id: 'p1', category: { id: 'c1', name: 'F' }, name: 'M', description: '', regularPriceCop: 1, salePriceCop: 1, unit: 'u', stockAvailable: 1, images: [{ key: KEY, altText: 'alt', position: 0 }], version: 1 };
      (listProductsFn.listProducts as jest.Mock).mockResolvedValue(ok({ items: [item], page: 1, size: 20, total: 1 }));
      const res: any = await c.listProducts(undefined, undefined, undefined, undefined, req());
      expect(res.items[0].images).toEqual([{ key: KEY, url: URL, alt_text: 'alt', position: 0 }]);
      expect(res.items[0].category.image).toEqual({ key: '', url: '', alt_text: '', position: 0 });
    });

    it('resuelve url en categoría admin', async () => {
      (adminCategoryFns.adminListCategories as jest.Mock).mockResolvedValue(ok([{ id: 'c1', name: 'F', imageKey: KEY, version: 1 }]));
      const res: any = await c.adminListCategories(req());
      expect(res).toEqual([{ id: 'c1', name: 'F', image: { key: KEY, url: URL, alt_text: '', position: 0 }, version: 1 }]);
    });

    it('resuelve url en imágenes de producto admin', async () => {
      (adminProductFns.adminListProducts as jest.Mock).mockResolvedValue(ok({ items: [{ id: 'p1', categoryId: 'c1', name: 'M', description: '', regularPriceCop: 1, salePriceCop: 1, unit: 'u', stockOnHand: 1, stockReserved: 0, images: [{ key: KEY, altText: 'alt', position: 0 }], version: 1 }], page: 1, size: 20, total: 1 }));
      const res: any = await c.adminListProducts('1', '20', req());
      expect(res.items[0].images).toEqual([{ key: KEY, url: URL, alt_text: 'alt', position: 0 }]);
    });

    it('resuelve url en banner admin', async () => {
      (adminBannerFns.adminListBanners as jest.Mock).mockResolvedValue(ok([{ id: 'b1', name: 'B', imageKey: KEY, targetPath: '/', displayOrder: 1, active: true, version: 1 }]));
      const res: any = await c.adminListBanners(req());
      expect(res).toEqual([{ id: 'b1', name: 'B', image: { key: KEY, url: URL, alt_text: '', position: 0 }, target_path: '/', display_order: 1, active: true, version: 1 }]);
    });
  });
});
