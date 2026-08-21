import { CartSessionResolverAdapter } from './cart-session-resolver.adapter';
import { JwtPort } from '../../../identity/domain/ports/jwt.port';
import { ClockPort } from '../../domain/ports/clock.port';
import { SessionLookupPort } from '../../domain/ports/session-lookup.port';
import { CartSession } from '../../domain/models';
import { CartPrismaService } from '../cart-prisma.service';

const fixedNow = new Date('2026-08-15T12:00:00.000Z');

function guestSession(overrides?: Partial<CartSession>): CartSession {
  return {
    id: 'guest-session-1',
    userId: null,
    sessionKind: 'GUEST',
    expiresAt: new Date(fixedNow.getTime() + 10 * 60 * 1000),
    lastActivityAt: fixedNow,
    revokedAt: null,
    ...overrides,
  };
}

function buildResolver(overrides?: {
  sessionLookup?: Partial<SessionLookupPort>;
  clock?: Partial<ClockPort>;
  prismaCreate?: jest.Mock;
}): {
  resolver: CartSessionResolverAdapter;
  sessionLookup: jest.Mocked<SessionLookupPort>;
  clock: jest.Mocked<ClockPort>;
  prismaCreate: jest.Mock;
} {
  const sessionLookup = {
    findById: jest.fn(),
    findUserById: jest.fn(),
    ...(overrides?.sessionLookup ?? {}),
  } as jest.Mocked<SessionLookupPort>;

  const clock = {
    now: jest.fn().mockReturnValue(fixedNow),
    ...(overrides?.clock ?? {}),
  } as jest.Mocked<ClockPort>;

  const prismaCreate =
    overrides?.prismaCreate ??
    jest.fn().mockResolvedValue({ id: 'new-guest-session' });

  const prisma = {
    session: { create: prismaCreate },
  } as unknown as CartPrismaService;

  const jwt = { sign: jest.fn(), verify: jest.fn() } as unknown as JwtPort;

  const resolver = new CartSessionResolverAdapter(jwt, clock, sessionLookup, prisma);
  return { resolver, sessionLookup, clock, prismaCreate };
}

describe('CartSessionResolverAdapter (self-heal de cookie guest)', () => {
  it('reutiliza una sesión guest válida de la cookie', async () => {
    const { resolver, sessionLookup } = buildResolver();
    sessionLookup.findById.mockResolvedValue(guestSession());

    const resolution = await resolver.resolve('guest-session-1', undefined, '/cart');

    expect(sessionLookup.findById).toHaveBeenCalledWith('guest-session-1');
    expect(resolution.sessionId).toBe('guest-session-1');
    expect(resolution.cookie).toBeUndefined();
  });

  it('crea una guest nueva (self-heal) si la sesión de la cookie no existe', async () => {
    const { resolver, sessionLookup, prismaCreate } = buildResolver();
    sessionLookup.findById.mockResolvedValue(null);

    const resolution = await resolver.resolve('guest-obsoleta', undefined, '/cart');

    expect(prismaCreate).toHaveBeenCalled();
    expect(resolution.sessionId).toBe('new-guest-session');
    expect(resolution.cookie?.name).toBe('merkee_cart_session');
    expect(resolution.cookie?.value).toBe('new-guest-session');
  });

  it('crea una guest nueva (self-heal) si la sesión está revocada', async () => {
    const { resolver, sessionLookup, prismaCreate } = buildResolver();
    sessionLookup.findById.mockResolvedValue(guestSession({ revokedAt: fixedNow }));

    const resolution = await resolver.resolve('guest-revocada', undefined, '/cart');

    expect(prismaCreate).toHaveBeenCalled();
    expect(resolution.sessionId).toBe('new-guest-session');
    expect(resolution.cookie).toBeDefined();
  });

  it('crea una guest nueva (self-heal) si la sesión está expirada', async () => {
    const { resolver, sessionLookup, prismaCreate } = buildResolver();
    sessionLookup.findById.mockResolvedValue(
      guestSession({ expiresAt: new Date(fixedNow.getTime() - 1) }),
    );

    const resolution = await resolver.resolve('guest-expirada', undefined, '/cart');

    expect(prismaCreate).toHaveBeenCalled();
    expect(resolution.sessionId).toBe('new-guest-session');
  });

  it('crea una guest nueva (self-heal) si la cookie apunta a sesión AUTHENTICATED', async () => {
    const { resolver, sessionLookup, prismaCreate } = buildResolver();
    sessionLookup.findById.mockResolvedValue(
      guestSession({ sessionKind: 'AUTHENTICATED', userId: 'user-1' }),
    );

    const resolution = await resolver.resolve('session-auth', undefined, '/cart');

    expect(prismaCreate).toHaveBeenCalled();
    expect(resolution.sessionId).toBe('new-guest-session');
  });

  it('sin cookie y sin Bearer crea una sesión guest nueva', async () => {
    const { resolver, prismaCreate } = buildResolver();

    const resolution = await resolver.resolve(undefined, undefined, '/cart');

    expect(prismaCreate).toHaveBeenCalled();
    expect(resolution.sessionId).toBe('new-guest-session');
    expect(resolution.cookie).toBeDefined();
  });
});
