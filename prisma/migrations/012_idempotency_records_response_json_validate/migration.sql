-- Migration 012 — validación compensatoria de `response_json` (MSF-ID-002)
-- Expand/contract (posterior a 011): valida estrictamente el snapshot mínimo
-- canónico de `idempotency_records.response_json`:
--   { resource_id, status, activation_expires_at, body_hash }
-- sin claves extra, sin PII y sin secretos.
--
-- La migración 011 normalizaba a cuatro claves pero no validaba el contenido:
--   * `resource_id` podía ser una cadena arbitraria (no necesariamente UUID).
--   * `status` podía ser un entero fuera del rango HTTP o una cadena no numérica.
--   * `activation_expires_at` podía ser una cadena que no es RFC 3339/date-time.
--   * `body_hash` podía no ser un SHA-256 hexadecimal ni coincidir con la
--     columna `body_hash` (fuente de verdad de idempotencia).
--
-- Validación determinista de `activation_expires_at` (RFC 3339/date-time):
--   * La forma se valida con la expresión regular estricta de RFC 3339
--     (separador `T`, segundos obligatorios, fracción opcional y zona `Z` o
--     `±HH:MM`).
--   * El calendario se valida de forma REALMENTE determinista con el cast
--     nativo `::timestamptz` dentro de un bloque con captura de excepción:
--     PostgreSQL rechaza fechas de calendario imposibles (p. ej. `2026-02-30`,
--     `2026-13-01`, hora `24:00:00`) que la regex por sí sola aceptaría. Solo
--     se considera RFC 3339 válido si la forma Y el calendario pasan.
--   * Si el valor no es RFC 3339 válido se deriva del token de activación
--     vigente del usuario (`admin_activation_tokens.expires_at`); si tampoco
--     existe token, el registro no puede reconstruir la respuesta contractual
--     completa → se ELIMINA de forma conservadora (sin inventar datos).
--
-- Política segura documentada por código para legacy no reconstruible:
--   * Si `response_json` no es un objeto JSON o `resource_id` no es un UUID
--     válido (v1–v8, minúsculas) el registro NO puede cumplir el replay
--     contractual → se ELIMINA.
--   * Si `body_hash` del JSON no es un SHA-256 hexadecimal (64 hex) o no
--     coincide con la columna `body_hash`, el snapshot es inconsistente con la
--     idempotencia → se ELIMINA (no se conserva un hash divergente).
--   * `status` se valida como entero HTTP permitido (100–599); para provisión
--     el único status contractual es 201, por lo que cualquier valor no entero
--     o fuera de rango se normaliza a 201 (creación/replay contractual).
--
-- No almacena secretos ni PII. No altera el único contractual ni los índices.
-- No edita migraciones aplicadas (007/009/010/011 intactas).

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
  --    * resource_id no es un UUID válido.
  --    * body_hash del JSON no es un SHA-256 hexadecimal (64 hex) o no coincide
  --      con la columna body_hash (fuente de verdad de idempotencia).
  DELETE FROM "idempotency_records" ir
  WHERE NOT (
    jsonb_typeof(ir.response_json) = 'object'
    AND ir.response_json->>'resource_id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
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
    -- se considera válido. Si no, se deriva del token de activación; si
    -- tampoco, se elimina (política segura, sin inventar datos).
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
      SELECT MAX(t.expires_at)::text INTO expires
      FROM "admin_activation_tokens" t
      WHERE t.user_id = resource_id::uuid;
    END IF;

    IF expires IS NULL THEN
      -- Sin activation_expires_at determinable: no puede reconstruir la
      -- respuesta contractual completa → se elimina (política segura).
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