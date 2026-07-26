import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { UserRole } from '../enums/user-role.enum';
import { NotificationsService } from '../notifications/notifications.service';
import { User } from '../users/entities/user.entity';
import { ChatMessage } from './entities/chat-message.entity';
import { Chat } from './entities/chat.entity';

const SUPPORT_TEAM_PHONE = '+96170000000';

@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(Chat)
    private readonly chatRepository: Repository<Chat>,
    @InjectRepository(ChatMessage)
    private readonly messageRepository: Repository<ChatMessage>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly notificationsService: NotificationsService,
  ) {}

  async findAllThreads(
    currentUserId: number,
    pagination: { skip?: number; take?: number },
  ): Promise<{ items: Chat[]; total: number; skip: number; take: number }> {
    const skip = pagination.skip ?? 0;
    const take = pagination.take ?? 20;

    const qb = this.chatRepository
      .createQueryBuilder('chat')
      .leftJoinAndSelect('chat.user1', 'user1')
      .leftJoinAndSelect('chat.user2', 'user2')
      .leftJoinAndSelect('chat.messages', 'messages')
      .where('chat.user1Id = :currentUserId OR chat.user2Id = :currentUserId', {
        currentUserId,
      })
      .orderBy('chat.updatedAt', 'DESC')
      .skip(skip)
      .take(take);

    const [items, total] = await qb.getManyAndCount();
    return { items, total, skip, take };
  }

  async findMessages(
    chatId: number,
    currentUserId: number,
    pagination: { skip?: number; take?: number },
  ): Promise<{
    items: ChatMessage[];
    total: number;
    skip: number;
    take: number;
  }> {
    const chat = await this.chatRepository
      .createQueryBuilder('chat')
      .where('chat.id = :chatId', { chatId })
      .andWhere(
        'chat.user1Id = :currentUserId OR chat.user2Id = :currentUserId',
        {
          currentUserId,
        },
      )
      .getOne();

    if (!chat) {
      throw new NotFoundException('Chat not found');
    }

    const skip = pagination.skip ?? 0;
    const take = pagination.take ?? 20;

    const [items, total] = await this.messageRepository
      .createQueryBuilder('message')
      .leftJoinAndSelect('message.sender', 'sender')
      .where('message.chatId = :chatId', { chatId })
      .orderBy('message.createdAt', 'ASC')
      .skip(skip)
      .take(take)
      .getManyAndCount();

    return { items, total, skip, take };
  }

  async getOrCreateThread(
    currentUserId: number,
    participantId: number,
  ): Promise<Chat> {
    if (currentUserId === participantId) {
      throw new BadRequestException('Cannot create a chat with yourself');
    }

    const participant = await this.userRepository.findOne({
      where: { id: participantId },
    });

    if (!participant) {
      throw new NotFoundException('Participant not found');
    }

    const existing = await this.chatRepository.findOne({
      where: [
        { user1Id: currentUserId, user2Id: participantId },
        { user1Id: participantId, user2Id: currentUserId },
      ],
      relations: {
        user1: true,
        user2: true,
      },
    });

    if (existing) {
      return existing;
    }

    const thread = this.chatRepository.create({
      user1Id: currentUserId,
      user2Id: participantId,
    });

    return this.chatRepository.save(thread);
  }

  async sendMessage(
    chatId: number,
    senderId: number,
    text: string,
  ): Promise<ChatMessage> {
    // Fail-fast validation before hitting the database
    if (!text?.trim()) {
      throw new BadRequestException('Message text cannot be empty');
    }
    const cleanText = text.trim();

    // OPTIMIZATION 1: Fetch chat AND user relations simultaneously.
    // This eliminates the 4th query by pre-loading the sender's data.
    const chat = await this.chatRepository.findOne({
      where: { id: chatId },
      relations: {
        user1: true,
        user2: true,
      },
    });

    if (!chat || (chat.user1Id !== senderId && chat.user2Id !== senderId)) {
      throw new NotFoundException('Chat not found');
    }

    // Identify the sender and recipient entities from the already loaded relations
    const sender = chat.user1Id === senderId ? chat.user1 : chat.user2;
    const recipientId = chat.user1Id === senderId ? chat.user2Id : chat.user1Id;

    // OPTIMIZATION 2: Create the message entity with the sender relation already attached
    const message = this.messageRepository.create({
      chatId,
      senderId,
      text: cleanText,
      isRead: false,
      sender, // Attaching this ensures the returned object has the sender populated
    });

    // Save the message (Query 2)
    await this.messageRepository.save(message);

    // OPTIMIZATION 3: Use .update() instead of .save() for the chat metadata.
    // .save() performs an unnecessary SELECT before UPDATE. .update() executes instantly.
    chat.updatedAt = new Date();
    await this.chatRepository.update(chatId, { updatedAt: chat.updatedAt });

    // Send push notification to the recipient using pre-loaded data
    const senderName = sender?.name || 'Someone';

    try {
      await this.notificationsService.sendChatNotification(
        recipientId,
        senderName,
        cleanText,
        chatId,
      );
    } catch (error) {
      console.error('Failed to send chat notification:', error);
    }

    // Returns the message entity with its ID assigned by TypeORM and sender attached.
    return message;
  }

  async findById(chatId: number): Promise<Chat | null> {
    return this.chatRepository.findOne({ where: { id: chatId } });
  }

  async findSupportTeamUser(): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { phone: SUPPORT_TEAM_PHONE },
    });

    if (!user) {
      throw new Error(
        `Support team account not found (phone: ${SUPPORT_TEAM_PHONE}). Seed the database first.`,
      );
    }

    return user;
  }

  async getOrCreateThreadWithManager(
    currentUserId: number,
    participantId: number,
    manager: EntityManager,
  ): Promise<Chat> {
    if (currentUserId === participantId) {
      throw new BadRequestException('Cannot create a chat with yourself');
    }

    const participant = await manager.findOne(User, {
      where: { id: participantId },
    });

    if (!participant) {
      throw new NotFoundException('Participant not found');
    }

    const existing = await manager.findOne(Chat, {
      where: [
        { user1Id: currentUserId, user2Id: participantId },
        { user1Id: participantId, user2Id: currentUserId },
      ],
    });

    if (existing) {
      return existing;
    }

    const thread = manager.create(Chat, {
      user1Id: currentUserId,
      user2Id: participantId,
    });

    return manager.save(thread);
  }

  async findAllSupportThreads(
    adminId: number,
    pagination: { skip?: number; take?: number },
  ): Promise<{ items: Chat[]; total: number; skip: number; take: number }> {
    const supportUser = await this.findSupportTeamUser();
    const skip = pagination.skip ?? 0;
    const take = pagination.take ?? 20;

    const qb = this.chatRepository
      .createQueryBuilder('chat')
      .leftJoinAndSelect('chat.user1', 'user1')
      .leftJoinAndSelect('chat.user2', 'user2')
      .leftJoinAndSelect('chat.messages', 'messages')
      // .where(
      //   '(chat.user1Id = :supportId AND chat.user2Id = :adminId) OR (chat.user1Id = :adminId AND chat.user2Id = :supportId)',
      //   { supportId: supportUser.id, adminId },
      // )
      .where('user1.role = :supportRole OR user2.role = :supportRole', {
        supportRole: UserRole.ADMIN,
      })
      .orderBy('chat.updatedAt', 'DESC')
      .skip(skip)
      .take(take);

    const [items, total] = await qb.getManyAndCount();
    return { items, total, skip, take };
  }
}
