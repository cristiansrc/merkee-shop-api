-- Migration 009 — rename idempotency_records.response -> response_json
-- Expand/contract: renombra la columna al nombre canónico del contrato
-- `response_json`. No altera el único contractual ni el índice de purga.
-- No almacena secretos ni PII.
ALTER TABLE "idempotency_records" RENAME COLUMN "response" TO "response_json";
