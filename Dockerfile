# =============================================================================
# Dockerfile multi-stage — merkee-shop-api
# NestJS + TypeScript + Prisma (PostgreSQL) + argon2
# Base: node:20-bookworm-slim (~80MB runtime)
# =============================================================================

# ---------------------------------------------------------------------------
# Stage 1: deps — Instalación reproducible de dependencias
# ---------------------------------------------------------------------------
FROM node:20-bookworm-slim AS deps

# Instalar dependencias del sistema necesarias para argon2 (compilación nativa)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copiar solo archivos necesarios para resolver dependencias
COPY package.json package-lock.json ./

# Instalar dependencias de producción y desarrollo (necesarias para build)
# --ignore-scripts evita ejecutar postinstall de prisma antes de tiempo
RUN npm ci --ignore-scripts

# Rebuild de argon2 (nativo, necesita gcc/make/python)
RUN npm rebuild argon2

# ---------------------------------------------------------------------------
# Stage 2: build — Compilación TypeScript + Prisma generate
# ---------------------------------------------------------------------------
FROM node:20-bookworm-slim AS build

# Dependencias del sistema para compilación nativa (argon2)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copiar node_modules del stage deps
COPY --from=deps /app/node_modules ./node_modules

# Copiar fuente del proyecto
COPY package.json tsconfig.json tsconfig.build.json nest-cli.json ./
COPY prisma ./prisma
COPY src ./src

# Generar cliente Prisma con engines multi-plataforma (native + debian-openssl-1.1.x + 3.0.x)
# Los targets se definen en schema.prisma vía binaryTargets; no se usa sed.
ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"
RUN npx prisma generate && \
    echo "--- Prisma engines generados ---" && \
    find node_modules/.prisma -name "*.node" -exec echo "  engine: {}" \; 2>/dev/null || true

# Compilar TypeScript (nest build)
RUN npm run build

# Guardar el cliente Prisma generado antes de prune
RUN mkdir -p /prisma-client && cp -r /app/node_modules/.prisma /prisma-client/ && cp -r /app/node_modules/@prisma /prisma-client/

# Dependencias de producción solamente (sin devDependencies)
RUN npm prune --production

# Restaurar el cliente Prisma generado (eliminado por prune al estar en devDeps)
RUN cp -r /prisma-client/.prisma /app/node_modules/ && cp -r /prisma-client/@prisma /app/node_modules/

# ---------------------------------------------------------------------------
# Stage 3: runtime — Imagen final mínima, no-root, solo producción
# ---------------------------------------------------------------------------
FROM node:20-bookworm-slim AS runtime

# Metadatos de imagen
LABEL maintainer="merkee-shop-team"
LABEL description="merkee-shop-api — NestJS + Prisma backend"
LABEL version="0.1.0"

# Instalar dependencias del sistema para argon2 en runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
    libargon2-1 \
    && rm -rf /var/lib/apt/lists/*

# Crear directorio de trabajo
WORKDIR /app

# Usuario no-root (node viene predefinido en la imagen node:*)
USER node

# Copiar artefactos del stage build
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json ./

# Copiar prisma schema y migraciones (necesarios para prisma migrate deploy externo)
COPY --from=build --chown=node:node /app/prisma ./prisma

# Verificar engines Prisma disponibles en runtime
RUN echo "--- Prisma engines en runtime ---" && \
    ls -la node_modules/.prisma/client/ && \
    find node_modules/@prisma -name "*.node" 2>/dev/null || true

# Variables de entorno de runtime
ENV NODE_ENV=production
ENV PORT=3000

# Puerto expuesto
EXPOSE 3000

# No healthcheck: el main.ts no expusa endpoint /health real
# Si se añade GET /health, agregar:
# HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
#   CMD node -e "require('http').get('http://localhost:3000/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1) })"

# Arrancar NestJS
# Las migraciones de Prisma se ejecutan externamente (Job/InitContainer), no aquí.
CMD ["node", "dist/main"]
