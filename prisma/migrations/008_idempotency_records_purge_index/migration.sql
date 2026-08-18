-- Migration 008 — idempotency_records purge selection index
-- Objetos: índice de selección para el job de purga de idempotency_records.
-- Invariantes: no altera el único contractual (scope, idempotency_key); añade
-- un índice compatible con `created_at` para que el job de purga (ADR-018)
-- seleccione batches de filas con retención vencida de forma eficiente.
-- No almacena secretos, tokens, contraseñas ni PII sensible.

-- CreateIndex
-- Índice de selección para la purga: filas con retención vencida
-- (created_at < now() - interval '30 days') se seleccionan con
-- FOR UPDATE SKIP LOCKED en batches de hasta 500.
CREATE INDEX "idempotency_records_created_at_idx" ON "idempotency_records"("created_at");
