/**
 * Puerto de salida de secreto del admin inicial del módulo `identity`.
 *
 * Abstrae la obtención de la contraseña inicial del admin desde una fuente
 * externa (variable de entorno no versionada o referencia a Secrets Manager).
 * El dominio/aplicación nunca conoce el valor en claro más allá de la llamada
 * puntual para hashearlo; nunca se registra, devuelve ni persiste.
 *
 * ADR-010: la contraseña llega por referencia externa, no se documenta, siembra
 * ni expone en OpenAPI. Si la fuente no está configurada, devuelve `null` para
 * que el bootstrap falle de forma segura antes de crear usuario.
 */
export interface InitialAdminSecretPort {
  /**
   * Devuelve la contraseña inicial del admin o `null` si no está configurada.
   * Nunca debe registrarse el valor devuelto.
   */
  getInitialAdminPassword(): string | null;
}
