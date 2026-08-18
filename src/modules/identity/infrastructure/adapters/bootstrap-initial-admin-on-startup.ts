import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { BootstrapInitialAdminUseCase } from '../../application/use-cases/bootstrap-initial-admin.use-case';
import { isFailure } from '../../../../shared/domain/result';

/**
 * Variable de entorno que habilita/deshabilita el bootstrap del admin inicial
 * al arrancar la aplicación. Valor por defecto: habilitado (`true`).
 */
export const BOOTSTRAP_INITIAL_ADMIN_ENABLED_ENV =
  'BOOTSTRAP_INITIAL_ADMIN_ENABLED';

/**
 * Driving adapter de arranque que ejecuta el bootstrap seguro del admin
 * inicial al iniciar la aplicación (ADR-010).
 *
 * Es habilitable/deshabilitable explícitamente vía
 * `BOOTSTRAP_INITIAL_ADMIN_ENABLED` (por defecto `true`). Nunca rompe el
 * arranque: si el bootstrap falla (p. ej. secreto ausente o DB no disponible),
 * registra una advertencia estructurada SIN PII ni secretos y continúa.
 *
 * No registra contraseña, hash, secreto ni token.
 */
@Injectable()
export class BootstrapInitialAdminOnStartup
  implements OnApplicationBootstrap
{
  private readonly logger = new Logger(BootstrapInitialAdminOnStartup.name);

  constructor(
    @Inject(BootstrapInitialAdminUseCase)
    private readonly bootstrap: BootstrapInitialAdminUseCase,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const enabled =
      (process.env[BOOTSTRAP_INITIAL_ADMIN_ENABLED_ENV] ?? 'true').toLowerCase() !==
      'false';
    if (!enabled) {
      this.logger.log('initial admin bootstrap disabled');
      return;
    }

    try {
      const result = await this.bootstrap.execute();
      if (isFailure(result)) {
        this.logger.warn(
          `initial admin bootstrap skipped: ${result.error.code}`,
        );
        return;
      }
      this.logger.log(`initial admin bootstrap ${result.value.outcome}`);
    } catch {
      // Nunca se registra el mensaje de error crudo: podría contener detalles
      // de la fuente del secreto. Advertencia genérica sin PII.
      this.logger.warn('initial admin bootstrap failed');
    }
  }
}
