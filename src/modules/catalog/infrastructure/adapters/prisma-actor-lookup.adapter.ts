import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../identity/infrastructure/prisma.service';
import { ActorLookupPort, ActorInfo } from '../../domain/ports/actor-lookup.port';

@Injectable()
export class PrismaActorLookupAdapter implements ActorLookupPort {
  constructor(private readonly prisma: PrismaService) {}

  async findById(actorId: string): Promise<ActorInfo | null> {
    const row = await this.prisma.user.findUnique({
      where: { id: actorId },
      select: { id: true, role: true, mustChangePassword: true },
    });
    if (!row) return null;
    return {
      id: row.id,
      role: row.role,
      mustChangePassword: row.mustChangePassword,
    };
  }
}
