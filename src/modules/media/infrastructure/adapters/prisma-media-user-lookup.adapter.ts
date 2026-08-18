import { Inject, Injectable } from '@nestjs/common';
import { MediaUserLookupPort } from '../../domain/ports/user-lookup.port';
import { PrismaService } from '../../../identity/infrastructure/prisma.service';

/**
 * Adapter de salida de consulta de usuario para media (infrastructure).
 *
 * Implementa `MediaUserLookupPort` delegando a Prisma. Solo expone
 * las consultas necesarias para verificar autorización del actor (rol,
 * `must_change_password`). No expone escritura ni credenciales.
 */
@Injectable()
export class PrismaMediaUserLookupAdapter implements MediaUserLookupPort {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
  ) {}

  async findById(
    id: string,
  ): Promise<{ id: string; role: string; mustChangePassword: boolean } | null> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true, mustChangePassword: true },
    });
    if (!user) {
      return null;
    }
    return {
      id: user.id,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
    };
  }
}
