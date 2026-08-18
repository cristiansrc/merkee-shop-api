-- Migration 004 — cart_reservations
-- Objetos: CartStatus, ReservationStatus, carts, cart_items, stock_reservations.
-- Invariantes: carrito 1:1 sesión (session_id UNIQUE); item único carrito/producto
-- (UNIQUE cart_id+product_id); reserva 1:1 item (cart_item_id UNIQUE);
-- ACTIVE expirable (expires_at), CHECKOUT_PENDING sin expiración (expires_at NULL);
-- terminales retenidos 30 días (no purga v1).

-- CreateEnum
CREATE TYPE "CartStatus" AS ENUM ('ACTIVE', 'CHECKOUT_PENDING', 'CLOSED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('ACTIVE', 'CHECKOUT_PENDING', 'CONSUMED', 'RELEASED', 'EXPIRED');

-- CreateTable
CREATE TABLE "carts" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "status" "CartStatus" NOT NULL,
    "items_subtotal_cop" BIGINT NOT NULL,
    "delivery_fee_cop" BIGINT NOT NULL DEFAULT 5000,
    "iva_cop" BIGINT NOT NULL,
    "tax_rate_basis_points" INTEGER NOT NULL DEFAULT 1900,
    "total_cop" BIGINT NOT NULL,
    "reservation_expires_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "carts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cart_items" (
    "id" UUID NOT NULL,
    "cart_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price_cop" BIGINT NOT NULL,
    "subtotal_cop" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "cart_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_reservations" (
    "id" UUID NOT NULL,
    "cart_item_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "status" "ReservationStatus" NOT NULL,
    "expires_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "stock_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "carts_session_id_key" ON "carts"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "cart_items_cart_id_product_id_key" ON "cart_items"("cart_id", "product_id");

-- CreateIndex
CREATE INDEX "cart_items_product_id_idx" ON "cart_items"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_reservations_cart_item_id_key" ON "stock_reservations"("cart_item_id");

-- CreateIndex
CREATE INDEX "stock_reservations_status_expires_at_idx" ON "stock_reservations"("status", "expires_at");

-- CreateIndex
CREATE INDEX "stock_reservations_product_id_idx" ON "stock_reservations"("product_id");

-- AddForeignKey
ALTER TABLE "carts" ADD CONSTRAINT "carts_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_cart_id_fkey" FOREIGN KEY ("cart_id") REFERENCES "carts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_cart_item_id_fkey" FOREIGN KEY ("cart_item_id") REFERENCES "cart_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Checks de carrito: dinero COP no negativo, entrega fija 5000, IVA 19% (1900 bps),
-- total = subtotal + entrega + IVA; CHECKOUT_PENDING no expira (reservation_expires_at NULL).
ALTER TABLE "carts" ADD CONSTRAINT "carts_items_subtotal_cop_check" CHECK ("items_subtotal_cop" >= 0);
ALTER TABLE "carts" ADD CONSTRAINT "carts_delivery_fee_cop_check" CHECK ("delivery_fee_cop" = 5000);
ALTER TABLE "carts" ADD CONSTRAINT "carts_iva_cop_check" CHECK ("iva_cop" >= 0);
ALTER TABLE "carts" ADD CONSTRAINT "carts_tax_rate_basis_points_check" CHECK ("tax_rate_basis_points" = 1900);
ALTER TABLE "carts" ADD CONSTRAINT "carts_total_cop_check" CHECK ("total_cop" = "items_subtotal_cop" + "delivery_fee_cop" + "iva_cop");
ALTER TABLE "carts" ADD CONSTRAINT "carts_checkout_pending_no_expiry_check" CHECK ("status" <> 'CHECKOUT_PENDING' OR "reservation_expires_at" IS NULL);

-- Checks de item: cantidad >= 1, precios/subtotal no negativos.
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_quantity_check" CHECK ("quantity" >= 1);
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_unit_price_cop_check" CHECK ("unit_price_cop" >= 0);
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_subtotal_cop_check" CHECK ("subtotal_cop" >= 0);

-- Checks de reserva: cantidad >= 1; CHECKOUT_PENDING no expira (expires_at NULL).
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_quantity_check" CHECK ("quantity" >= 1);
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_checkout_pending_no_expiry_check" CHECK ("status" <> 'CHECKOUT_PENDING' OR "expires_at" IS NULL);
