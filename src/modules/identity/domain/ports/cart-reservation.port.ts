import { Result } from '../../../../shared/domain/result';
import { DomainError } from '../../../../shared/domain/domain-error';

/**
 * Puerto de salida de transición de carrito del módulo `identity`.
 *
 * Abstrae las operaciones sobre el carrito necesarias durante la
 * promoción de sesión guest→admin (liberar reservas ACTIVE, cerrar
 * carrito). La implementación concreta vive en el módulo
 * `cart-reservation` y se inyecta como dependencia.
 *
 * Cada método devuelve `Result<void, DomainError>`: el adapter captura
 * excepciones técnicas en su límite y las traduce a `TECHNICAL_DEPENDENCY_FAILURE`
 * (Master Spec §ROP). La aplicación nunca captura excepciones técnicas.
 */
export interface CartReservationPort {
  /** Libera todas las reservas ACTIVE de la sesión guest. */
  releaseActiveReservations(sessionId: string): Promise<Result<void, DomainError>>;
  /** Cierra el carrito de la sesión guest. */
  closeCart(sessionId: string): Promise<Result<void, DomainError>>;
}
