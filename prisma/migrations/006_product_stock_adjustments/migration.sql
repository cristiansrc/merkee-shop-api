-- Migration 006 — product_stock_adjustments
-- Objetos: product_stock_adjustments (auditoría inmutable append-only).
-- Invariantes: delta no cero; snapshots no negativos; after = before + delta;
-- after >= stock_reserved; stock_available = after - reserved; idempotencia única;
-- FKs restrictivas; índices por producto/admin; inmutabilidad vía trigger.

-- CreateTable
CREATE TABLE "product_stock_adjustments" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "admin_user_id" UUID NOT NULL,
    "quantity_delta" INTEGER NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "stock_on_hand_before" INTEGER NOT NULL,
    "stock_on_hand_after" INTEGER NOT NULL,
    "stock_reserved" INTEGER NOT NULL,
    "stock_available" INTEGER NOT NULL,
    "idempotency_key" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_stock_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "product_stock_adjustments_idempotency_key_key" ON "product_stock_adjustments"("idempotency_key");

-- CreateIndex
CREATE INDEX "product_stock_adjustments_product_id_idx" ON "product_stock_adjustments"("product_id");

-- CreateIndex
CREATE INDEX "product_stock_adjustments_admin_user_id_idx" ON "product_stock_adjustments"("admin_user_id");

-- AddForeignKey
ALTER TABLE "product_stock_adjustments" ADD CONSTRAINT "product_stock_adjustments_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_stock_adjustments" ADD CONSTRAINT "product_stock_adjustments_admin_user_id_fkey" FOREIGN KEY ("admin_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Checks de auditoría: delta no cero; snapshots no negativos; after = before + delta;
-- after >= reserved; stock_available = after - reserved.
ALTER TABLE "product_stock_adjustments" ADD CONSTRAINT "product_stock_adjustments_quantity_delta_check" CHECK ("quantity_delta" <> 0);
ALTER TABLE "product_stock_adjustments" ADD CONSTRAINT "product_stock_adjustments_stock_on_hand_before_check" CHECK ("stock_on_hand_before" >= 0);
ALTER TABLE "product_stock_adjustments" ADD CONSTRAINT "product_stock_adjustments_stock_on_hand_after_check" CHECK ("stock_on_hand_after" >= 0);
ALTER TABLE "product_stock_adjustments" ADD CONSTRAINT "product_stock_adjustments_stock_reserved_check" CHECK ("stock_reserved" >= 0);
ALTER TABLE "product_stock_adjustments" ADD CONSTRAINT "product_stock_adjustments_stock_available_check" CHECK ("stock_available" >= 0);
ALTER TABLE "product_stock_adjustments" ADD CONSTRAINT "product_stock_adjustments_after_equals_before_plus_delta_check" CHECK ("stock_on_hand_after" = "stock_on_hand_before" + "quantity_delta");
ALTER TABLE "product_stock_adjustments" ADD CONSTRAINT "product_stock_adjustments_after_ge_reserved_check" CHECK ("stock_on_hand_after" >= "stock_reserved");
ALTER TABLE "product_stock_adjustments" ADD CONSTRAINT "product_stock_adjustments_available_equals_after_minus_reserved_check" CHECK ("stock_available" = "stock_on_hand_after" - "stock_reserved");

-- Inmutabilidad: la auditoría de stock es append-only. Se bloquea UPDATE y DELETE
-- a nivel de base de datos para garantizar trazabilidad irreversible.
CREATE OR REPLACE FUNCTION prevent_stock_adjustment_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'product_stock_adjustments is immutable (append-only)';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER product_stock_adjustments_immutable
BEFORE UPDATE OR DELETE ON "product_stock_adjustments"
FOR EACH ROW EXECUTE FUNCTION prevent_stock_adjustment_mutation();
