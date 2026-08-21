/**
 * Puerto de salida de consulta de producto para el carrito.
 *
 * Solo lectura: el carrito necesita precio, stock y datos mínimos del producto
 * para calcular totales y validar disponibilidad.
 */
import { CartProduct } from '../models';

export interface ProductLookupPort {
  /** Busca un producto activo por ID para uso del carrito. */
  findActiveForCart(productId: string): Promise<CartProduct | null>;

  /** Busca múltiples productos activos por IDs para uso del carrito. */
  findActiveForCartByIds(productIds: readonly string[]): Promise<Map<string, CartProduct>>;
}
