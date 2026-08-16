import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { User } from '../users/entities/user.entity';
import { DeviceToken } from './entities/device-token.entity';
import { ChatService } from '../chat/chat.service';
import { UnauthorizedException } from '@nestjs/common';

jest.mock('bcryptjs', () => ({
  compare: jest.fn().mockResolvedValue(true),
  hash: jest.fn().mockResolvedValue('hashed'),
}));

const mockRepository = () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  update: jest.fn(),
});

const mockChatService = {
  findSupportTeamUser: jest.fn(),
  getOrCreateThreadWithManager: jest.fn(),
};

const mockManager = {
  create: jest.fn(),
  save: jest.fn(),
  findOne: jest.fn(),
};

const mockQueryRunner = {
  connect: jest.fn(),
  startTransaction: jest.fn(),
  commitTransaction: jest.fn(),
  rollbackTransaction: jest.fn(),
  release: jest.fn(),
  manager: mockManager,
};

const mockDataSource = {
  createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
};

describe('AuthService', () => {
  let service: AuthService;
  let userRepository: any;
  let deviceTokenRepository: any;

  beforeEach(async () => {
    jest.clearAllMocks();

    mockQueryRunner.connect.mockResolvedValue(undefined);
    mockQueryRunner.startTransaction.mockResolvedValue(undefined);
    mockQueryRunner.commitTransaction.mockResolvedValue(undefined);
    mockQueryRunner.rollbackTransaction.mockResolvedValue(undefined);
    mockQueryRunner.release.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(User), useFactory: mockRepository },
        {
          provide: getRepositoryToken(DeviceToken),
          useFactory: mockRepository,
        },
        { provide: DataSource, useValue: mockDataSource },
        { provide: ChatService, useValue: mockChatService },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue(30) },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    userRepository = module.get(getRepositoryToken(User));
    deviceTokenRepository = module.get(getRepositoryToken(DeviceToken));
  });

  describe('register', () => {
    const registerDto = {
      name: 'Test User',
      phone: '+96176666666',
      password: 'password123',
    };

    it('should create user, device token, and support chat atomically', async () => {
      userRepository.findOne.mockResolvedValue(null); // no existing user
      mockManager.create
        .mockReturnValueOnce({ id: 1, phone: '+96176666666' }) // user
        .mockReturnValueOnce({ id: 1 }); // device token
      mockManager.save
        .mockResolvedValueOnce({ id: 1, phone: '+96176666666' }) // user
        .mockResolvedValueOnce({ id: 1 }); // device token
      mockChatService.findSupportTeamUser.mockResolvedValue({ id: 99 });
      mockChatService.getOrCreateThreadWithManager.mockResolvedValue({
        id: 1,
        user1Id: 1,
        user2Id: 99,
      });

      const result = await service.register(registerDto, 'test-agent');

      expect(result.access_token).toBeDefined();
      expect(result.user.phone).toBe('+96176666666');
      expect(mockChatService.findSupportTeamUser).toHaveBeenCalled();
      expect(mockChatService.getOrCreateThreadWithManager).toHaveBeenCalledWith(
        1,
        99,
        mockManager,
        'support',
      );
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
    });

    it('should throw if phone already exists', async () => {
      userRepository.findOne.mockResolvedValue({
        id: 1,
        phone: '+96176666666',
      });

      await expect(service.register(registerDto)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockQueryRunner.startTransaction).not.toHaveBeenCalled();
    });

    it('should rollback if support chat creation fails', async () => {
      userRepository.findOne.mockResolvedValue(null);
      mockManager.create
        .mockResolvedValueOnce({ id: 1 })
        .mockResolvedValueOnce({ id: 1 });
      mockManager.save
        .mockResolvedValueOnce({ id: 1, phone: '+96176666666' })
        .mockResolvedValueOnce({ id: 1 });
      mockChatService.findSupportTeamUser.mockRejectedValue(
        new Error('Support team account not found'),
      );

      await expect(service.register(registerDto)).rejects.toThrow(
        'Support team account not found',
      );
      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.commitTransaction).not.toHaveBeenCalled();
    });

    it('should rollback if user save fails', async () => {
      userRepository.findOne.mockResolvedValue(null);
      mockManager.create.mockReturnValue({ id: 1 });
      mockManager.save.mockRejectedValue(new Error('DB error'));

      await expect(service.register(registerDto)).rejects.toThrow('DB error');
      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });
  });

  describe('token expiry', () => {
    it('should reject an expired token and revoke it', async () => {
      deviceTokenRepository.findOne.mockResolvedValue({
        user: { id: 1 },
        status: 'active',
        expiresAt: new Date(Date.now() - 1000),
        lastUsedAt: null,
      });
      deviceTokenRepository.save.mockResolvedValue({});

      await expect(
        service.validateUserByToken('expired-token'),
      ).rejects.toThrow(UnauthorizedException);
      expect(deviceTokenRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'inactive' }),
      );
    });

    it('should accept an active token with a future expiry', async () => {
      deviceTokenRepository.findOne.mockResolvedValue({
        user: { id: 1 },
        status: 'active',
        expiresAt: new Date(Date.now() + 60_000),
        lastUsedAt: null,
      });
      deviceTokenRepository.save.mockResolvedValue({});

      const user = await service.validateUserByToken('valid-token');
      expect(user).toEqual({ id: 1 });
    });

    it('should accept a legacy token with no expiry (grace)', async () => {
      deviceTokenRepository.findOne.mockResolvedValue({
        user: { id: 1 },
        status: 'active',
        expiresAt: null,
        lastUsedAt: null,
      });
      deviceTokenRepository.save.mockResolvedValue({});

      const user = await service.validateUserByToken('legacy-token');
      expect(user).toEqual({ id: 1 });
    });

    it('should stamp an expiry on tokens issued at login', async () => {
      userRepository.findOne.mockResolvedValue({
        id: 1,
        phone: '+96176666666',
        passwordHash: 'hash',
        email: 'a@b.com',
        name: 'T',
        role: 'customer',
      });
      deviceTokenRepository.update.mockResolvedValue({});
      deviceTokenRepository.create.mockReturnValue({});
      deviceTokenRepository.save.mockResolvedValue({});
      const mockChat = { getOrCreateThread: jest.fn() };
      (service as any).moduleRef = {
        get: jest.fn().mockReturnValue(mockChat),
      };
      mockChat.getOrCreateThread.mockResolvedValue({});

      await service.login(
        { phone: '+96176666666', password: 'password123' },
        'test-agent',
      );

      const created = deviceTokenRepository.create.mock.calls[0][0];
      expect(created.expiresAt).toBeInstanceOf(Date);
      expect(created.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });
  });
});
