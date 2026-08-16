import { Test, TestingModule } from '@nestjs/testing';
import { ChatService } from './chat.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Chat } from './entities/chat.entity';
import { ChatMessage } from './entities/chat-message.entity';
import { User } from '../users/entities/user.entity';
import { Order } from '../orders/entities/order.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { UserRole } from '../enums/user-role.enum';

const mockRepository = () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  createQueryBuilder: jest.fn(),
  manager: {
    query: jest.fn(),
  },
});

const mockNotificationsService = {
  sendPushNotification: jest.fn().mockResolvedValue(undefined),
};

describe('ChatService', () => {
  let service: ChatService;
  let chatRepository: any;
  let messageRepository: any;
  let userRepository: any;
  let orderRepository: any;

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
        { provide: getRepositoryToken(Order), useFactory: mockRepository },
        { provide: NotificationsService, useValue: mockNotificationsService },
      ],
    }).compile();

    service = module.get<ChatService>(ChatService);
    chatRepository = module.get(getRepositoryToken(Chat));
    messageRepository = module.get(getRepositoryToken(ChatMessage));
    userRepository = module.get(getRepositoryToken(User));
    orderRepository = module.get(getRepositoryToken(Order));
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
      const mockUser = {
        id: 99,
        role: UserRole.SUPERADMIN,
        name: 'Admin User',
      };
      userRepository.findOne.mockResolvedValue(mockUser);

      const result = await service.findSupportTeamUser();
      expect(result).toEqual(mockUser);
      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: { role: UserRole.SUPERADMIN },
        order: { id: 'ASC' },
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
        type: 'direct',
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
      const mockSupportUser = { id: 99, phone: '+96178999999' };
      const mockChats = [{ id: 1, user1Id: 99, user2Id: 10 }];

      const mockThreadQb = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        offset: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([mockChats, 1]),
      };

      const latestQb = {
        distinctOn: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };

      const unreadQb = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      };

      userRepository.findOne.mockResolvedValue(mockSupportUser);
      chatRepository.createQueryBuilder.mockReturnValue(mockThreadQb);
      messageRepository.createQueryBuilder
        .mockReturnValueOnce(latestQb)
        .mockReturnValueOnce(unreadQb);

      const result = await service.findAllSupportThreads(10, {
        skip: 0,
        take: 20,
      });

      expect(result.items).toEqual([
        { chat: mockChats[0], latestMessage: null, unreadCount: 0 },
      ]);
      expect(result.total).toBe(1);
      expect(result.skip).toBe(0);
      expect(result.take).toBe(20);
      expect(messageRepository.createQueryBuilder).toHaveBeenCalledTimes(2);
    });

    it('should throw if support team user not found', async () => {
      userRepository.findOne.mockResolvedValue(null);

      await expect(
        service.findAllSupportThreads(10, { skip: 0, take: 20 }),
      ).rejects.toThrow('Support team account not found');
    });
  });

  describe('getOrCreateOrderThread (R9)', () => {
    const mockOrder = {
      id: 'ord_1',
      customerId: 10,
      driverId: 20,
    };

    beforeEach(() => {
      jest.clearAllMocks();
      orderRepository.findOne.mockResolvedValue(mockOrder);
      chatRepository.findOne.mockResolvedValue(null);
      userRepository.findOne.mockResolvedValue({ id: 20 } as any);
      chatRepository.create.mockReturnValue({
        user1Id: 10,
        user2Id: 20,
        type: 'direct',
      });
      chatRepository.save.mockResolvedValue({
        id: 1,
        user1Id: 10,
        user2Id: 20,
        type: 'direct',
      });
    });

    it('allows the order customer to open the thread', async () => {
      const chat = await service.getOrCreateOrderThread(
        'ord_1',
        10,
        UserRole.CUSTOMER,
      );
      expect(chat.user1Id).toBe(10);
      expect(chat.user2Id).toBe(20);
      expect(chatRepository.findOne).toHaveBeenCalledWith({
        where: [
          { user1Id: 10, user2Id: 20 },
          { user1Id: 20, user2Id: 10 },
        ],
        relations: { user1: true, user2: true },
      });
    });

    it('allows the assigned driver to open the thread', async () => {
      const chat = await service.getOrCreateOrderThread(
        'ord_1',
        20,
        UserRole.DRIVER,
      );
      expect(chat.user1Id).toBe(10);
    });

    it('allows SUPERADMIN to open the thread', async () => {
      const chat = await service.getOrCreateOrderThread(
        'ord_1',
        99,
        UserRole.SUPERADMIN,
      );
      expect(chat.user1Id).toBe(10);
    });

    it('allows DRIVER_HEAD to open the thread', async () => {
      const chat = await service.getOrCreateOrderThread(
        'ord_1',
        99,
        UserRole.DRIVER_HEAD,
      );
      expect(chat.user1Id).toBe(10);
    });

    it('rejects unrelated staff', async () => {
      await expect(
        service.getOrCreateOrderThread('ord_1', 99, UserRole.KITCHEN_STAFF),
      ).rejects.toThrow('Order not found');
    });

    it('rejects when the order has no assigned driver', async () => {
      orderRepository.findOne.mockResolvedValue({
        id: 'ord_1',
        customerId: 10,
        driverId: null,
      });
      await expect(
        service.getOrCreateOrderThread('ord_1', 10, UserRole.CUSTOMER),
      ).rejects.toThrow('Order not found');
    });

    it('rejects when the order does not exist', async () => {
      orderRepository.findOne.mockResolvedValue(null);
      await expect(
        service.getOrCreateOrderThread('ord_1', 10, UserRole.CUSTOMER),
      ).rejects.toThrow('Order not found');
    });

    it('returns the existing thread instead of creating a new one', async () => {
      chatRepository.findOne.mockResolvedValue({
        id: 7,
        user1Id: 10,
        user2Id: 20,
        type: 'direct',
      });
      const chat = await service.getOrCreateOrderThread(
        'ord_1',
        20,
        UserRole.DRIVER,
      );
      expect(chat.id).toBe(7);
      expect(chatRepository.create).not.toHaveBeenCalled();
    });
  });
});
