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
});
