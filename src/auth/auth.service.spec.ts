import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AuthService } from './auth.service';
import { User } from '../users/entities/user.entity';
import { DeviceToken } from './entities/device-token.entity';
import { ChatService } from '../chat/chat.service';
import { UnauthorizedException } from '@nestjs/common';

const mockRepository = () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
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
});
