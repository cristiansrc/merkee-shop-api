import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Verifica el drift `response` vs contrato `response_json` (MSF-ID-002):
 * la columna canónica en Prisma y en la migración expand/contract debe ser
 * `response_json`, sin editar la migración aplicada 007.
 */
describe('IdempotencyRecord response_json (schema/rename)', () => {
  const schemaPath = join(
    __dirname,
    '../../../../../prisma/schema.prisma',
  );
  const migrationPath = join(
    __dirname,
    '../../../../../prisma/migrations/009_idempotency_records_response_json_rename/migration.sql',
  );
  const appliedMigrationPath = join(
    __dirname,
    '../../../../../prisma/migrations/007_idempotency_records/migration.sql',
  );
  const backfillMigrationPath = join(
    __dirname,
    '../../../../../prisma/migrations/010_idempotency_records_response_json_backfill/migration.sql',
  );
  const normalizeMigrationPath = join(
    __dirname,
    '../../../../../prisma/migrations/011_idempotency_records_response_json_normalize/migration.sql',
  );
  const validateMigrationPath = join(
    __dirname,
    '../../../../../prisma/migrations/012_idempotency_records_response_json_validate/migration.sql',
  );
  const strictValidateMigrationPath = join(
    __dirname,
    '../../../../../prisma/migrations/013_idempotency_records_response_json_strict_validate/migration.sql',
  );

  it('el modelo Prisma usa el nombre canónico response_json', () => {
    const schema = readFileSync(schemaPath, 'utf8');
    expect(schema).toContain('responseJson   Json     @map("response_json")');
    expect(schema).not.toMatch(/^\s*response\s+Json/m);
  });

  it('la migración 009 renombra la columna response -> response_json', () => {
    const migration = readFileSync(migrationPath, 'utf8');
    expect(migration).toContain(
      'ALTER TABLE "idempotency_records" RENAME COLUMN "response" TO "response_json";',
    );
  });

  it('la migración aplicada 007 no se edita (sigue con response)', () => {
    const applied = readFileSync(appliedMigrationPath, 'utf8');
    expect(applied).toContain('"response" JSONB NOT NULL');
  });

  it('la migración 010 backfillea response_json al snapshot mínimo sin PII', () => {
    const backfill = readFileSync(backfillMigrationPath, 'utf8');
    // Normaliza al snapshot canónico mínimo con body_hash.
    expect(backfill).toContain("'resource_id'");
    expect(backfill).toContain("'status'");
    expect(backfill).toContain("'activation_expires_at'");
    expect(backfill).toContain("'body_hash'");
    // Deriva resource_id desde claves canónicas o legacy.
    expect(backfill).toContain("rec.response_json->>'resource_id'");
    expect(backfill).toContain("rec.response_json->>'resourceId'");
    expect(backfill).toContain("rec.response_json->>'id'");
    // status normalizado a entero HTTP 201 para creación/replay.
    expect(backfill).toContain('status_val := 201');
    // body_hash siempre desde la columna (fuente de verdad de idempotencia).
    expect(backfill).toContain("'body_hash', rec.body_hash");
    // No copia PII ni secretos.
    expect(backfill).not.toContain("'email'");
    expect(backfill).not.toContain("'display_name'");
    expect(backfill).not.toContain("'phone'");
    expect(backfill).not.toContain("'password'");
    expect(backfill).not.toContain("'token'");
  });

  it('la migración 011 normaliza response_json a exactamente cuatro claves sin unrecoverable', () => {
    const normalize = readFileSync(normalizeMigrationPath, 'utf8');
    // Construye el snapshot con las cuatro claves canónicas exactas.
    expect(normalize).toContain("'resource_id', resource_id");
    expect(normalize).toContain("'status', status_val");
    expect(normalize).toContain("'activation_expires_at', expires");
    expect(normalize).toContain("'body_hash', rec.body_hash");
    // No conserva una quinta clave ni marcador `unrecoverable`.
    expect(normalize).not.toContain("'unrecoverable'");
    // Política segura: elimina registros legacy no reconstruibles (sin
    // resource_id determinable) porque no pueden cumplir el replay contractual.
    expect(normalize).toContain('DELETE FROM "idempotency_records"');
    // Deriva activation_expires_at desde el token de activación si falta en JSON.
    expect(normalize).toContain('admin_activation_tokens');
    // No copia PII ni secretos.
    expect(normalize).not.toContain("'email'");
    expect(normalize).not.toContain("'display_name'");
    expect(normalize).not.toContain("'phone'");
    expect(normalize).not.toContain("'password'");
    expect(normalize).not.toContain("'token'");
  });

  it('la migración 012 valida resource_id como UUID y elimina los no reconstruibles', () => {
    const validate = readFileSync(validateMigrationPath, 'utf8');
    // Rechaza resource_id que no es un UUID v1–v8 en minúsculas.
    expect(validate).toContain(
      "ir.response_json->>'resource_id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'",
    );
    // Rechaza response_json que no es un objeto JSON (no puede tener las cuatro
    // claves canónicas).
    expect(validate).toContain("jsonb_typeof(ir.response_json) = 'object'");
    // Los registros con resource_id no-UUID se eliminan (no reconstruibles).
    expect(validate).toContain('DELETE FROM "idempotency_records"');
  });

  it('la migración 012 valida status como entero HTTP permitido y normaliza a 201', () => {
    const validate = readFileSync(validateMigrationPath, 'utf8');
    // status debe ser un entero HTTP (100–599); no cualquier cadena.
    expect(validate).toContain("(rec.response_json->>'status')::int BETWEEN 100 AND 599");
    // Cualquier valor no entero o fuera de rango se normaliza a 201 (provisión).
    expect(validate).toContain('status_val := 201');
  });

  it('la migración 012 valida activation_expires_at como RFC 3339/date-time determinista', () => {
    const validate = readFileSync(validateMigrationPath, 'utf8');
    // La regex valida la forma estricta de RFC 3339 (separador T, zona Z/±HH:MM).
    expect(validate).toContain(
      "'^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\\.[0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$'",
    );
    // El calendario se valida de forma REALMENTE determinista con el cast nativo
    // ::timestamptz dentro de un bloque con captura de excepción (PostgreSQL
    // rechaza fechas imposibles como 2026-02-30 o 2026-13-01 que la regex sola
    // aceptaría). Sin el cast, un valor como 2026-99-99T99:99:99Z sería válido.
    expect(validate).toContain('parsed_ts := expires::timestamptz;');
    expect(validate).toContain('EXCEPTION WHEN others THEN');
    expect(validate).toContain('is_rfc3339 := false;');
    // Si no es RFC 3339 se deriva del token de activación; si tampoco, se elimina.
    expect(validate).toContain('admin_activation_tokens');
    expect(validate).toContain('DELETE FROM "idempotency_records" WHERE "id" = rec.id');
  });

  it('la migración 012 valida body_hash como SHA-256 hexadecimal y su correspondencia con la columna', () => {
    const validate = readFileSync(validateMigrationPath, 'utf8');
    // body_hash debe ser un SHA-256 hexadecimal (64 hex).
    expect(validate).toContain("ir.response_json->>'body_hash' ~ '^[0-9a-f]{64}$'");
    // body_hash del JSON debe coincidir con la columna (fuente de verdad).
    expect(validate).toContain("ir.response_json->>'body_hash' = ir.body_hash");
    // Un snapshot con body_hash divergente o no hexadecimal se elimina.
    expect(validate).toContain('DELETE FROM "idempotency_records"');
  });

  it('la migración 012 produce el snapshot exacto de cuatro claves sin PII ni claves extra', () => {
    const validate = readFileSync(validateMigrationPath, 'utf8');
    // Construye exactamente las cuatro claves canónicas.
    expect(validate).toContain("'resource_id', resource_id");
    expect(validate).toContain("'status', status_val");
    expect(validate).toContain("'activation_expires_at', expires");
    expect(validate).toContain("'body_hash', rec.body_hash");
    // No conserva claves extra ni marcadores.
    expect(validate).not.toContain("'unrecoverable'");
    // No copia PII ni secretos.
    expect(validate).not.toContain("'email'");
    expect(validate).not.toContain("'display_name'");
    expect(validate).not.toContain("'phone'");
    expect(validate).not.toContain("'password'");
    expect(validate).not.toContain("'token'");
  });

  it('la migración 013 deriva activation_expires_at SOLO desde tokens vigentes (used_at IS NULL AND expires_at > now())', () => {
    const strict = readFileSync(strictValidateMigrationPath, 'utf8');
    // Filtro estricto de vigencia: nunca deriva desde tokens usados o expirados.
    expect(strict).toContain('t.used_at IS NULL');
    expect(strict).toContain('t.expires_at > now()');
    // Selección determinista (ORDER BY expires_at DESC LIMIT 1), no MAX sobre
    // cualquier token.
    expect(strict).toContain('ORDER BY t.expires_at DESC');
    expect(strict).toContain('LIMIT 1');
    // Si no existe token vigente, el registro se elimina de forma conservadora.
    expect(strict).toContain('DELETE FROM "idempotency_records" WHERE "id" = rec.id');
  });

  it('la migración 013 valida resource_id como UUID v1–v8 con variante RFC 4122 y elimina los inválidos', () => {
    const strict = readFileSync(strictValidateMigrationPath, 'utf8');
    // Versión 1–8 ([1-8]) y variante RFC 4122 ([89ab]), equivalente a la regex
    // declarada en admin-provision-scope-evaluator.adapter.ts. PostgreSQL no
    // valida versión/variante de forma nativa, por lo que se valida con regex.
    expect(strict).toContain(
      "ir.response_json->>'resource_id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'",
    );
    // Rechaza versiones fuera de 1–8 (p. ej. v0/v9) y variantes no RFC 4122
    // (p. ej. [0-7] o [cd-f]).
    expect(strict).not.toContain(
      "ir.response_json->>'resource_id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'",
    );
    // Los registros con resource_id no-UUID v1–v8/RFC 4122 se eliminan.
    expect(strict).toContain('DELETE FROM "idempotency_records"');
  });

  it('la migración 013 produce el snapshot exacto de cuatro claves sin PII ni claves extra', () => {
    const strict = readFileSync(strictValidateMigrationPath, 'utf8');
    // Construye exactamente las cuatro claves canónicas.
    expect(strict).toContain("'resource_id', resource_id");
    expect(strict).toContain("'status', status_val");
    expect(strict).toContain("'activation_expires_at', expires");
    expect(strict).toContain("'body_hash', rec.body_hash");
    // No conserva claves extra ni marcadores.
    expect(strict).not.toContain("'unrecoverable'");
    // No copia PII ni secretos.
    expect(strict).not.toContain("'email'");
    expect(strict).not.toContain("'display_name'");
    expect(strict).not.toContain("'phone'");
    expect(strict).not.toContain("'password'");
    expect(strict).not.toContain("'token'");
  });

  // ---------------------------------------------------------------------------
  // Tests estáticos de drift `response` vs contrato `responseJson` (MSF-ID-002)
  // ---------------------------------------------------------------------------

  const domainPortPath = join(
    __dirname,
    '../../domain/ports/idempotency.port.ts',
  );
  const prismaAdapterPath = join(
    __dirname,
    '../adapters/prisma-idempotency.adapter.ts',
  );
  const provisionUseCasePath = join(
    __dirname,
    '../../application/use-cases/provision-admin-user.use-case.ts',
  );

  it('el puerto IdempotencyPort expone el campo canónico responseJson (no response)', () => {
    const source = readFileSync(domainPortPath, 'utf8');
    // Debe usar el nombre canónico en la entidad de dominio y en save().
    expect(source).toMatch(/readonly\s+responseJson\s*:\s*unknown/);
    // El parámetro del método save() también se llama responseJson.
    expect(source).toContain('responseJson: unknown');
    // No debe quedar ningún `readonly response: unknown` legacy.
    expect(source).not.toMatch(/readonly\s+response\s*:\s*unknown/);
    // Y ningún parámetro `response: unknown` en save().
    expect(source).not.toMatch(/save\([\s\S]*?\bresponse\s*:\s*unknown/);
  });

  it('el adapter PrismaIdempotencyAdapter usa responseJson en mappings dominio↔Prisma', () => {
    const source = readFileSync(prismaAdapterPath, 'utf8');
    // Mapeos canónicos a/desde la fila Prisma.
    expect(source).toContain('responseJson: row.response_json');
    expect(source).toContain('responseJson: responseJson as Prisma.InputJsonValue');
    expect(source).toContain('responseJson: row.responseJson');
    // Ningún mapeo con el nombre legacy `response:` debe quedar.
    expect(source).not.toMatch(/response:\s*row\.response_json/);
    expect(source).not.toMatch(/response:\s*row\.responseJson/);
    expect(source).not.toMatch(/response:\s*response\s+as\s+Prisma/);
  });

  it('el caso de uso ProvisionAdminUserUseCase lee .responseJson (no .response) del registro de idempotencia', () => {
    const source = readFileSync(provisionUseCasePath, 'utf8');
    // Identifica explícitamente el snapshot desde la instantánea canónica.
    // El patrón busca acceso a `.responseJson` en una variable (cualquier
    // nombre) para lectura del snapshot. No depende del nombre de variable.
    expect(source).toMatch(/\.\s*responseJson\b/);
    // Ningún `existing.response` (sin sufijo Json) debe quedar como acceso
    // al campo legacy. El negativo usa word boundary para no falsos positivos
    // con `responseJson` ni con `response_json`.
    expect(source).not.toMatch(/existing\.response\b(?!\s*Json)/);
  });
});
