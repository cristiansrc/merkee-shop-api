# merkee-shop-api

Backend / API del ecosistema **merkee.shop** (supermercado digital colombiano,
`es-CO`, COP). Monolito modular **NestJS + TypeScript** con arquitectura
**hexagonal** y **Programación Orientada a Resultados (ROP)**.

> Parte del workspace `merkee-workspace`. La fuente de verdad es
> `docs/specs/master_spec.md` y el contrato `docs/api/openapi.yaml`.

## Nota de entrega y trabajo post-entrega

> Resumen operativo del handoff. No expone secretos, tokens ni valores de
> Secrets Manager. Las URLs/DNS se citan solo cuando provienen del contexto
> verificado.

### Estado al momento de la entrega — 2026-08-18 por la mañana

Estado **reconstruido a partir de la evidencia disponible** (auditoría inicial y
revisión en disco); no se presenta como una medición exacta con timestamp del
momento. En ese punto:

- La **API funcionaba localmente** con NestJS + Prisma + tests (build y suites
  locales en verde según la revisión en disco de 2026-08-18).
- El **despliegue AWS no estaba operativo**:
  - ECR `merkee-backend-api` **sin imagen** según la auditoría inicial.
  - ECS con **desired 1 / running 0** (servicio en rollback / circuit breaker).
  - **Puertos y health check desalineados** (app 3000 / task 80 / target group
    8080; `/health` pendiente de alinear).
  - **Secrets Manager / RDS / DNS pendientes** de verificación operativa.

No se atribuyen bugs posteriores a este estado salvo que exista evidencia que
los vincule; el registro de incidentes de ese momento se mantiene en
`docs/DEPLOYMENT_STATUS.md`.

### Trabajo realizado después de la entrega — 2026-08-19

Hechos **verificados** durante la sesión de 2026-08-19:

- Sesión AWS **reautenticada**.
- ECS **alineado a subnets 1a/1d** y **task port 3000**.
- **Migraciones Prisma 001–014 aplicadas**.
- Fallo del **cart reaper** confirmado como `SET LOCAL statement_timeout`
  parametrizado (`42601` / `P2010`); corregido con literal seguro `Prisma.raw`.
- **Pruebas añadidas** y verificación de: `build`, **127 suites / 1239 tests**,
  `dependency-cruiser` y `prisma validate`.
- Imagen **`20260819-cart-reaper-health-fix`** construida y pusheada (digest
  `sha256:04afdc…`).
- **Task definition 16**; target group **`merkee-backend-tg-v2`** puerto **3000**
  y path **`/health`**.
- ECS **running = 1 / desired = 1**, rollout **COMPLETED**, target **healthy**.
- Logs `cart_reaper.batch_completed` **sin fallos observados**.

### Pendiente tras la corrección

- **DNS (Spaceship):** resuelto en la verificación post-entrega — `api.merkee.shop`
  ahora apunta vía **CNAME al DNS del ALB** y está **propagado** (dejó de devolver
  301 a `www.merkee.shop`). El detalle verificado está en
  `### Verificación post-entrega (resultado verificado posterior)`.
- **Seguridad / deuda pendiente:**
  - RDS `PubliclyAccessible = true`.
  - Security Group default permisivo / root.
  - Observabilidad / alarmas CloudWatch pendientes.
  - Una sola task / una sola AZ.
  - Adapters externos / fakes (`FakeS3MediaStorageAdapter`,
    `FakePaymentProviderAdapter`, `NoopEmailAdapter`).
- **Declaración:** el servicio está **técnicamente estable detrás del ALB**, pero
  **no se declara producción lista** (ver gates abiertos en este README).

### Verificación post-entrega (resultado verificado posterior)

Hechos **verificados** en la comprobación posterior al despliegue de 2026-08-19:

- **DNS (Spaceship):** el CNAME `api.merkee.shop` está **propagado** y apunta al
  ALB (ya no redirige a `www.merkee.shop`).
- **Ingress de red:** se habilitó el ingress TCP **443** y **80** en el Security
  Group `sg-049d2e925bdf67678`.
- **Redirección HTTP→HTTPS:** `http://api.merkee.shop` devuelve **301** a
  `https://api.merkee.shop`.
- **Health check público:** `GET https://api.merkee.shop/health` devuelve **200**
  con cuerpo `{"status":"ok"}` (sin autenticación, sin acceso a BD ni secretos).
- **ECS:** servicio **running = 1 / desired = 1**, rollout **COMPLETED**, target
  **healthy**; logs `cart_reaper` **sin `batch_failed` recientes**.

> **Deuda de hardening / operación (no invalida lo verificado arriba):**
> - El Security Group `sg-049d2e925bdf67678` **se comparte todavía entre el ALB y
>   ECS** (no hay SG dedicado por recurso).
> - Existen **target groups legacy** (anteriores a `merkee-backend-tg-v2`) sin
>   limpiar.
> - **No hay alarmas CloudWatch** configuradas (observabilidad pendiente).

### Tabla resumen

| Estado | Evidencia | Fecha |
|---|---|---|
| Entrega (mañana) — API local OK, AWS no operativo | Auditoría inicial + revisión en disco: ECR sin imagen, ECS 1/0, rollback, puertos/health desalineados, Secrets/RDS/DNS pendientes | 2026-08-18 |
| Post-entrega — corrección cart reaper + despliegue | Sesión AWS reauth; ECS subnets 1a/1d + port 3000; migraciones 001–014; `Prisma.raw` fix; 127 suites/1239 tests; imagen `20260819-cart-reaper-health-fix` (sha256:04afdc…); TD 16; TG `merkee-backend-tg-v2`:3000/`/health`; ECS 1/1 COMPLETED healthy; logs sin fallos | 2026-08-19 |
| Pendiente tras corrección — seguridad/deuda (DNS resuelto en verificación posterior) | `api.merkee.shop` resuelto vía CNAME al ALB (ver verificación posterior); RDS público, SG compartido ALB/ECS, observabilidad/alarmas, 1 task/AZ, fakes | 2026-08-19 (abierto) |
| Verificación post-entrega — DNS + ingress + health + ECS | CNAME `api.merkee.shop` propagado (ALB); ingress TCP 443/80 en `sg-049d2e925bdf67678`; HTTP 301→HTTPS; `GET https://api.merkee.shop/health` → 200 `{"status":"ok"}`; ECS 1/1 COMPLETED healthy; `cart_reaper` sin `batch_failed` | 2026-08-19 (verificado posterior) |

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

La API escucha en `PORT` (default 3000). Existe un endpoint de liveness
`GET /health` (sin autenticación, sin acceso a BD ni secretos; ver
`src/shared/http/health.controller.ts`, registrado en `HealthModule` e importado
por `app.module.ts`). **Nota de despliegue:** el `Dockerfile` tiene un comentario
stale que afirma lo contrario; el endpoint SÍ está presente en la fuente actual.
El estado del despliegue ECS, el health check y la alineación de puertos se
documentan en `docs/DEPLOYMENT_STATUS.md` y en `## Nota de entrega y trabajo
post-entrega`. El incidente de 2026-08-18 (rollback/circuit breaker, P1001 ya
corregido, puertos/health check desalineados) fue resuelto el 2026-08-19: ECS
  alineado a subnets 1a/1d, task port 3000, target group `merkee-backend-tg-v2`
  (`:3000`/`/health`), ECS running 1/1 COMPLETED. Seguridad/deuda siguen
  pendientes (DNS resuelto en verificación post-entrega; ver
  `## Nota de entrega y trabajo post-entrega`).

El bootstrap del admin inicial
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
  CI externo. Esta es la medición de pre-entrega (2026-08-18); la verificación
  post-entrega del 2026-08-19 reportó **127 suites / 1239 tests** (ver
  `## Nota de entrega y trabajo post-entrega`).
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

## Estado de AWS (revisado 2026-08-18; actualizado 2026-08-19)

**AWS configurado** en cuenta de aprendizaje, región `us-east-1`, un único
ambiente.

**Histórico (2026-08-18, mañana de entrega):** el despliegue estaba **en
despliegue / pendiente de verificación** (task definition `merkee-backend-task`
revision 2 con `taskRole` `merkee-backend-task-role` y mapeo `secrets` JSON;
servicio `merkee-backend-service` con running/health check por confirmar; ECS
desired 1 / running 0 en rollback/circuit breaker; ECR sin imagen según auditoría
inicial; puertos y health check desalineados). No se afirmaba despliegue
productivo terminado.

**Actual (2026-08-19, post-entrega):** el servicio fue corregido y llevado a
estado estable — ver `## Nota de entrega y trabajo post-entrega`. Resumen:
task definition **16**, target group **`merkee-backend-tg-v2`** (puerto **3000**,
path **`/health`**), ECS **running = 1 / desired = 1**, rollout **COMPLETED**,
  target **healthy**. El servicio es **técnicamente estable detrás del ALB** pero
  **no se declara producción lista** (seguridad/deuda pendiente; DNS resuelto en
  verificación post-entrega, ver nota y `docs/DEPLOYMENT_STATUS.md`).

- **Imagen:** Dockerfile multi-stage no-root creado y **build local validado**;
  repositorio ECR `merkee-backend-api` existe. Imagen
  **`20260819-cart-reaper-health-fix`** (digest `sha256:04afdc…`) construida y
  pusheada el 2026-08-19.
- **Secretos:** el secreto `merkee/app` (AWS Secrets Manager) está creado y es
  referenciado por la task definition vía mapeo `secrets` JSON. **No se exponen
  valores.** Las variables inyectadas son las del cuadro `Variables de entorno`
  (solo nombres); en AWS provienen de ese secreto, no de `.env` local.
- **RDS `merkee-db`:** existe; auditoría indicó `PubliclyAccessible=True` como
  riesgo pendiente (no se afirma corrección).
- **CI/CD:** workflows GitHub Actions migrados a OIDC (`merkee-github-actions-deploy`);
  validación CI antes de deploy. CI anterior falló por OIDC/permissions y secreto
  CloudFront vacío; fixes aplicados, pero no se afirma que el deploy final terminó.
- **Pendiente de verificación / deuda:** validación final ECS (TD-AWS-ECS-VALIDATION),
  RDS público (TD-AWS-RDS-PUBLIC), alarms/observabilidad CloudWatch
  (TD-AWS-OBSERVABILITY) y `swagger.merkee.shop` (TD-AWS-SWAGGER-DNS).
- **Incidente de despliegue:** ver `docs/DEPLOYMENT_STATUS.md`. El incidente de
  2026-08-18 (ECS en rollback/circuit breaker; P1001 por conectividad RDS ya
  corregido; desalineación de puertos app 3000 / task 80 / target group 8080 y
  health check `/health`) fue resuelto el 2026-08-19 mediante la alineación de
  ECS a subnets 1a/1d, task port 3000, target group v2 y la corrección del cart
  reaper. No se afirma servicio sano de forma incondicional: la seguridad/deuda
  sigue pendiente (DNS resuelto en verificación post-entrega; ver
  `## Nota de entrega y trabajo post-entrega`).

No se solicitan secretos por chat. La configuración de infra no altera el estado
de las specs (`validated-not-executed`); es estado operativo adicional.

> **Rehidratación honesta 2026-08-21:** este README conserva la trazabilidad histórica
> 2026-08-18 (API local OK, AWS no operativo ECR 0, ECS 1/0, puertos/health
> desalineados) y la verifica al **2026-08-21**: ECS estable, ECR publicado, CORS
> allowlist + PUT (`7fdb009`/`932a71a`), media `images.merkee.shop` OAC
> (`91ed871`/`02167cd`), prefijo `/v1` (`215b36b`), JWT guard real + `cookie-parser`
> + `clearCookie` (`932a71a`/`9e3ad3e`), `register` cliente `must_change=false`
> (`f62cee4`), cart guest→cliente transfer (`8948426`/`fe0b121`), sesión 30m
> (`580ff8f`). **No se declara producción lista** — gates RDS público,
> observabilidad, legal y scheduler siguen abiertos; evidencia fechada, puede
> cambiar. Ver sección `## Nota de entrega y trabajo post-entrega` y
> `../../docs/DEPLOYMENT_STATUS.md`.

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
