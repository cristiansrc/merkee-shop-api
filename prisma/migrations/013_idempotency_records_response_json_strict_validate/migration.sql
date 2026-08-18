-- Migration 013 — validación compensatoria estricta de `response_json` (MSF-ID-002)
-- Expand/contract (posterior a 012): corrige dos hallazgos de 011/012 sin
-- editar migraciones aplicadas (007/009/010/011/012 intactas).
--
-- Hallazgo 1 — derivación de `activation_expires_at` desde tokens usados o
-- expirados: 011/012 derivaban con `MAX(t.expires_at)` sobre CUALQUIER token
-- del usuario, incluidos los ya usados (`used_at IS NOT NULL`) o expirados
-- (`expires_at <= now()`). Esta migración deriva SOLO desde tokens vigentes
-- (`used_at IS NULL AND expires_at > now()`) con selección determinista
-- (`ORDER BY t.expires_at DESC LIMIT 1`); si no existe token vigente, el
-- registro no puede reconstruir la respuesta contractual → se ELIMINA de
-- forma conservadora (sin inventar datos ni derivar de tokens usados/expirados).
--
-- Hallazgo 2 — validación de `resource_id` como UUID v1–v8 con variante
-- RFC 4122: 011/012 aceptaban cualquier nibble de versión/variante
-- (`^[0-9a-f]{4}-[0-9a-f]{4}$`). PostgreSQL no ofrece validación nativa de
-- versión/variante UUID, por lo que se valida con la misma expresión regular
-- declarada en el código (`admin-provision-scope-evaluator.adapter.ts`):
--   ^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$
-- (versión 1–8 y variante RFC 4122 `10xx` → `[89ab]`). Si no cumple, el
-- registro no puede cumplir el replay contractual → se ELIMINA.
--
-- Se conservan las validaciones de 012 (objeto JSON, body_hash SHA-256
-- coincidente con la columna, status HTTP 100–599 → 201 y RFC 3339
-- determinista con cast nativo `::timestamptz`).
--
-- No almacena secretos ni PII. No altera el único contractual ni los índices.

DO $$
DECLARE
  rec RECORD;
  resource_id text;
  status_val int;
  expires text;
  is_rfc3339 boolean;
  parsed_ts timestamptz;
BEGIN
  -- 1. Eliminar registros no reconstruibles o inconsistentes:
  --    * response_json no es un objeto JSON (no puede tener las cuatro claves).
  --    * resource_id no es un UUID v1–v8 con variante RFC 4122 (regex
  --      declarada en el código; PostgreSQL no valida versión/variante nativo).
  --    * body_hash del JSON no es un SHA-256 hexadecimal (64 hex) o no coincide
  --      con la columna body_hash (fuente de verdad de idempotencia).
  DELETE FROM "idempotency_records" ir
  WHERE NOT (
    jsonb_typeof(ir.response_json) = 'object'
    AND ir.response_json->>'resource_id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND ir.response_json->>'body_hash' ~ '^[0-9a-f]{64}$'
    AND ir.response_json->>'body_hash' = ir.body_hash
  );

  -- 2. Normalizar los registros reconstruibles a exactamente cuatro claves.
  FOR rec IN
    SELECT id, body_hash, response_json
    FROM "idempotency_records"
  LOOP
    resource_id := rec.response_json->>'resource_id';

    -- status: entero HTTP permitido (100–599); para provisión el único status
    -- contractual es 201. Si no es un entero HTTP válido se normaliza a 201.
    IF (rec.response_json->>'status') ~ '^[0-9]+$'
       AND (rec.response_json->>'status')::int BETWEEN 100 AND 599 THEN
      status_val := (rec.response_json->>'status')::int;
    ELSE
      status_val := 201;
    END IF;

    -- activation_expires_at: RFC 3339/date-time válido de forma determinista.
    -- La regex valida la forma; el cast nativo `::timestamptz` valida el
    -- calendario (PostgreSQL rechaza fechas imposibles). Solo si ambos pasan
    -- se considera válido. Si no, se deriva SOLO del token de activación
    -- VIGENTE (`used_at IS NULL AND expires_at > now()`) con selección
    -- determinista; si no existe token vigente, se elimina (política segura,
    -- sin inventar datos ni derivar de tokens usados/expirados).
    expires := rec.response_json->>'activation_expires_at';
    is_rfc3339 := expires IS NOT NULL AND expires ~
      '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$';
    IF is_rfc3339 THEN
      BEGIN
        parsed_ts := expires::timestamptz;
      EXCEPTION WHEN others THEN
        is_rfc3339 := false;
      END;
    END IF;
    IF NOT is_rfc3339 THEN
      expires := NULL;
    END IF;
    IF expires IS NULL THEN
      SELECT t.expires_at::text INTO expires
      FROM "admin_activation_tokens" t
      WHERE t.user_id = resource_id::uuid
        AND t.used_at IS NULL
        AND t.expires_at > now()
      ORDER BY t.expires_at DESC
      LIMIT 1;
    END IF;

    IF expires IS NULL THEN
      -- Sin activation_expires_at determinable desde un token VIGENTE: no
      -- puede reconstruir la respuesta contractual completa → se elimina
      -- (política segura, sin inventar datos ni derivar de tokens usados).
      DELETE FROM "idempotency_records" WHERE "id" = rec.id;
      CONTINUE;
    END IF;

    UPDATE "idempotency_records"
    SET "response_json" = jsonb_build_object(
      'resource_id', resource_id,
      'status', status_val,
      'activation_expires_at', expires,
      'body_hash', rec.body_hash
    )
    WHERE "id" = rec.id;
  END LOOP;
END $$;