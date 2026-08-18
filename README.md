# merkee-shop-api

Backend / API del ecosistema **merkee.shop** (supermercado digital colombiano,
`es-CO`, COP). Monolito modular **NestJS + TypeScript** con arquitectura
**hexagonal** y **Programación Orientada a Resultados (ROP)**.

> Parte del workspace `merkee-workspace`. La fuente de verdad es
> `docs/specs/master_spec.md` y el contrato `docs/api/openapi.yaml`.

## Objetivo y alcance

Exponer la lógica de negocio y el contrato HTTP del ecosistema: identidad y
sesiones, catálogo/media, carrito con reserva de inventario, checkout, pagos
(Wompi / Mercado Pago) con webhooks firmados y reembolsos, órdenes y consulta
administrativa. Todo importe es COP entero; toda respuesta de error sigue
`ApiErrorResponse` (`application/problem+json`).

**Estado de los módulos (revisado en disco 2026-08-18):** todos los módulos
tienen **implementación local funcional** (boundary hexagonal, casos de uso ROP
y adapters de infraestructura con sus pruebas unitarias):

- `identity`: registro/login/refresh/logout, bootstrap seguro, provisión y
  activación de admin, perfil, password reset/change. **Nota:** el email de
  activación/reset es `NoopEmailAdapter` (no se envía realmente) y el
  `CartReservationPort` de identity es `noop` (TD-MSF-API-001).
- `catalog` (incl. ajuste de stock auditado con `If-Match` / `Idempotency-Key`),
  `media` (URLs prefirmadas S3), `cart-reservation` (carrito servidor, reserva
  por ítem, reaper), `orders` (listado), `payments` (Wompi/Mercado Pago, webhook
  firmado, reembolso, reconciliación) y `checkout` (IVA 19% HALF_UP, entrega
  5000 COP) tienen casos de uso implementados.

**Fakes / externos pendientes (no producción):** `media` usa
`FakeS3MediaStorageAdapter` en dev (el adapter S3 real existe pero AWS no está
configurado); `payments` incluye `FakePaymentProviderAdapter` y los adapters
Wompi/Mercado Pago reales, pero los proveedores externos no están configurados;
el email es noop. **No se declara producción lista** (ver gates abiertos).

## Arquitectura: hexagonal + ROP

- **Monolito modular** con 8 módulos: `identity`, `media`, `catalog`,
  `cart-reservation`, `orders`, `payments`, `checkout`, `admin-query`.
- **Ports & Adapters:** `domain` (TypeScript puro, sin NestJS/Prisma/HTTP),
  `application` (casos de uso) y `infrastructure` (adapters Prisma/S3/email/
  pagos). `domain` y `application` no dependen de infraestructura.
- **ROP:** todo puerto de entrada/caso de uso devuelve
  `Result<Success, DomainError>`. Los errores de negocio esperados (conflicto,
  no encontrado, autorización, idempotencia, stock, expiración, transición
  inválida) viajan por el rail `Failure`; las excepciones solo representan
  fallos técnicos inesperados y son traducidas a `DomainError` en el límite del
  adapter (nunca se propagan a controllers/dominio).
- **Catálogo estable `DomainError`** (ADR-017): códigos fijos
  (`INVALID_DOMAIN_INPUT`, `AUTHENTICATION_REQUIRED`, `ADMIN_STOREFRONT_PURCHASE_FORBIDDEN`,
  `RESOURCE_NOT_FOUND`, `SESSION_EXPIRED`, `IDEMPOTENCY_KEY_REUSED`,
  `VERSION_MISMATCH`, `STOCK_INSUFFICIENT`, `TECHNICAL_DEPENDENCY_FAILURE`, etc.)
  proyectados a los statuses OpenAPI correspondientes.
- **Dependency-cruiser** bloquea `domain→application|infrastructure` y
  `application→infrastructure` como prueba de arquitectura en el build.

## Módulos y responsabilidades

| Módulo | Responsabilidad | Estado |
|---|---|---|
| `identity` | Registro (solo `cliente`), login/refresh/logout, sesiones guest↔autenticado, bootstrap seguro de admin inicial, provisión admin (`POST /v1/admin/users`), activación (`POST /v1/auth/admin-activations`), perfil (`GET/PATCH /me`), password reset/change. | Implementado (local) |
| `media` | Banners, imágenes, URLs prefirmadas S3. | Implementado (local) — `FakeS3MediaStorageAdapter` en dev; S3 real pendiente de AWS. |
| `catalog` | Categorías, productos (soft delete), ajustes de stock auditados (`If-Match` / `Idempotency-Key`). | Implementado (local) |
| `cart-reservation` | Carrito de servidor para guest/cliente, reserva por ítem, reaper cada 1 min, contador agregado `stock_reserved`. | Implementado (local) |
| `orders` | Órdenes y snapshots de dirección (`delivery_*`). | Implementado (local) — listado; creación vía `checkout`. |
| `payments` | Estrategia Wompi/Mercado Pago, webhooks firmados, reembolsos idempotentes, reconciliación. | Implementado (local) — `FakePaymentProviderAdapter` en dev; proveedores externos pendientes de configuración. |
| `checkout` | Cálculo IVA 19% HALF_UP, entrega 5000 COP, conversión ACTIVE→CHECKOUT_PENDING. | Implementado (local) |
| `admin-query` | Solo lectura cross-cutting de órdenes. | Implementado (local) |

## Datos: PostgreSQL / Prisma / migraciones

- **Prisma Migrate** es el único DDL (nunca `db push`).
- Migraciones aplicadas: **001–014** (identidad/auth, tokens de activación,
  catálogo/media, carrito/reservas, órdenes/pagos/outbox, ajustes de stock,
  `idempotency_records` 007–013, y `password_reset_tokens_active_unique_index`
  014).
- **Seed no productivo** (`prisma/seed.ts`): solo catálogo dummy (6 categorías,
  15 productos, 15 imágenes, 3 banners), idempotente, **sin admin, contraseñas,
  hashes, tokens ni PAN/CVV**.
- **Preflight obligatorio para 014:** si existen tokens de reset activos
  duplicados preexistentes, la migración falla; ejecutar el `SELECT` de
  detección antes de `prisma migrate deploy` (ver contrato Prisma §014 y
  `technical_debt.md` TD-MSF-ID-003-01).

## Contrato OpenAPI como fuente de verdad

`docs/api/openapi.yaml` es el contrato. La API no debe inventar endpoints ni
códigos; los paths canónicos incluyen `POST /v1/admin/users`,
`POST /v1/auth/admin-activations`, `POST /v1/auth/password-change`,
`POST /v1/auth/password-reset-requests`, `POST /v1/auth/password-resets`, etc.
El prefijo `/v1` pertenece al `servers.url` (`https://api.merkee.shop/v1`).

## Seguridad, sesiones, RBAC, pagos, webhooks, reservas

- **Sesiones:** JWT de acceso ≤10 min solo en memoria; refresh/cart token opaco
  `HttpOnly; Secure; SameSite=Lax`, rotado. Argon2id. CSRF/CORS/CSP/HSTS y rate
  limiting de login/registro/reset/activación **pendientes** (TD-NEW-HTTP-SEC).
- **Fail-fast de `JWT_SECRET`** en `NODE_ENV=production` si falta o <32 bytes
  (STAB-B3). Default solo en desarrollo con advertencia.
- **RBAC:** roles `admin`/`cliente`; el admin recibe `403` en carrito/checkout/
  órdenes propias; provisión admin solo por admin con `must_change_password=false`.
- **Pagos tokenizados:** no se aceptan ni almacenan PAN/CVV. Wompi/Mercado Pago
  vía patrón Strategy/Adapter; webhook autoritativo; **la firma se valida sobre
  el raw body** antes de persistir; respuesta `204` idempotente al proveedor
  (el duplicado interno es clasificación ROP, no `409` expuesto).
- **Reservas:** carrito servidor con reserva por ítem; `ACTIVE` expira a los
  10 min de inactividad (reaper cada 1 min); `CHECKOUT_PENDING` permanece hasta
  terminal de pago/reconciliación.
- **Idempotencia:** `Idempotency-Key` en mutaciones (provisión admin, ajuste de
  stock, password-change, pagos); `idempotency_records` con snapshot mínimo sin
  PII y purga diaria local (scheduler cableado).

## Cómo ejecutar localmente

Requisitos: Node.js, PostgreSQL (Docker local en `:5433` según `.env.example`),
`npm`.

```bash
# 1. Instalar dependencias
npm install

# 2. Configurar entorno (NO versionar credenciales reales)
cp .env.example .env
#   editar DATABASE_URL, JWT_SECRET (>=32 bytes en producción),
#   INITIAL_ADMIN_PASSWORD (solo para bootstrap), y opcionalmente
#   BOOTSTRAP_INITIAL_ADMIN_ENABLED

# 3. Generar cliente Prisma y aplicar migraciones
npm run prisma:generate
npm run prisma:migrate:deploy      # aplica 001–014 contra PostgreSQL

# 4. (Opcional) Poblar catálogo dummy no productivo
npm run prisma:seed

# 5. Arrancar
npm run start:dev                  # watch
# o
npm run build && npm run start:prod
```

La API escucha en `PORT` (default 3000). El bootstrap del admin inicial
(`cristiansrc@gmail.com`, `must_change_password=true`) se ejecuta al arrancar si
`BOOTSTRAP_INITIAL_ADMIN_ENABLED=true` y el secreto externo está presente; si
falta el secreto, falla de forma segura sin crear usuario.

### Variables de entorno (`.env.example`)

| Variable | Descripción |
|---|---|
| `PORT` | Puerto HTTP (default 3000). |
| `NODE_ENV` | `development` | `production`. En producción, `JWT_SECRET` es obligatorio (≥32 bytes). |
| `JWT_SECRET` | Secreto JWT (mín. 32 bytes en producción). Nunca versionar el valor real. |
| `DATABASE_URL` | URL PostgreSQL para Prisma Migrate. |
| `INITIAL_ADMIN_PASSWORD` | Contraseña del admin inicial; solo por referencia externa (no versionar). |
| `BOOTSTRAP_INITIAL_ADMIN_ENABLED` | Habilita bootstrap al arrancar (default `true`). |
| `IDEMPOTENCY_PURGE_SCHEDULE_ENABLED` / `IDEMPOTENCY_PURGE_SCHEDULE_TIME` | Control del scheduler diario de purga (UTC `HH:MM`, default `02:00`). |

## Tests, build y lint

```bash
npm run build            # nest build
npm test                 # jest (unitarias)
npm run test:cov         # jest con cobertura
npm run test:integration # integración contra PostgreSQL (DATABASE_URL)
npm run depcruise        # prueba de arquitectura (dependency-cruiser)
```

- **Última medición local (comando `npm run test:cov`, exit code 0):**
  **125 suites / 1232 tests PASS**, `build` OK, `depcruise` sin violaciones.
  Esta cifra corresponde a la ejecución local documentada, no a un reporte de
  CI externo.
- **Cobertura (medición local final, `npm run test:cov`):**
  - **Statements:** 93.36%
  - **Branches:** 84.43%
  - **Functions:** 93.01%
  - **Lines:** 93.57%
  `package.json` define un `coverageThreshold` (gate de cobertura por
  global/dominio/aplicación). Estos porcentajes corresponden a la medición
  local final confirmada por el executor; no a un reporte de CI externo ni a un
  entorno de producción.
- **Integración:** existen scripts `scripts/integration-*.ts`, pero **no están
  cableados en CI** (`test:integration` no se ejecuta en la suite por defecto,
  TD-MSF-API-004).
- **Pendientes:** limpieza del `try/catch` técnico en `register/login/refresh/
  logout` (ROP sign, TD-NEW-ROP-SIGN, incremento `msf-id-rop-sign-cleanup`
  en `planning`); protecciones HTTP de borde (TD-NEW-HTTP-SEC).

## Estado de AWS

**AWS no está configurado.** Localmente: la API corre como proceso NestJS,
PostgreSQL en Docker, Prisma Migrate, scheduler de purga cableado al arranque y
métricas vía `prom-client`. Pendiente de configuración AWS: ECS Fargate, RDS
gestionado, S3+CloudFront/OAC, Secrets Manager, CloudWatch (destino de métricas),
SNS/SQS/DLQ, Route53/ACM, KMS, IAM/OIDC (TD-MSF-ID-002-03). No se solicitan
secretos por chat.

## Pendientes de decisión

- **Revalidación de Spec Validator:** el veredicto `ready` de 2026-08-17 quedó
  invalidado por MSF-ID-003 (password reset + migración 014) y por el replay de
  `POST /auth/password-change` (ADR-020). Requiere revalidación focalizada antes
  de handoff/cierre.
- **`iss`/`aud`/`typ` y proveedor JWT:** no definidos canónicamente; la
  implementación actual (HS256, sin `iss`/`aud`) es provisional (decisión
  pendiente).
- **Canal seguro de entrega del token de activación / email de reset:** el
  `EmailPort` es `NoopEmailAdapter` en v1; el outbox/SES/SMTP productivo es
  decisión operacional pendiente.
