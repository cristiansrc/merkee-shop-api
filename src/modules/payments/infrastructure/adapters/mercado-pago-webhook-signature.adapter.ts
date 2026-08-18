import { createHmac, timingSafeEqual } from 'crypto';
import { WebhookSignaturePort } from '../../domain/ports/webhook-signature.port';
import { PaymentProviderConfig } from '../../domain/payment-provider-config';

/**
 * Adapter de verificación de firma de webhook Mercado Pago (infrastructure).
 *
 * Implementa WebhookSignaturePort para Mercado Pago usando HMAC-SHA256
 * sobre el raw body recibido (ADR-005 / MSF-PAY-003).
 *
 * La firma del webhook se valida sobre el raw body antes de persistir
 * `payment_webhook_events`; solo se almacenan y procesan los eventos
 * con firma válida (Master Spec §91-95).
 *
 * Seguridad:
 * - Nunca registra PAN/CVV/fecha en logs ni errores.
 * - Secretos se obtienen de configuración externa (env/config).
 * - Usa timingSafeEqual para prevenir timing attacks.
 */
export class MercadoPagoWebhookSignatureAdapter implements WebhookSignaturePort {
  constructor(private readonly config: PaymentProviderConfig) {}

  /**
   * Verifica la firma del webhook Mercado Pago.
   *
   * Mercado Pago usa HMAC-SHA256 con el access token sobre el raw body.
   * La firma se compara con timing-safe comparison.
   *
   * @param rawBody - Cuerpo crudo de la solicitud (string).
   * @param signature - Valor del header X-Signature.
   * @returns `true` si la firma es válida, `false` en caso contrario.
   */
  async verify(rawBody: string, signature: string): Promise<boolean> {
    try {
      const expectedSignature = createHmac('sha256', this.config.secretKey)
        .update(rawBody, 'utf8')
        .digest('hex');

      // Normalizar: MercadoPuede puede enviar hex con o sin prefijo
      const cleanSignature = signature.replace(/^sha256=/i, '').trim();
      const cleanExpected = expectedSignature.trim();

      if (cleanSignature.length !== cleanExpected.length) {
        return false;
      }

      return timingSafeEqual(
        Buffer.from(cleanSignature, 'hex'),
        Buffer.from(cleanExpected, 'hex'),
      );
    } catch {
      // Error técnico en la verificación — retornar false (no persistir)
      return false;
    }
  }
}
