import { Injectable } from '@nestjs/common';
import { CartPrismaService } from '../cart-prisma.service';
import { SessionLookupPort } from '../../domain/ports/session-lookup.port';
import { CartSession, CartUser } from '../../domain/models';

/**
 * Adapter Prisma de consulta de sesión para el carrito (infrastructure).
 * Solo lectura: verifica estado, expiración y rol.
 */
@Injectable()
export class PrismaSessionLookupAdapter implements SessionLookupPort {
  constructor(private readonly prisma: CartPrismaService) {}

  async findById(sessionId: string): Promise<CartSession | null> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!session) return null;

    return {
      id: session.id,
      userId: session.userId,
      sessionKind: session.sessionKind as CartSession['sessionKind'],
      expiresAt: session.expiresAt,
      lastActivityAt: session.lastActivityAt,
      revokedAt: session.revokedAt,
    };
  }

  async findUserById(userId: string): Promise<CartUser | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) return null;

    return {
      id: user.id,
      role: user.role as CartUser['role'],
      mustChangePassword: user.mustChangePassword,
    };
  }
}
