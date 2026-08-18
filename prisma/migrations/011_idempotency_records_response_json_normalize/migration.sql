-- Migration 011 — normalización compensatoria de `response_json` al snapshot
-- mínimo exacto de cuatro claves (posterior a 010).
--
-- La migración 010 retenía registros no reconstruibles con una quinta clave
-- `unrecoverable` y omitía `activation_expires_at` cuando no era determinable.
-- Esta migración compensatoria garantiza que `response_json` quede EXACTAMENTE
-- con las cuatro claves canónicas:
--   { resource_id, status, activation_expires_at, body_hash }
-- sin `unrecoverable`, sin claves opcionales y sin PII.
--
-- Política segura documentada por código para legacy no reconstruible:
--   * Si `resource_id` no puede determinarse (ni `resource_id`/`resourceId`/`id`),
--     el registro NO puede cumplir el replay contractual → se ELIMINA durante el
--     backfill (no se conserva una quinta clave ni un marcador).
--   * Si `activation_expires_at` no puede determinarse desde el JSON (canónico o
--     legacy), se deriva del token de activación vigente del usuario
--     (`admin_activation_tokens.expires_at`); si tampoco existe token, el registro
--     no puede reconstruir la respuesta contractual completa → se ELIMINA.
--   * `status` se normaliza a entero HTTP (201 para creación/replay contractual).
--   * `body_hash` siempre se toma de la columna (fuente de verdad de idempotencia).
--
-- No almacena secretos ni PII. No altera el único contractual ni los índices.

DO $$
DECLARE
  rec RECORD;
  resource_id text;
  status_val int;
  expires text;
BEGIN
  -- 1. Eliminar registros legacy no reconstruibles (sin resource_id determinable):
  --    no pueden cumplir el replay contractual.
  DELETE FROM "idempotency_records" ir
  WHERE COALESCE(
    ir.response_json->>'resource_id',
    ir.response_json->>'resourceId',
    ir.response_json->>'id'
  ) IS NULL;

  -- 2. Normalizar los registros reconstruibles a exactamente cuatro claves.
  FOR rec IN
    SELECT id, body_hash, response_json
    FROM "idempotency_records"
  LOOP
    resource_id := COALESCE(
      rec.response_json->>'resource_id',
      rec.response_json->>'resourceId',
      rec.response_json->>'id'
    );

    -- status normalizado a entero HTTP (201 por defecto para provisión).
    IF (rec.response_json->>'status') ~ '^[0-9]+$' THEN
      status_val := (rec.response_json->>'status')::int;
    ELSE
      status_val := 201;
    END IF;

    -- activation_expires_at: canónico, legacy o derivado del token de activación.
    expires := COALESCE(
      rec.response_json->>'activation_expires_at',
      rec.response_json->>'activationExpiresAt'
    );
    IF expires IS NULL AND resource_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      SELECT MAX(t.expires_at)::text INTO expires
      FROM "admin_activation_tokens" t
      WHERE t.user_id = resource_id::uuid;
    END IF;

    IF expires IS NULL THEN
      -- Sin activation_expires_at determinable: no puede reconstruir la respuesta
      -- contractual completa → se elimina (política segura).
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
