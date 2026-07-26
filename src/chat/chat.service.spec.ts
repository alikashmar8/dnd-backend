import { Test, TestingModule } from '@nestjs/testing';
import { ChatService } from './chat.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Chat } from './entities/chat.entity';
import { ChatMessage } from './entities/chat-message.entity';
import { User } from '../users/entities/user.entity';
import { NotificationsService } from '../notifications/notifications.service';

const mockRepository = () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  createQueryBuilder: jest.fn(),
});

const mockNotificationsService = {
  sendPushNotification: jest.fn().mockResolvedValue(undefined),
};

describe('ChatService', () => {
  let service: ChatService;
  let chatRepository: any;
  let messageRepository: any;
  let userRepository: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        { provide: getRepositoryToken(Chat), useFactory: mockRepository },
        {
          provide: getRepositoryToken(ChatMessage),
          useFactory: mockRepository,
        },
        { provide: getRepositoryToken(User), useFactory: mockRepository },
        { provide: NotificationsService, useValue: mockNotificationsService },
      ],
    }).compile();

    service = module.get<ChatService>(ChatService);
    chatRepository = module.get(getRepositoryToken(Chat));
    messageRepository = module.get(getRepositoryToken(ChatMessage));
    userRepository = module.get(getRepositoryToken(User));
  });

  it('should create or return existing chat thread', async () => {
    chatRepository.findOne.mockResolvedValue(null);
    userRepository.findOne.mockResolvedValue({ id: 2 } as any);
    chatRepository.create.mockReturnValue({ user1Id: 1, user2Id: 2 });
    chatRepository.save.mockResolvedValue({ id: 1, user1Id: 1, user2Id: 2 });

    const result = await service.getOrCreateThread(1, 2);
    expect(result).toEqual({ id: 1, user1Id: 1, user2Id: 2 });
  });

  it('should throw when message text is empty', async () => {
    chatRepository.findOne.mockResolvedValue({ id: 1, user1Id: 1, user2Id: 2 });
    await expect(service.sendMessage(1, 1, '   ')).rejects.toThrow(
      'Message text cannot be empty',
    );
  });

  describe('findSupportTeamUser', () => {
    it('should return the support team user', async () => {
      const mockUser = { id: 99, phone: '+96170000000', name: 'Admin User' };
      userRepository.findOne.mockResolvedValue(mockUser);

      const result = await service.findSupportTeamUser();
      expect(result).toEqual(mockUser);
      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: { phone: '+96170000000' },
      });
    });

    it('should throw if support team account not found', async () => {
      userRepository.findOne.mockResolvedValue(null);

      await expect(service.findSupportTeamUser()).rejects.toThrow(
        'Support team account not found',
      );
    });
  });

  describe('getOrCreateThreadWithManager', () => {
    const mockManager = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };

    beforeEach(() => {
      mockManager.findOne.mockReset();
      mockManager.create.mockReset();
      mockManager.save.mockReset();
    });

    it('should create a thread via transaction manager', async () => {
      mockManager.findOne
        .mockResolvedValueOnce({ id: 2 }) // participant lookup
        .mockResolvedValueOnce(null); // existing thread lookup
      mockManager.create.mockReturnValue({ user1Id: 1, user2Id: 2 });
      mockManager.save.mockResolvedValue({ id: 1, user1Id: 1, user2Id: 2 });

      const result = await service.getOrCreateThreadWithManager(
        1,
        2,
        mockManager as any,
      );
      expect(result).toEqual({ id: 1, user1Id: 1, user2Id: 2 });
      expect(mockManager.create).toHaveBeenCalledWith(Chat, {
        user1Id: 1,
        user2Id: 2,
      });
    });

    it('should return existing thread if one exists', async () => {
      const existingChat = { id: 5, user1Id: 1, user2Id: 2 };
      mockManager.findOne
        .mockResolvedValueOnce({ id: 2 }) // participant lookup
        .mockResolvedValueOnce(existingChat); // existing thread lookup

      const result = await service.getOrCreateThreadWithManager(
        1,
        2,
        mockManager as any,
      );
      expect(result).toEqual(existingChat);
      expect(mockManager.create).not.toHaveBeenCalled();
    });

    it('should throw for self-chat', async () => {
      await expect(
        service.getOrCreateThreadWithManager(1, 1, mockManager as any),
      ).rejects.toThrow('Cannot create a chat with yourself');
    });

    it('should throw if participant not found', async () => {
      mockManager.findOne.mockResolvedValueOnce(null);

      await expect(
        service.getOrCreateThreadWithManager(1, 999, mockManager as any),
      ).rejects.toThrow('Participant not found');
    });
  });

  describe('findAllSupportThreads', () => {
    it('should return support threads for admin', async () => {
      const mockSupportUser = { id: 99, phone: '+96170000000' };
      const mockChats = [{ id: 1, user1Id: 99, user2Id: 10 }];

      const mockQb = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([mockChats, 1]),
      };

      userRepository.findOne.mockResolvedValue(mockSupportUser);
      chatRepository.createQueryBuilder.mockReturnValue(mockQb);

      const result = await service.findAllSupportThreads(10, {
        skip: 0,
        take: 20,
      });

      expect(result.items).toEqual(mockChats);
      expect(result.total).toBe(1);
      expect(result.skip).toBe(0);
      expect(result.take).toBe(20);
    });

    it('should throw if support team user not found', async () => {
      userRepository.findOne.mockResolvedValue(null);

      await expect(
        service.findAllSupportThreads(10, { skip: 0, take: 20 }),
      ).rejects.toThrow('Support team account not found');
    });
  });
});
