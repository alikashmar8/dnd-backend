import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { UserRole } from '../enums/user-role.enum';
import { NotificationsService } from '../notifications/notifications.service';
import { User } from '../users/entities/user.entity';
import { ChatMessage } from './entities/chat-message.entity';
import { Chat } from './entities/chat.entity';

/** Roles that can view and answer customer support chats. */
const STAFF_ROLES = [UserRole.SUPERADMIN];

function isStaffRole(role?: UserRole): boolean {
  return !!role && STAFF_ROLES.includes(role);
}

/** One entry of the thread-list response: the chat plus its computed preview data. */
export interface ChatThreadPreview {
  chat: Chat;
  latestMessage: ChatMessage | null;
  unreadCount: number;
}

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
  ): Promise<{
    items: ChatThreadPreview[];
    total: number;
    skip: number;
    take: number;
  }> {
    const skip = pagination.skip ?? 0;
    const take = pagination.take ?? 20;

    const qb = this.chatRepository
      .createQueryBuilder('chat')
      .leftJoinAndSelect('chat.user1', 'user1')
      .leftJoinAndSelect('chat.user2', 'user2')
      .where('chat.user1Id = :currentUserId OR chat.user2Id = :currentUserId', {
        currentUserId,
      })
      .orderBy('chat.updatedAt', 'DESC')
      .offset(skip)
      .limit(take);

    const [items, total] = await qb.getManyAndCount();
    return {
      items: await this.attachLatestMessages(items, currentUserId),
      total,
      skip,
      take,
    };
  }

  /**
   * Builds the thread-list response for the given chats, attaching only the most
   * recent message of each thread (used for list previews) plus the per-thread
   * unread count for `currentUserId`. Returns a clean `ChatThreadPreview`
   * wrapper instead of mutating the `Chat` entity. Avoids loading every message
   * of every thread, which would make the response grow unboundedly with long
   * conversations.
   */
  private async attachLatestMessages(
    chats: Chat[],
    currentUserId: number,
  ): Promise<ChatThreadPreview[]> {
    if (chats.length === 0) return [];

    const chatIds = chats.map((chat) => chat.id);

    const [latestMessages, unreadCounts] = await Promise.all([
      this.messageRepository
        .createQueryBuilder('message')
        .distinctOn(['message.chatId'])
        .where('message.chatId IN (:...chatIds)', { chatIds })
        .orderBy('message.chatId', 'ASC')
        .addOrderBy('message.createdAt', 'DESC')
        .getMany(),
      this.messageRepository
        .createQueryBuilder('message')
        .select('message.chatId', 'chatId')
        .addSelect('COUNT(*)', 'count')
        .where('message.chatId IN (:...chatIds)', { chatIds })
        .andWhere('message.isRead = false')
        .andWhere('message.senderId != :currentUserId', { currentUserId })
        .groupBy('message.chatId')
        .getRawMany<{ chatId: string; count: string }>(),
    ]);

    const latestByChat = new Map<number, ChatMessage>(
      latestMessages.map((message) => [message.chatId, message]),
    );

    const unreadByChat = new Map<number, number>(
      unreadCounts.map((row) => [Number(row.chatId), Number(row.count)]),
    );

    return chats.map((chat) => ({
      chat,
      latestMessage: latestByChat.get(chat.id) ?? null,
      unreadCount: unreadByChat.get(chat.id) ?? 0,
    }));
  }

  /**
   * Total number of unread messages for the current user across every chat
   * they participate in (used for the sidebar / tab badge). Staff members see
   * the unread total across the whole support inbox instead.
   */
  async getUnreadCount(
    currentUserId: number,
    currentUserRole?: UserRole,
  ): Promise<number> {
    if (isStaffRole(currentUserRole)) {
      const rows = await this.messageRepository.manager.query<
        Array<{ count: number }>
      >(
        `SELECT COUNT(*) AS "count"
         FROM chat_messages m
         JOIN chat_threads c ON c.id = m."chatId"
         WHERE c.type = 'support'
           AND m."senderId" != $1
           AND m."isRead" = false`,
        [currentUserId],
      );
      return Number(rows[0]?.count ?? 0);
    }

    const rows = await this.messageRepository.manager.query<
      Array<{ count: number }>
    >(
      `SELECT COUNT(*) AS "count"
       FROM chat_messages m
       JOIN chat_threads c ON c.id = m."chatId"
       WHERE (c."user1Id" = $1 OR c."user2Id" = $1)
         AND m."senderId" != $1
         AND m."isRead" = false`,
      [currentUserId],
    );
    return Number(rows[0]?.count ?? 0);
  }

  /**
   * Marks every incoming (i.e. not sent by `currentUserId`) unread message of
   * a chat as read. Returns the ids of the messages that changed and their
   * senders so the senders can be notified in real time. Does NOT bump the
   * chat's updatedAt so the thread list ordering is unaffected by reading.
   */
  async markChatAsRead(
    chatId: number,
    currentUserId: number,
    currentUserRole?: UserRole,
  ): Promise<{
    chatId: number;
    messageIds: number[];
    senderIds: number[];
    isSupport: boolean;
  }> {
    const chat = await this.resolveChatAccess(
      chatId,
      currentUserId,
      currentUserRole,
    );

    const unread = await this.messageRepository.find({
      where: { chatId, isRead: false },
    });

    const toMark = unread
      .filter((message) => message.senderId !== currentUserId)
      .map((message) => message.id);
    const senderIds = Array.from(
      new Set(
        unread
          .filter((message) => message.senderId !== currentUserId)
          .map((message) => message.senderId),
      ),
    );

    if (toMark.length > 0) {
      await this.messageRepository.update({ id: In(toMark) }, { isRead: true });
    }

    return {
      chatId,
      messageIds: toMark,
      senderIds,
      isSupport: chat.isSupport,
    };
  }

  async findMessages(
    chatId: number,
    currentUserId: number,
    pagination: { skip?: number; take?: number },
    currentUserRole?: UserRole,
  ): Promise<{
    items: ChatMessage[];
    total: number;
    skip: number;
    take: number;
  }> {
    await this.resolveChatAccess(chatId, currentUserId, currentUserRole);

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
    type: 'direct' | 'support' = 'direct',
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
      type,
    });

    return this.chatRepository.save(thread);
  }

  async sendMessage(
    chatId: number,
    senderId: number,
    text: string,
  ): Promise<ChatMessage> {
    const { message } = await this.sendMessageWithRecipient(
      chatId,
      senderId,
      text,
    );
    return message;
  }

  async sendMessageWithRecipient(
    chatId: number,
    senderId: number,
    text: string,
    senderRole?: UserRole,
  ): Promise<{
    message: ChatMessage;
    recipientId: number;
    isSupport: boolean;
  }> {
    // Fail-fast validation before hitting the database
    if (!text?.trim()) {
      throw new BadRequestException('Message text cannot be empty');
    }
    const cleanText = text.trim();

    const chat = await this.chatRepository.findOne({
      where: { id: chatId },
      relations: {
        user1: true,
        user2: true,
      },
    });

    if (!chat) {
      throw new NotFoundException('Chat not found');
    }

    const isParticipant =
      chat.user1Id === senderId || chat.user2Id === senderId;
    const isSupportThread = chat.type === 'support';
    const isStaff = isStaffRole(senderRole);

    // Participants may always send. Staff may answer support threads they are
    // not assigned to (the shared team inbox).
    if (!isParticipant && !(isSupportThread && isStaff)) {
      throw new NotFoundException('Chat not found');
    }

    // Resolve the sender user (a support agent may not be one of the thread's
    // two anchored participants) and the recipient. For a participant sender
    // the recipient is simply the other participant; for a non-participant
    // staff agent the recipient is always the customer.
    const sender = isParticipant
      ? chat.user1Id === senderId
        ? chat.user1
        : chat.user2
      : ((await this.userRepository.findOne({ where: { id: senderId } })) ??
        undefined);
    const recipientId = isParticipant
      ? chat.user1Id === senderId
        ? chat.user2Id
        : chat.user1Id
      : chat.user1?.role === UserRole.CUSTOMER
        ? chat.user1Id
        : chat.user2Id;

    // OPTIMIZATION: Create the message entity with the sender relation already
    // attached so the response carries the populated sender.
    const message = this.messageRepository.create({
      chatId,
      senderId,
      text: cleanText,
      isRead: false,
      sender,
    });

    // Save the message
    await this.messageRepository.save(message);

    // OPTIMIZATION: .update() instead of .save() skips the SELECT-before-UPDATE.
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
    return { message, recipientId, isSupport: isSupportThread };
  }

  async findById(chatId: number): Promise<Chat | null> {
    return this.chatRepository.findOne({ where: { id: chatId } });
  }

  async findSupportTeamUser(): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { role: UserRole.SUPERADMIN },
      order: { id: 'ASC' },
    });

    if (!user) {
      throw new Error(
        'Support team account not found. Seed the database first.',
      );
    }

    return user;
  }

  async getOrCreateThreadWithManager(
    currentUserId: number,
    participantId: number,
    manager: EntityManager,
    type: 'direct' | 'support' = 'direct',
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
      type,
    });

    return manager.save(thread);
  }

  /**
   * Returns every customer support thread (the shared team inbox). Callable by
   * any staff member (admin/support); the controller guards the role.
   */
  async findAllSupportThreads(
    staffUserId: number,
    pagination: { skip?: number; take?: number },
  ): Promise<{
    items: ChatThreadPreview[];
    total: number;
    skip: number;
    take: number;
  }> {
    await this.findSupportTeamUser();
    const skip = pagination.skip ?? 0;
    const take = pagination.take ?? 20;

    const qb = this.chatRepository
      .createQueryBuilder('chat')
      .leftJoinAndSelect('chat.user1', 'user1')
      .leftJoinAndSelect('chat.user2', 'user2')
      .where('chat.type = :type', { type: 'support' })
      .orderBy('chat.updatedAt', 'DESC')
      .offset(skip)
      .limit(take);

    const [items, total] = await qb.getManyAndCount();
    return {
      items: await this.attachLatestMessages(items, staffUserId),
      total,
      skip,
      take,
    };
  }

  /**
   * Resolves a chat and whether the requesting user may access it, throwing
   * `NotFoundException` otherwise. Participants can always access their own
   * threads; staff (admin/support) can additionally access any support thread
   * even if they are not one of its two anchored participants.
   */
  async resolveChatAccess(
    chatId: number,
    currentUserId: number,
    currentUserRole?: UserRole,
  ): Promise<{
    chat: Chat;
    counterpartId: number;
    isSupport: boolean;
  }> {
    const chat = await this.chatRepository.findOne({
      where: { id: chatId },
      relations: { user1: true, user2: true },
    });

    if (!chat) {
      throw new NotFoundException('Chat not found');
    }

    const isParticipant =
      chat.user1Id === currentUserId || chat.user2Id === currentUserId;

    if (chat.type === 'support') {
      if (!isParticipant && !isStaffRole(currentUserRole)) {
        throw new NotFoundException('Chat not found');
      }
      const customer =
        chat.user1?.role === UserRole.CUSTOMER ? chat.user1 : chat.user2;
      if (!customer) {
        throw new NotFoundException('Chat not found');
      }
      return {
        chat,
        counterpartId: isParticipant
          ? chat.user1Id === currentUserId
            ? chat.user2Id
            : chat.user1Id
          : customer.id,
        isSupport: true,
      };
    }

    if (!isParticipant) {
      throw new NotFoundException('Chat not found');
    }

    return {
      chat,
      counterpartId:
        chat.user1Id === currentUserId ? chat.user2Id : chat.user1Id,
      isSupport: false,
    };
  }
}
