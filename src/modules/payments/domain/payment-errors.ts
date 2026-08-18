import { DomainError, DomainErrorCode, domainError } from '../../../shared/domain/domain-error';

/**
 * Fábricas de `DomainError` para el módulo `payments` (Master Spec §91-95).
 *
 * Este archivo NO importa NestJS, Prisma ni HTTP: es TypeScript puro.
 */

export const paymentErrors = {
  technicalFailure(metadata?: Record<string, unknown>): DomainError {
    return domainError(
      DomainErrorCode.TECHNICAL_DEPENDENCY_FAILURE,
      'technical',
      'TECHNICAL_DEPENDENCY_FAILURE',
      metadata,
    );
  },

  paymentHoldNotConsumable(metadata?: Record<string, unknown>): DomainError {
    return domainError(
      DomainErrorCode.PAYMENT_HOLD_NOT_CONSUMABLE,
      'unprocessable',
      'PAYMENT_HOLD_NOT_CONSUMABLE',
      metadata,
    );
  },

  resourceNotFound(metadata?: Record<string, unknown>): DomainError {
    return domainError(
      DomainErrorCode.RESOURCE_NOT_FOUND,
      'not_found',
      'RESOURCE_NOT_FOUND',
      metadata,
    );
  },

  invalidDomainInput(metadata?: Record<string, unknown>): DomainError {
    return domainError(
      DomainErrorCode.INVALID_DOMAIN_INPUT,
      'validation',
      'INVALID_DOMAIN_INPUT',
      metadata,
    );
  },

  duplicateWebhookEvent(metadata?: Record<string, unknown>): DomainError {
    return domainError(
      DomainErrorCode.DUPLICATE_WEBHOOK_EVENT,
      'conflict',
      'DUPLICATE_WEBHOOK_EVENT',
      metadata,
    );
  },

  invalidWebhookSignature(metadata?: Record<string, unknown>): DomainError {
    return domainError(
      DomainErrorCode.INVALID_WEBHOOK_SIGNATURE,
      'authentication',
      'webhook.invalid_signature',
      metadata,
    );
  },

  invalidStateTransition(metadata?: Record<string, unknown>): DomainError {
    return domainError(
      DomainErrorCode.INVALID_STATE_TRANSITION,
      'conflict',
      'state.invalid_transition',
      metadata,
    );
  },
} as const;
