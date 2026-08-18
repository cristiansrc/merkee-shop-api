# Seed NO PRODUCTIVO — merkee.shop API (MSF-DATA-003)

> **ADVERTENCIA:** este seed es **exclusivamente para entornos de desarrollo/pruebas**.
> **NO ejecutar contra producción.** No crea usuarios, admins, contraseñas, hashes,
> tokens de activación, secretos, PAN/CVV ni ningún dato productivo.

## Propósito

Poblar un catálogo **dummy** (categorías, productos, imágenes de producto y banners)
con datos explícitamente ficticios en `es-CO` y precios COP enteros, suficiente para
probar:

- Catálogo público (categorías, banners, productos paginados, búsqueda y detalle).
- Paginación (`page`/`size`).
- Carrito y reservas de stock (productos con `stock_on_hand` variado).
- Ajustes de stock auditados (productos con stock disponible).

## Requisitos previos

1. PostgreSQL de prueba con las migraciones **001-006** aplicadas
   (`npm run prisma:migrate:deploy`). Nunca `db push`; nunca SQLite/H2.
2. `DATABASE_URL` apuntando a la base de prueba (ver `.env` local, gitignored).
3. `npm install` y `npm run prisma:generate` ya ejecutados.

## Ejecución

```bash
npm run prisma:seed
```

También se puede invocar vía Prisma CLI:

```bash
npx prisma db seed
```

## Idempotencia

Cada entidad usa un **UUID determinista fijo** y se inserta con `upsert` sobre su `id`.
Ejecutar el seed repetidas veces **no duplica filas** ni rompe invariantes
(checks de precios/stock, soft delete). Es seguro re-ejecutarlo en cualquier momento.

## Qué NO hace

- No crea admin, usuario real, contraseña, hash, token de activación ni secreto.
- No incluye credenciales de ningún entorno.
- No modifica OpenAPI ni migraciones.
- No usa `db push`, SQLite ni H2.
- No contiene datos productivos ni PAN/CVV.

## Verificación

Tras ejecutar, se puede comprobar el conteo de filas dummy:

```sql
SELECT 'categories' AS tabla, count(*) FROM categories
UNION ALL SELECT 'products', count(*) FROM products
UNION ALL SELECT 'product_images', count(*) FROM product_images
UNION ALL SELECT 'banners', count(*) FROM banners;
```

Esperado: 6 categorías, 15 productos, 15 imágenes y 3 banners (valores dummy).
