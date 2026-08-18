/**
 * Códigos de error de transporte (no pertenecen al catálogo `DomainError`).
 *
 * La validación estructural (400) y el rate limiting (429) no son
 * `DomainError` (Master Spec §ROP): se representan en la capa de transporte.
 */

/** Código de transporte para rate limiting (429). */
export const TRANSPORT_CODE_RATE_LIMITED = 'RATE_LIMITED';

/** Código de transporte para validación estructural (400). */
export const TRANSPORT_CODE_INVALID_INPUT = 'INVALID_DOMAIN_INPUT';
