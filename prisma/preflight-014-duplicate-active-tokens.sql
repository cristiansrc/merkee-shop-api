-- Preflight 014: Detectar tokens activos duplicados antes de aplicar el índice único parcial.
--
-- Propósito: La migración 014 crea un índice UNIQUE parcial WHERE used_at IS NULL.
-- Si existen tokens activos duplicados (mismo user_id, used_at IS NULL), la
-- migración fallará con violación de unicidad.
--
-- Uso: Ejecutar ANTES de `prisma migrate deploy` contra PostgreSQL.
--       psql -f prisma/preflight-014-duplicate-active-tokens.sql <database_url>
--
-- Resultado esperado: 0 filas = seguro aplicar migración.
--                      filas > 0 = limpiar manualmente antes de migrar (NO se ejecuta limpieza).
--
-- Esta consulta NO es destructiva: solo lee datos.

SELECT
  user_id,
  COUNT(*) AS active_token_count,
  ARRAY_AGG(id) AS token_ids,
  MIN(created_at) AS oldest_created_at,
  MAX(created_at) AS newest_created_at
FROM password_reset_tokens
WHERE used_at IS NULL
GROUP BY user_id
HAVING COUNT(*) > 1
ORDER BY active_token_count DESC;
