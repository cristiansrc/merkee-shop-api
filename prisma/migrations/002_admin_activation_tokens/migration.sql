-- Migration 002 — admin_activation_tokens
-- Objetos: admin_activation_tokens.
-- Invariantes: token_hash único; used_at nullable; índice parcial único
-- `WHERE used_at IS NULL` (sin `expires_at > now()` en el índice, no determinista);
-- la vigencia se valida atómicamente en el canje con `used_at IS NULL AND expires_at > now()`;
-- la reemisión marca/revoca el token no usado expirado antes de insertar uno nuevo.
-- Jamás se persiste token en claro.

-- CreateTable
CREATE TABLE "admin_activation_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(255) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "admin_activation_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admin_activation_tokens_token_hash_key" ON "admin_activation_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "admin_activation_tokens_expires_at_used_at_idx" ON "admin_activation_tokens"("expires_at", "used_at");

-- CreateIndex
CREATE INDEX "admin_activation_tokens_user_id_used_at_idx" ON "admin_activation_tokens"("user_id", "used_at");

-- CreateIndex
-- Índice parcial único: a lo sumo un token no usado por admin.
-- La vigencia `expires_at > now()` NO forma parte del índice (no determinista);
-- se valida atómicamente en la transacción de canje.
CREATE UNIQUE INDEX "admin_activation_tokens_user_id_unused_key" ON "admin_activation_tokens"("user_id") WHERE "used_at" IS NULL;

-- AddForeignKey
ALTER TABLE "admin_activation_tokens" ADD CONSTRAINT "admin_activation_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_activation_tokens" ADD CONSTRAINT "admin_activation_tokens_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
