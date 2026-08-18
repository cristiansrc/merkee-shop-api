-- Migration 005 — orders_payments_outbox
-- Objetos: OrderStatus, PaymentStatus, RefundStatus, PaymentProvider,
-- WebhookEventStatus, OutboxStatus, orders, order_items, payments,
-- payment_refunds, payment_webhook_events, outbox_events.
-- Invariantes: snapshots de dirección NOT NULL; IVA/totales NOT NULL;
-- delivery_fee_cop=5000; tax_rate_basis_points=1900; orden única por carrito;
-- idempotencias únicas; refund único por payment; webhook dedupe por evento proveedor.

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING_PAYMENT', 'PAID', 'PAYMENT_FAILED', 'PAYMENT_EXPIRED', 'RESERVATION_EXPIRED', 'PAYMENT_REFUND_PENDING', 'PAYMENT_REFUNDED', 'PAYMENT_REFUND_FAILED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED', 'ERROR', 'EXPIRED', 'REFUNDED', 'REFUND_FAILED');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('PENDING', 'REFUNDED', 'REFUND_FAILED');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('WOMPI', 'MERCADO_PAGO');

-- CreateEnum
CREATE TYPE "WebhookEventStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'DUPLICATE', 'FAILED');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "order_number" VARCHAR(40) NOT NULL,
    "cart_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "status" "OrderStatus" NOT NULL,
    "items_subtotal_cop" BIGINT NOT NULL,
    "delivery_fee_cop" BIGINT NOT NULL DEFAULT 5000,
    "iva_cop" BIGINT NOT NULL,
    "tax_rate_basis_points" INTEGER NOT NULL DEFAULT 1900,
    "total_cop" BIGINT NOT NULL,
    "delivery_recipient_name" VARCHAR(100) NOT NULL,
    "delivery_line1" VARCHAR(180) NOT NULL,
    "delivery_city" VARCHAR(100) NOT NULL,
    "delivery_phone" VARCHAR(30) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "product_id" UUID,
    "product_name" VARCHAR(160) NOT NULL,
    "unit" VARCHAR(40) NOT NULL,
    "unit_price_cop" BIGINT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "subtotal_cop" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "status" "PaymentStatus" NOT NULL,
    "amount_cop" BIGINT NOT NULL,
    "provider_reference" VARCHAR(255),
    "idempotency_key" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_refunds" (
    "id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "status" "RefundStatus" NOT NULL,
    "amount_cop" BIGINT NOT NULL,
    "provider_refund_reference" VARCHAR(255),
    "idempotency_key" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payment_refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_webhook_events" (
    "id" UUID NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "provider_event_id" VARCHAR(255) NOT NULL,
    "event_type" VARCHAR(100),
    "payload" JSONB NOT NULL,
    "status" "WebhookEventStatus" NOT NULL,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ(6),

    CONSTRAINT "payment_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "event_type" VARCHAR(100) NOT NULL,
    "aggregate_type" VARCHAR(100) NOT NULL,
    "aggregate_id" UUID NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "OutboxStatus" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "orders_order_number_key" ON "orders"("order_number");

-- CreateIndex
CREATE UNIQUE INDEX "orders_cart_id_key" ON "orders"("cart_id");

-- CreateIndex
CREATE INDEX "orders_user_id_idx" ON "orders"("user_id");

-- CreateIndex
CREATE INDEX "orders_status_idx" ON "orders"("status");

-- CreateIndex
CREATE INDEX "order_items_order_id_idx" ON "order_items"("order_id");

-- CreateIndex
CREATE INDEX "payments_order_id_idx" ON "payments"("order_id");

-- CreateIndex
CREATE INDEX "payments_status_idx" ON "payments"("status");

-- CreateIndex
CREATE UNIQUE INDEX "payments_idempotency_key_key" ON "payments"("idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "payment_refunds_payment_id_key" ON "payment_refunds"("payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_refunds_idempotency_key_key" ON "payment_refunds"("idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "payment_webhook_events_provider_provider_event_id_key" ON "payment_webhook_events"("provider", "provider_event_id");

-- CreateIndex
CREATE INDEX "payment_webhook_events_status_idx" ON "payment_webhook_events"("status");

-- CreateIndex
CREATE INDEX "outbox_events_status_created_at_idx" ON "outbox_events"("status", "created_at");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_cart_id_fkey" FOREIGN KEY ("cart_id") REFERENCES "carts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Checks de orden: dinero COP no negativo, entrega fija 5000, IVA 19% (1900 bps),
-- total = subtotal + entrega + IVA.
ALTER TABLE "orders" ADD CONSTRAINT "orders_items_subtotal_cop_check" CHECK ("items_subtotal_cop" >= 0);
ALTER TABLE "orders" ADD CONSTRAINT "orders_delivery_fee_cop_check" CHECK ("delivery_fee_cop" = 5000);
ALTER TABLE "orders" ADD CONSTRAINT "orders_iva_cop_check" CHECK ("iva_cop" >= 0);
ALTER TABLE "orders" ADD CONSTRAINT "orders_tax_rate_basis_points_check" CHECK ("tax_rate_basis_points" = 1900);
ALTER TABLE "orders" ADD CONSTRAINT "orders_total_cop_check" CHECK ("total_cop" = "items_subtotal_cop" + "delivery_fee_cop" + "iva_cop");

-- Checks de item de orden: cantidad >= 1, precios/subtotal no negativos.
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_quantity_check" CHECK ("quantity" >= 1);
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_unit_price_cop_check" CHECK ("unit_price_cop" >= 0);
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_subtotal_cop_check" CHECK ("subtotal_cop" >= 0);

-- Checks de pago/refund: monto no negativo.
ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_cop_check" CHECK ("amount_cop" >= 0);
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_amount_cop_check" CHECK ("amount_cop" >= 0);
