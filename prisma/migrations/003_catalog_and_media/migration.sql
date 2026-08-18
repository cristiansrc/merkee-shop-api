-- Migration 003 — catalog_and_media
-- Objetos: categories, products, product_images, banners.
-- Invariantes: soft delete (deleted_at); una categoría por producto (FK category_id);
-- checks de precios (>= 0) y stock (0 <= stock_reserved <= stock_on_hand);
-- `version DEFAULT 1` para optimistic locking; no hard delete/purga v1.

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "image_key" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "description" TEXT NOT NULL,
    "regular_price_cop" BIGINT NOT NULL,
    "sale_price_cop" BIGINT NOT NULL,
    "unit" VARCHAR(40) NOT NULL,
    "stock_on_hand" INTEGER NOT NULL,
    "stock_reserved" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_images" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "alt_text" VARCHAR(160) NOT NULL,
    "position" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "banners" (
    "id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "image_key" TEXT NOT NULL,
    "target_path" TEXT,
    "display_order" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "banners_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "products_category_id_idx" ON "products"("category_id");

-- CreateIndex
CREATE INDEX "product_images_product_id_idx" ON "product_images"("product_id");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Checks de precios y stock (dinero bigint COP y enteros de inventario no negativos).
ALTER TABLE "products" ADD CONSTRAINT "products_regular_price_cop_check" CHECK ("regular_price_cop" >= 0);
ALTER TABLE "products" ADD CONSTRAINT "products_sale_price_cop_check" CHECK ("sale_price_cop" >= 0);
ALTER TABLE "products" ADD CONSTRAINT "products_stock_on_hand_check" CHECK ("stock_on_hand" >= 0);
ALTER TABLE "products" ADD CONSTRAINT "products_stock_reserved_check" CHECK ("stock_reserved" >= 0);
ALTER TABLE "products" ADD CONSTRAINT "products_stock_reserved_le_on_hand_check" CHECK ("stock_reserved" <= "stock_on_hand");

-- Posiciones de imagen y orden de banner no negativos.
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_position_check" CHECK ("position" >= 0);
ALTER TABLE "banners" ADD CONSTRAINT "banners_display_order_check" CHECK ("display_order" >= 0);
