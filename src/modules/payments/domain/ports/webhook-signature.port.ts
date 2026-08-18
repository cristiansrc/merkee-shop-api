/**
 * Puerto de salida de verificación de firma de webhook (ADR-005 / MSF-PAY-003).
 *
 * La firma se valida sobre el raw body recibido antes de persistir
 * `payment_webhook_events`. Solo se persiste y procesa un evento con
 * firma válida (Master Spec §91-95).
 *
 * Este archivo es TypeScript puro: no importa NestJS, Prisma ni HTTP.
 */
export interface WebhookSignaturePort {
  /**
   * Verifica la firma del webhook sobre el raw body.
   *
   * @param rawBody - Cuerpo crudo de la solicitud (string).
   * @param signature - Valor del header de firma del proveedor.
   * @returns `true` si la firma es válida, `false` en caso contrario.
   */
  verify(rawBody: string, signature: string): Promise<boolean>;
}
