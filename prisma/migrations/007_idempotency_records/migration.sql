-- Migration 007 — idempotency_records
-- Objetos: idempotency_records.
-- Invariantes: único por (scope, idempotency_key); body_hash para detectar
-- reproducción divergente; response JSONB para reproducir la respuesta original
-- en reintentos idempotentes (provisión de admin).
-- No almacena secretos, tokens, contraseñas ni PII sensible.

-- CreateTable
CREATE TABLE "idempotency_records" (
    "id" UUID NOT NULL,
    "scope" VARCHAR(255) NOT NULL,
    "idempotency_key" UUID NOT NULL,
    "body_hash" VARCHAR(64) NOT NULL,
    "response" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- Único por alcance (creador autenticado) + clave de idempotencia.
CREATE UNIQUE INDEX "idempotency_records_scope_idempotency_key_key" ON "idempotency_records"("scope", "idempotency_key");
