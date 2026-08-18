/**
 * Puerto de salida de consulta de sesión para el carrito.
 *
 * Solo lectura: verifica estado de sesión, expiración y rol del usuario.
 */
import { CartSession, CartUser } from '../models';

export interface SessionLookupPort {
  /** Busca una sesión por ID (guest o autenticada). */
  findById(sessionId: string): Promise<CartSession | null>;

  /** Busca el usuario asociado a una sesión autenticada. */
  findUserById(userId: string): Promise<CartUser | null>;
}
