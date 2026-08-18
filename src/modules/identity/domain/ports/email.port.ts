import { Result } from '../../../../shared/domain/result';
import { DomainError } from '../../../../shared/domain/domain-error';

/**
 * Puerto de salida de envío de emails del módulo `identity`.
 *
 * Abstrae el canal de entrega de emails. La implementación concreta
 * (outbox/SES/SMTP) vive en infrastructure. Esta v1 usa un adaptador
 * noop que solo registra el envío.
 *
 * ROP: el puerto retorna `Result<void, DomainError>` para que las
 * excepciones técnicas se traduzcan en el adapter antes de llegar
 * al use case. El domain error NO contiene token/PII.
 *
 * El email contiene el token opaco en claro (para que el usuario lo use
 * en el flujo de reset). El token NUNCA se almacena en claro en la BD.
 */
export interface EmailPort {
  /**
   * Envía un email de restablecimiento de contraseña.
   * @param to Dirección de correo del destinatario
   * @param token Token opaco en claro (para incluir en el enlace/respuesta)
   * @returns Ok<void> si el envío fue exitoso, Failure<DomainError> si falló.
   *          El DomainError NO contiene el token ni PII.
   */
  sendPasswordResetEmail(
    to: string,
    token: string,
  ): Promise<Result<void, DomainError>>;
}
