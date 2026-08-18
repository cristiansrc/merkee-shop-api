import { Result, ok, fail } from '../../../../shared/domain/result';
import { DomainError } from '../../../../shared/domain/domain-error';
import { ActorLookupPort } from '../../domain/ports/actor-lookup.port';
import { CatalogIdempotencyPort } from '../../domain/ports/catalog-idempotency.port';
import { StockAdjustmentRepositoryPort } from '../../domain/ports/stock-adjustment-repository.port';
import { StockAdjustmentProductLockPort } from '../../domain/ports/stock-adjustment-product-lock.port';
import { StockAdjustmentErrors } from '../../domain/stock-adjustment.errors';
import { createHash } from 'crypto';

/** Vista de respuesta del ajuste de stock (OpenAPI StockAdjustmentResponse). */
export interface StockAdjustmentView {
  readonly id: string;
  readonly product_id: string;
  readonly quantity_delta: number;
  readonly reason: string;
  readonly stock_on_hand_before: number;
  readonly stock_on_hand_after: number;
  readonly stock_reserved: number;
  readonly stock_available: number;
  readonly created_at: string;
}

/** Comando de entrada para el ajuste de stock. */
export interface AdminCreateStockAdjustmentCommand {
  readonly actorId: string;
  readonly productId: string;
  readonly idempotencyKey: string;
  readonly quantityDelta: number;
  readonly reason: string;
}

/**
 * Caso de uso: ajuste administrativo de stock auditado e idempotente (ADR-011).
 *
 * Flujo:
 * 1. Verificar actor admin con must_change_password=false
 * 2. Verificar idempotencia (replay → original, divergente → 409)
 * 3. Bloquear producto (SELECT FOR UPDATE)
 * 4. Calcular after = before + delta
 * 5. Validar after >= stock_reserved
 * 6. Actualizar stock_on_hand
 * 7. Insertar registro de auditoría append-only
 * 8. Persistir idempotencia
 */
export async function adminCreateStockAdjustment(
  actorLookup: ActorLookupPort,
  idempotencyPort: CatalogIdempotencyPort,
  productLockPort: StockAdjustmentProductLockPort,
  stockAdjustmentRepo: StockAdjustmentRepositoryPort,
  command: AdminCreateStockAdjustmentCommand,
): Promise<Result<StockAdjustmentView, DomainError>> {
  try {
    // 1. Verificar actor admin
    const actor = await actorLookup.findById(command.actorId);
    if (!actor || actor.role !== 'admin') {
      return fail(StockAdjustmentErrors.actorNotAuthorized());
    }
    if (actor.mustChangePassword) {
      return fail(StockAdjustmentErrors.initialPasswordChangeRequired());
    }

    // 2. Idempotencia
    const scope = `catalog-stock-adjustment:${command.actorId}`;
    const bodyHash = createHash('sha256')
      .update(JSON.stringify({
        product_id: command.productId,
        quantity_delta: command.quantityDelta,
        reason: command.reason,
      }))
      .digest('hex');

    const existing = await idempotencyPort.find(scope, command.idempotencyKey);
    if (existing) {
      if (existing.bodyHash !== bodyHash) {
        return fail(StockAdjustmentErrors.idempotencyKeyReused());
      }
      return ok(existing.responseJson as StockAdjustmentView);
    }

    // 3. Bloquear producto (SELECT FOR UPDATE)
    const locked = await productLockPort.lockForUpdate(command.productId);
    if (!locked) {
      return fail(StockAdjustmentErrors.resourceNotFound());
    }

    // 4. Calcular nuevo stock
    const before = locked.stockOnHand;
    const after = before + command.quantityDelta;

    // 5. Validar after >= stock_reserved
    if (after < locked.stockReserved) {
      return fail(StockAdjustmentErrors.stockInsufficient());
    }

    // 6. Actualizar stock_on_hand (sin tocar stock_reserved)
    const updated = await productLockPort.updateStockOnHand(command.productId, after);
    if (!updated) {
      return fail(StockAdjustmentErrors.technicalFailure());
    }

    // 7. Insertar registro de auditoría append-only
    const adjustment = await stockAdjustmentRepo.insert({
      productId: command.productId,
      adminUserId: command.actorId,
      quantityDelta: command.quantityDelta,
      reason: command.reason,
      stockOnHandBefore: before,
      stockOnHandAfter: after,
      stockReserved: locked.stockReserved,
      stockAvailable: after - locked.stockReserved,
      idempotencyKey: command.idempotencyKey,
    });

    const response: StockAdjustmentView = {
      id: adjustment.id,
      product_id: adjustment.productId,
      quantity_delta: adjustment.quantityDelta,
      reason: adjustment.reason,
      stock_on_hand_before: adjustment.stockOnHandBefore,
      stock_on_hand_after: adjustment.stockOnHandAfter,
      stock_reserved: adjustment.stockReserved,
      stock_available: adjustment.stockAvailable,
      created_at: adjustment.createdAt.toISOString(),
    };

    // 8. Persistir idempotencia
    await idempotencyPort.save({
      scope,
      idempotencyKey: command.idempotencyKey,
      bodyHash,
      responseJson: response,
    });

    return ok(response);
  } catch {
    return fail(StockAdjustmentErrors.technicalFailure());
  }
}
