-- Migration 010 — backfill idempotency_records.response_json al snapshot mínimo
-- Expand/contract (posterior a 009): normaliza los registros históricos de
-- `response_json` al snapshot canónico mínimo
--   { resource_id, status, activation_expires_at, body_hash }
-- sin copiar PII (email/display_name/phone) ni secretos (token/password/hash de
-- credencial). Elimina las claves prohibidas del JSON existente y conserva solo
-- los campos que pueden determinarse de forma segura.
--
-- Decisiones conservadoras documentadas:
--   * `resource_id` se deriva de `resource_id` | `resourceId` | `id`.
--   * `status` se normaliza a entero HTTP: si es numérico se conserva; si es la
--     cadena `created` (o ausente) se fija a 201 (creación/replay contractual).
--   * `activation_expires_at` se deriva de `activation_expires_at` |
--     `activationExpiresAt`; si no puede determinarse se omite (no se inventa).
--   * `body_hash` siempre se toma de la columna `body_hash` (fuente de verdad de
--     idempotencia), nunca del JSON.
--   * Si un registro histórico no puede reconstruirse de forma segura (sin
--     `resource_id` determinable), se retiene de forma conservadora con un
--     marcador `unrecoverable: true` y SIN PII, para que el replay devuelva un
--     error seguro en lugar de datos falsos. No se elimina el registro (la
--     purga conserva la política de retención existente).
--
-- No almacena secretos ni PII. No altera el único contractual ni los índices.

DO $$
DECLARE
  rec RECORD;
  new_json jsonb;
  resource_id text;
  status_val int;
  expires text;
BEGIN
  FOR rec IN
    SELECT id, body_hash, response_json
    FROM "idempotency_records"
  LOOP
    -- 1. resource_id determinable desde claves canónicas o legacy.
    resource_id := COALESCE(
      rec.response_json->>'resource_id',
      rec.response_json->>'resourceId',
      rec.response_json->>'id'
    );

    -- 2. status normalizado a entero HTTP (201 por defecto para provisión).
    IF (rec.response_json->>'status') ~ '^[0-9]+$' THEN
      status_val := (rec.response_json->>'status')::int;
    ELSE
      status_val := 201;
    END IF;

    -- 3. activation_expires_at determinable (canónico o legacy).
    expires := COALESCE(
      rec.response_json->>'activation_expires_at',
      rec.response_json->>'activationExpiresAt'
    );

    IF resource_id IS NOT NULL THEN
      -- Snapshot mínimo reconstruible: solo campos canónicos, sin PII.
      new_json := jsonb_build_object(
        'resource_id', resource_id,
        'status', status_val,
        'body_hash', rec.body_hash
      );
      IF expires IS NOT NULL THEN
        new_json := new_json || jsonb_build_object('activation_expires_at', expires);
      END IF;
    ELSE
      -- No reconstruible de forma segura: retención conservadora sin PII.
      new_json := jsonb_build_object(
        'status', status_val,
        'body_hash', rec.body_hash,
        'unrecoverable', true
      );
    END IF;

    UPDATE "idempotency_records"
    SET "response_json" = new_json
    WHERE "id" = rec.id;
  END LOOP;
END $$;
