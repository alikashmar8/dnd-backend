import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  let controller: AuthController;
  let logSpy: jest.SpyInstance;

  const mockAuthService = {
    login: jest.fn().mockResolvedValue({ access_token: 'tok', user: {} }),
    register: jest.fn().mockResolvedValue({ access_token: 'tok', user: {} }),
    logout: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthController,
        { provide: AuthService, useValue: mockAuthService },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('login must never write the password (or the request body) to logs', async () => {
    await controller.login(
      { phone: '+96170000000', password: 's3cr3t!' },
      'agent',
    );

    const logged = logSpy.mock.calls.some((call) =>
      JSON.stringify(call).includes('s3cr3t!'),
    );
    expect(logged).toBe(false);
  });
});
