/**
 * Seed NO PRODUCTIVO — merkee.shop API (MSF-DATA-003)
 *
 * ADVERTENCIA: este seed es EXCLUSIVAMENTE para entornos de desarrollo/pruebas.
 * NO debe ejecutarse contra producción. No crea usuarios, admins, contraseñas,
 * hashes, tokens de activación, secretos, PAN/CVV ni ningún dato productivo.
 *
 * Población: categorías, productos, imágenes de producto y banners con datos
 * explícitamente dummy (es-CO, precios COP enteros) para probar catálogo,
 * paginación, carrito y stock/reservas.
 *
 * Idempotencia: cada entidad usa un UUID determinista fijo y se inserta con
 * `upsert` sobre su `id`, de modo que ejecutar el seed repetidas veces no
 * duplica filas ni rompe invariantes (checks de precios/stock, soft delete).
 *
 * Ejecución (requiere PostgreSQL de prueba y migraciones 001-006 aplicadas):
 *   npm run prisma:seed
 *
 * Prohibido: `db push`, SQLite/H2, crear admin/usuario real, contraseñas,
 * hashes, tokens, secretos o datos productivos.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// UUIDs deterministas (fijos) para idempotencia. Prefijo semántico por entidad.
// ---------------------------------------------------------------------------
const CATEGORY_IDS = {
  frutasYVerduras: '00000000-0000-4000-8000-000000000001',
  lacteosYHuevos: '00000000-0000-4000-8000-000000000002',
  carnesYPescados: '00000000-0000-4000-8000-000000000003',
  despensa: '00000000-0000-4000-8000-000000000004',
  bebidas: '00000000-0000-4000-8000-000000000005',
  aseoDelHogar: '00000000-0000-4000-8000-000000000006',
} as const;

const PRODUCT_IDS = {
  manzanaRoja: '00000000-0000-4000-8000-000000000101',
  banano: '00000000-0000-4000-8000-000000000102',
  tomate: '00000000-0000-4000-8000-000000000103',
  lecheEntera: '00000000-0000-4000-8000-000000000201',
  huevosAA: '00000000-0000-4000-8000-000000000202',
  quesoCampesino: '00000000-0000-4000-8000-000000000203',
  pechugaPollo: '00000000-0000-4000-8000-000000000301',
  salmonFresco: '00000000-0000-4000-8000-000000000302',
  arrozBlanco: '00000000-0000-4000-8000-000000000401',
  aceiteVegetal: '00000000-0000-4000-8000-000000000402',
  cafeMolido: '00000000-0000-4000-8000-000000000403',
  aguaSinGas: '00000000-0000-4000-8000-000000000501',
  jugoNaranja: '00000000-0000-4000-8000-000000000502',
  detergente: '00000000-0000-4000-8000-000000000601',
  jabonBano: '00000000-0000-4000-8000-000000000602',
} as const;

const BANNER_IDS = {
  promocionFrutas: '00000000-0000-4000-8000-000000000701',
  promocionDespensa: '00000000-0000-4000-8000-000000000702',
  bienvenida: '00000000-0000-4000-8000-000000000703',
} as const;

// ---------------------------------------------------------------------------
// Datos dummy (es-CO, COP enteros). Nada de esto es real ni productivo.
// ---------------------------------------------------------------------------
interface CategorySeed {
  id: string;
  name: string;
  imageKey: string;
}

const categories: CategorySeed[] = [
  { id: CATEGORY_IDS.frutasYVerduras, name: 'Frutas y Verduras', imageKey: 'seed/categorias/frutas-y-verduras.jpg' },
  { id: CATEGORY_IDS.lacteosYHuevos, name: 'Lácteos y Huevos', imageKey: 'seed/categorias/lacteos-y-huevos.jpg' },
  { id: CATEGORY_IDS.carnesYPescados, name: 'Carnes y Pescados', imageKey: 'seed/categorias/carnes-y-pescados.jpg' },
  { id: CATEGORY_IDS.despensa, name: 'Despensa', imageKey: 'seed/categorias/despensa.jpg' },
  { id: CATEGORY_IDS.bebidas, name: 'Bebidas', imageKey: 'seed/categorias/bebidas.jpg' },
  { id: CATEGORY_IDS.aseoDelHogar, name: 'Aseo del Hogar', imageKey: 'seed/categorias/aseo-del-hogar.jpg' },
];

interface ProductImageSeed {
  id: string;
  key: string;
  altText: string;
  position: number;
}

interface ProductSeed {
  id: string;
  categoryId: string;
  name: string;
  description: string;
  regularPriceCop: bigint;
  salePriceCop: bigint;
  unit: string;
  stockOnHand: number;
  images: ProductImageSeed[];
}

const products: ProductSeed[] = [
  {
    id: PRODUCT_IDS.manzanaRoja,
    categoryId: CATEGORY_IDS.frutasYVerduras,
    name: 'Manzana Roja (dummy)',
    description: 'Manzana roja de prueba. Dato dummy no productivo para validar catálogo y carrito.',
    regularPriceCop: 2500n,
    salePriceCop: 2200n,
    unit: 'unidad',
    stockOnHand: 100,
    images: [
      { id: '00000000-0000-4000-8000-000000000a01', key: 'seed/productos/manzana-roja-1.jpg', altText: 'Manzana roja dummy', position: 0 },
    ],
  },
  {
    id: PRODUCT_IDS.banano,
    categoryId: CATEGORY_IDS.frutasYVerduras,
    name: 'Banano (dummy)',
    description: 'Banano de prueba. Dato dummy no productivo.',
    regularPriceCop: 1800n,
    salePriceCop: 1800n,
    unit: 'libra',
    stockOnHand: 80,
    images: [
      { id: '00000000-0000-4000-8000-000000000a02', key: 'seed/productos/banano-1.jpg', altText: 'Banano dummy', position: 0 },
    ],
  },
  {
    id: PRODUCT_IDS.tomate,
    categoryId: CATEGORY_IDS.frutasYVerduras,
    name: 'Tomate Chonto (dummy)',
    description: 'Tomate de prueba. Dato dummy no productivo.',
    regularPriceCop: 3200n,
    salePriceCop: 2900n,
    unit: 'libra',
    stockOnHand: 60,
    images: [
      { id: '00000000-0000-4000-8000-000000000a03', key: 'seed/productos/tomate-1.jpg', altText: 'Tomate dummy', position: 0 },
    ],
  },
  {
    id: PRODUCT_IDS.lecheEntera,
    categoryId: CATEGORY_IDS.lacteosYHuevos,
    name: 'Leche Entera (dummy)',
    description: 'Leche entera de prueba. Dato dummy no productivo.',
    regularPriceCop: 4200n,
    salePriceCop: 3900n,
    unit: 'litro',
    stockOnHand: 50,
    images: [
      { id: '00000000-0000-4000-8000-000000000a04', key: 'seed/productos/leche-entera-1.jpg', altText: 'Leche entera dummy', position: 0 },
    ],
  },
  {
    id: PRODUCT_IDS.huevosAA,
    categoryId: CATEGORY_IDS.lacteosYHuevos,
    name: 'Huevos AA (dummy)',
    description: 'Huevos de prueba. Dato dummy no productivo.',
    regularPriceCop: 12500n,
    salePriceCop: 11500n,
    unit: 'cubeta',
    stockOnHand: 30,
    images: [
      { id: '00000000-0000-4000-8000-000000000a05', key: 'seed/productos/huevos-aa-1.jpg', altText: 'Huevos AA dummy', position: 0 },
    ],
  },
  {
    id: PRODUCT_IDS.quesoCampesino,
    categoryId: CATEGORY_IDS.lacteosYHuevos,
    name: 'Queso Campesino (dummy)',
    description: 'Queso de prueba. Dato dummy no productivo.',
    regularPriceCop: 9800n,
    salePriceCop: 9800n,
    unit: 'libra',
    stockOnHand: 25,
    images: [
      { id: '00000000-0000-4000-8000-000000000a06', key: 'seed/productos/queso-campesino-1.jpg', altText: 'Queso campesino dummy', position: 0 },
    ],
  },
  {
    id: PRODUCT_IDS.pechugaPollo,
    categoryId: CATEGORY_IDS.carnesYPescados,
    name: 'Pechuga de Pollo (dummy)',
    description: 'Pechuga de pollo de prueba. Dato dummy no productivo.',
    regularPriceCop: 15800n,
    salePriceCop: 14500n,
    unit: 'libra',
    stockOnHand: 40,
    images: [
      { id: '00000000-0000-4000-8000-000000000a07', key: 'seed/productos/pechuga-pollo-1.jpg', altText: 'Pechuga de pollo dummy', position: 0 },
    ],
  },
  {
    id: PRODUCT_IDS.salmonFresco,
    categoryId: CATEGORY_IDS.carnesYPescados,
    name: 'Salmón Fresco (dummy)',
    description: 'Salmón de prueba. Dato dummy no productivo.',
    regularPriceCop: 28500n,
    salePriceCop: 27000n,
    unit: 'libra',
    stockOnHand: 15,
    images: [
      { id: '00000000-0000-4000-8000-000000000a08', key: 'seed/productos/salmon-fresco-1.jpg', altText: 'Salmón fresco dummy', position: 0 },
    ],
  },
  {
    id: PRODUCT_IDS.arrozBlanco,
    categoryId: CATEGORY_IDS.despensa,
    name: 'Arroz Blanco (dummy)',
    description: 'Arroz de prueba. Dato dummy no productivo.',
    regularPriceCop: 6800n,
    salePriceCop: 6200n,
    unit: 'libra',
    stockOnHand: 120,
    images: [
      { id: '00000000-0000-4000-8000-000000000a09', key: 'seed/productos/arroz-blanco-1.jpg', altText: 'Arroz blanco dummy', position: 0 },
    ],
  },
  {
    id: PRODUCT_IDS.aceiteVegetal,
    categoryId: CATEGORY_IDS.despensa,
    name: 'Aceite Vegetal (dummy)',
    description: 'Aceite de prueba. Dato dummy no productivo.',
    regularPriceCop: 14500n,
    salePriceCop: 13500n,
    unit: 'botella',
    stockOnHand: 45,
    images: [
      { id: '00000000-0000-4000-8000-000000000a0a', key: 'seed/productos/aceite-vegetal-1.jpg', altText: 'Aceite vegetal dummy', position: 0 },
    ],
  },
  {
    id: PRODUCT_IDS.cafeMolido,
    categoryId: CATEGORY_IDS.despensa,
    name: 'Café Molido (dummy)',
    description: 'Café de prueba. Dato dummy no productivo.',
    regularPriceCop: 18900n,
    salePriceCop: 17500n,
    unit: 'libra',
    stockOnHand: 35,
    images: [
      { id: '00000000-0000-4000-8000-000000000a0b', key: 'seed/productos/cafe-molido-1.jpg', altText: 'Café molido dummy', position: 0 },
    ],
  },
  {
    id: PRODUCT_IDS.aguaSinGas,
    categoryId: CATEGORY_IDS.bebidas,
    name: 'Agua Sin Gas (dummy)',
    description: 'Agua de prueba. Dato dummy no productivo.',
    regularPriceCop: 2500n,
    salePriceCop: 2300n,
    unit: 'botella',
    stockOnHand: 200,
    images: [
      { id: '00000000-0000-4000-8000-000000000a0c', key: 'seed/productos/agua-sin-gas-1.jpg', altText: 'Agua sin gas dummy', position: 0 },
    ],
  },
  {
    id: PRODUCT_IDS.jugoNaranja,
    categoryId: CATEGORY_IDS.bebidas,
    name: 'Jugo de Naranja (dummy)',
    description: 'Jugo de naranja de prueba. Dato dummy no productivo.',
    regularPriceCop: 7800n,
    salePriceCop: 7200n,
    unit: 'botella',
    stockOnHand: 55,
    images: [
      { id: '00000000-0000-4000-8000-000000000a0d', key: 'seed/productos/jugo-naranja-1.jpg', altText: 'Jugo de naranja dummy', position: 0 },
    ],
  },
  {
    id: PRODUCT_IDS.detergente,
    categoryId: CATEGORY_IDS.aseoDelHogar,
    name: 'Detergente en Polvo (dummy)',
    description: 'Detergente de prueba. Dato dummy no productivo.',
    regularPriceCop: 11200n,
    salePriceCop: 10500n,
    unit: 'bolsa',
    stockOnHand: 70,
    images: [
      { id: '00000000-0000-4000-8000-000000000a0e', key: 'seed/productos/detergente-1.jpg', altText: 'Detergente dummy', position: 0 },
    ],
  },
  {
    id: PRODUCT_IDS.jabonBano,
    categoryId: CATEGORY_IDS.aseoDelHogar,
    name: 'Jabón de Baño (dummy)',
    description: 'Jabón de baño de prueba. Dato dummy no productivo.',
    regularPriceCop: 3400n,
    salePriceCop: 3100n,
    unit: 'unidad',
    stockOnHand: 90,
    images: [
      { id: '00000000-0000-4000-8000-000000000a0f', key: 'seed/productos/jabon-bano-1.jpg', altText: 'Jabón de baño dummy', position: 0 },
    ],
  },
];

interface BannerSeed {
  id: string;
  name: string;
  imageKey: string;
  targetPath: string | null;
  displayOrder: number;
  active: boolean;
}

const banners: BannerSeed[] = [
  { id: BANNER_IDS.promocionFrutas, name: 'Promo Frutas (dummy)', imageKey: 'seed/banners/promo-frutas.jpg', targetPath: '/categorias/frutas-y-verduras', displayOrder: 0, active: true },
  { id: BANNER_IDS.promocionDespensa, name: 'Promo Despensa (dummy)', imageKey: 'seed/banners/promo-despensa.jpg', targetPath: '/categorias/despensa', displayOrder: 1, active: true },
  { id: BANNER_IDS.bienvenida, name: 'Bienvenida (dummy)', imageKey: 'seed/banners/bienvenida.jpg', targetPath: null, displayOrder: 2, active: true },
];

// ---------------------------------------------------------------------------
// Ejecución idempotente
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  console.log('[seed] Iniciando seed NO PRODUCTIVO (catálogo dummy)...');

  // Categorías (upsert por id determinista).
  for (const category of categories) {
    await prisma.category.upsert({
      where: { id: category.id },
      update: { name: category.name, imageKey: category.imageKey },
      create: { id: category.id, name: category.name, imageKey: category.imageKey },
    });
  }
  console.log(`[seed] Categorías listas: ${categories.length}`);

  // Productos + imágenes (upsert por id determinista).
  for (const product of products) {
    await prisma.product.upsert({
      where: { id: product.id },
      update: {
        categoryId: product.categoryId,
        name: product.name,
        description: product.description,
        regularPriceCop: product.regularPriceCop,
        salePriceCop: product.salePriceCop,
        unit: product.unit,
        stockOnHand: product.stockOnHand,
      },
      create: {
        id: product.id,
        categoryId: product.categoryId,
        name: product.name,
        description: product.description,
        regularPriceCop: product.regularPriceCop,
        salePriceCop: product.salePriceCop,
        unit: product.unit,
        stockOnHand: product.stockOnHand,
      },
    });

    for (const image of product.images) {
      await prisma.productImage.upsert({
        where: { id: image.id },
        update: { productId: product.id, key: image.key, altText: image.altText, position: image.position },
        create: { id: image.id, productId: product.id, key: image.key, altText: image.altText, position: image.position },
      });
    }
  }
  console.log(`[seed] Productos listos: ${products.length}`);

  // Banners (upsert por id determinista).
  for (const banner of banners) {
    await prisma.banner.upsert({
      where: { id: banner.id },
      update: {
        name: banner.name,
        imageKey: banner.imageKey,
        targetPath: banner.targetPath,
        displayOrder: banner.displayOrder,
        active: banner.active,
      },
      create: {
        id: banner.id,
        name: banner.name,
        imageKey: banner.imageKey,
        targetPath: banner.targetPath,
        displayOrder: banner.displayOrder,
        active: banner.active,
      },
    });
  }
  console.log(`[seed] Banners listos: ${banners.length}`);

  console.log('[seed] Seed NO PRODUCTIVO completado. No se crearon usuarios, admins, contraseñas ni secretos.');
}

main()
  .catch((error) => {
    console.error('[seed] Error ejecutando seed NO PRODUCTIVO:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
