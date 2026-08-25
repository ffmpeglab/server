import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';

describe('AuthGuard', () => {
  let guard: AuthGuard;
  const authService = { findKey: jest.fn() };

  const createContext = (authHeader?: string) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({
          headers: authHeader ? { authorization: authHeader } : {},
        }),
      }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new AuthGuard(authService as any);
  });

  it('throws when no Authorization header present', async () => {
    await expect(guard.canActivate(createContext())).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('throws when api key does not exist', async () => {
    authService.findKey.mockResolvedValue(null);
    await expect(
      guard.canActivate(createContext('Bearer invalid-key')),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('throws when key has no user_id', async () => {
    authService.findKey.mockResolvedValue({ id: 'k1' });
    await expect(
      guard.canActivate(createContext('Bearer some-key')),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('allows access on valid key', async () => {
    authService.findKey.mockResolvedValue({ user_id: 'user-42' });
    const ctx = createContext('Bearer good-key');
    const request = ctx.switchToHttp().getRequest();

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('propagates UnauthorizedException when findKey throws', async () => {
    authService.findKey.mockRejectedValue(new Error('db down'));
    await expect(guard.canActivate(createContext('Bearer k'))).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
