import { HttpThrottlerGuard } from './http-throttler.guard';

const mockStorage = {
  increment: jest.fn().mockResolvedValue({
    totalHits: 1,
    timeToExpire: 60000,
    isBlocked: false,
  }),
};

const mockReflector = {
  getAllAndOverride: jest.fn().mockReturnValue(undefined),
  getAllAndOverrideByTokens: jest.fn().mockReturnValue(undefined),
  getAll: jest.fn().mockReturnValue([]),
};

describe('HttpThrottlerGuard', () => {
  let guard: HttpThrottlerGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new HttpThrottlerGuard(
      [{ ttl: 60000, limit: 60 }],
      mockStorage,
      mockReflector as any,
    );
    (guard as any).onModuleInit();
  });

  it('bypasses throttling for non-HTTP contexts (WebSocket gateways)', async () => {
    const wsContext = {
      getType: () => 'ws',
      getHandler: () => ({}),
      getClass: () => ({}),
    } as any;

    await expect(guard.canActivate(wsContext)).resolves.toBe(true);
    expect(mockStorage.increment).not.toHaveBeenCalled();
  });

  it('applies throttling to HTTP contexts', async () => {
    const httpContext = {
      getType: () => 'http',
      getHandler: () => () => undefined,
      getClass: () => class TestController {},
      switchToHttp: () => ({
        getRequest: () => ({ headers: {}, ip: '127.0.0.1' }),
        getResponse: () => ({ header: jest.fn() }),
      }),
    } as any;

    await expect(guard.canActivate(httpContext)).resolves.toBe(true);
    expect(mockStorage.increment).toHaveBeenCalled();
  });

  it('rejects when an HTTP route exceeds its limit', async () => {
    mockStorage.increment.mockResolvedValue({
      totalHits: 61,
      timeToExpire: 60000,
      isBlocked: true,
    });

    const httpContext = {
      getType: () => 'http',
      getHandler: () => () => undefined,
      getClass: () => class TestController {},
      switchToHttp: () => ({
        getRequest: () => ({ headers: {}, ip: '127.0.0.1' }),
        getResponse: () => ({ header: jest.fn() }),
      }),
    } as any;

    await expect(guard.canActivate(httpContext)).rejects.toThrow();
  });
});
