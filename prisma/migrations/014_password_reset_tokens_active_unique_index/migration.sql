-- Migración 014: Índice parcial único para tokens de reset activos por usuario.
-- Garantiza que máximo un token activo (used_at IS NULL) existe por usuario.
-- Expand/Contract: se crea el índice único parcial primero (expand); si la
-- migración falla por duplicados existentes, se deben limpiar manualmente
-- antes de aplicar (contract).
--
-- Esta migración NO edita migraciones aplicadas (001-013).

-- 1. Crear índice parcial único: un solo token activo por usuario.
CREATE UNIQUE INDEX IF NOT EXISTS idx_password_reset_tokens_active_per_user
  ON password_reset_tokens (user_id)
  WHERE used_at IS NULL;

-- 2. Verificar consistencia: si existen tokens duplicados activos,
-- la migración fallará con violación de unicidad.
