/**
 * Tests del mapa de trazabilidad operationId → contrato (MSF-API-003).
 *
 * Verifican que cada operación del contrato es trazable a su schema de
 * request/response y que las operaciones idempotentes y de bloqueo optimista
 * declaran los headers `Idempotency-Key`/`If-Match` conforme a OpenAPI.
 */

import { OPERATIONS, findOperation } from './operation-map';

describe('Operation map (MSF-API-003)', () => {
  it('cubre todas las operaciones del contrato', () => {
    const expected = [
      'registerCustomer',
      'login',
      'refreshSession',
      'logout',
      'requestPasswordReset',
      'resetPassword',
      'changePassword',
      'activateAdmin',
      'getMyProfile',
      'updateMyProfile',
      'listCategories',
      'listProducts',
      'getProduct',
      'listActiveBanners',
      'getCart',
      'addCartItem',
      'setCartItemQuantity',
      'removeCartItem',
      'createCheckout',
      'listMyOrders',
      'getMyOrder',
      'provisionAdminUser',
      'adminListCategories',
      'adminCreateCategory',
      'adminUpdateCategory',
      'adminDeleteCategory',
      'adminListProducts',
      'adminCreateProduct',
      'adminUpdateProduct',
      'adminDeleteProduct',
      'adminCreateProductStockAdjustment',
      'adminListBanners',
      'adminCreateBanner',
      'adminUpdateBanner',
      'adminDeleteBanner',
      'adminListOrders',
      'adminGetOrder',
      'createMediaUploadUrl',
      'receiveWompiWebhook',
      'receiveMercadoPagoWebhook',
    ];
    const actual = OPERATIONS.map((op) => op.operationId).sort();
    expect(actual).toEqual([...expected].sort());
  });

  it('provisionAdminUser es trazable a CreateAdminUserRequest/AdminUserProvisionResponse', () => {
    const op = findOperation('provisionAdminUser');
    expect(op).toBeDefined();
    expect(op?.requestSchema).toBe('CreateAdminUserRequest');
    expect(op?.responseSchema).toBe('AdminUserProvisionResponse');
    expect(op?.successStatus).toBe(201);
    expect(op?.errorStatuses).toEqual([400, 401, 403, 404, 409, 429, 500]);
    expect(op?.idempotencyKey).toBe(true);
    expect(op?.ifMatch).toBe(false);
  });

  it('changePassword es trazable a PasswordChangeRequest y requiere Idempotency-Key', () => {
    const op = findOperation('changePassword');
    expect(op?.requestSchema).toBe('PasswordChangeRequest');
    expect(op?.idempotencyKey).toBe(true);
    expect(op?.successStatus).toBe(204);
  });

  it('activateAdmin es trazable a AdminActivationRequest', () => {
    const op = findOperation('activateAdmin');
    expect(op?.requestSchema).toBe('AdminActivationRequest');
    expect(op?.successStatus).toBe(204);
  });

  it('updateMyProfile es trazable a UpdateProfileRequest/UserResponse', () => {
    const op = findOperation('updateMyProfile');
    expect(op?.requestSchema).toBe('UpdateProfileRequest');
    expect(op?.responseSchema).toBe('UserResponse');
    expect(op?.idempotencyKey).toBe(true);
  });

  it('las ediciones de catálogo requieren If-Match (bloqueo optimista)', () => {
    for (const id of [
      'adminUpdateCategory',
      'adminUpdateProduct',
      'adminUpdateBanner',
    ]) {
      const op = findOperation(id);
      expect(op?.ifMatch).toBe(true);
      expect(op?.idempotencyKey).toBe(true);
    }
  });

  it('el ajuste de stock NO usa If-Match (ADR-012)', () => {
    const op = findOperation('adminCreateProductStockAdjustment');
    expect(op?.ifMatch).toBe(false);
    expect(op?.idempotencyKey).toBe(true);
    expect(op?.requestSchema).toBe('StockAdjustmentRequest');
    expect(op?.responseSchema).toBe('StockAdjustmentResponse');
  });

  it('los webhooks no requieren autenticación de sesión', () => {
    expect(findOperation('receiveWompiWebhook')?.authenticated).toBe(false);
    expect(findOperation('receiveMercadoPagoWebhook')?.authenticated).toBe(
      false,
    );
  });

  it('findOperation devuelve undefined para un operationId desconocido', () => {
    expect(findOperation('no-existe')).toBeUndefined();
  });
});
