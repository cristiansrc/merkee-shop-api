/**
 * Puerto de salida de consulta de usuario del módulo `media`.
 *
 * Solo expone las consultas necesarias para verificar autorización del
 * actor (rol admin, `must_change_password`). No expone escritura ni
 * credenciales. La implementación concreta vive en infrastructure.
 */
export interface MediaUserLookupPort {
  /** Busca un usuario por ID. Devuelve `null` si no existe. */
  findById(
    id: string,
  ): Promise<{ id: string; role: string; mustChangePassword: boolean } | null>;
}
