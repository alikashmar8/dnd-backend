import { Injectable, Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { AuthService } from '../auth/auth.service';
import { ChatService } from './chat.service';
import { ChatMessage } from './entities/chat-message.entity';
import { UserRole } from '../enums/user-role.enum';

/** Socket room shared by every connected staff (superadmin) member. */
export const SUPPORT_STAFF_ROOM = 'support_staff';

function isStaffRole(role?: UserRole): boolean {
  return !!role && role === UserRole.SUPERADMIN;
}

@WebSocketGateway({ namespace: 'chat', cors: true })
@Injectable()
export class ChatGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(ChatGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly authService: AuthService,
    private readonly chatService: ChatService,
  ) {}

  afterInit(server: Server) {
    this.logger.log('Chat gateway initialized');
  }

  async handleConnection(client: Socket) {
    const token = client.handshake.auth.token as string | undefined;

    if (!token) {
      this.logger.warn('Socket connection rejected: missing token');
      client.disconnect();
      return;
    }

    try {
      const user = await this.authService.validateUserByToken(token);
      client.data.user = user;
      // Join a personal room so every chat message reaches this user regardless
      // of which screen they are currently viewing (room or conversation list).
      await client.join(`user_${user.id}`);
      // Staff members also join the shared support inbox room so they receive
      // every customer support message live, whoever answers it.
      if (isStaffRole(user.role)) {
        await client.join(SUPPORT_STAFF_ROOM);
      }
      this.logger.log(`Socket connected: user=${user.id}`);
    } catch (error) {
      this.logger.warn('Socket connection rejected: invalid token');
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const user = client.data.user;
    this.logger.log(`Socket disconnected: user=${user?.id ?? 'unknown'}`);
  }

  /**
   * Delivers a persisted message to both participants through their personal
   * rooms. Using per-user rooms (instead of only a chat room) guarantees the
   * message is received even when the recipient is not on the chat room screen.
   * Support-thread messages additionally fan out to the shared staff room so
   * the whole support team sees them live.
   */
  broadcastMessage(
    message: ChatMessage,
    recipientId: number,
    isSupport = false,
  ): void {
    const payload = this.sanitizeMessage(message);
    this.server.to(`user_${message.senderId}`).emit('message', payload);
    this.server.to(`user_${recipientId}`).emit('message', payload);
    if (isSupport) {
      this.server.to(SUPPORT_STAFF_ROOM).emit('message', payload);
    }
  }

  /**
   * Strip sensitive fields (password hash, token-related data) from the sender
   * relation before pushing a message over the socket. Socket payloads bypass
   * the HTTP serializer interceptor, so this keeps credentials out of clients.
   */
  private sanitizeMessage(message: ChatMessage): ChatMessage {
    if (!message.sender) return message;
    const { passwordHash: _passwordHash, ...sender } = message.sender;
    return {
      ...message,
      sender: sender as typeof message.sender,
    };
  }

  /**
   * Notifies the senders that some of their messages were read by the other
   * participant, so their UI can update read receipts in real time. Support
   * read events also reach the shared staff room so the whole inbox stays in
   * sync.
   */
  broadcastMessagesRead(
    chatId: number,
    messageIds: number[],
    senderIds: number[],
    isSupport = false,
  ): void {
    if (messageIds.length === 0) return;
    const payload = { chatId, messageIds };
    for (const senderId of senderIds) {
      this.server.to(`user_${senderId}`).emit('messagesRead', payload);
    }
    if (isSupport) {
      this.server.to(SUPPORT_STAFF_ROOM).emit('messagesRead', payload);
    }
  }

  @SubscribeMessage('typing')
  async handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { chatId: number; isTyping: boolean },
  ) {
    const user = client.data.user;
    if (!user) {
      client.emit('error', 'Unauthorized');
      return;
    }

    const { counterpartId } = await this.chatService.resolveChatAccess(
      payload.chatId,
      user.id,
      user.role,
    );

    // Only the OTHER participant needs the indicator; the sender sees their own
    // input directly.
    this.server.to(`user_${counterpartId}`).emit('typing', {
      chatId: payload.chatId,
      userId: user.id,
      isTyping: !!payload.isTyping,
    });
  }

  @SubscribeMessage('joinChat')
  async handleJoinChat(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { chatId: number },
  ) {
    const user = client.data.user;
    if (!user) {
      client.emit('error', 'Unauthorized');
      return;
    }

    await this.chatService.resolveChatAccess(
      payload.chatId,
      user.id,
      user.role,
    );

    client.join(`chat_${payload.chatId}`);
    client.emit('joined', { chatId: payload.chatId });
  }

  @SubscribeMessage('sendMessage')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { chatId: number; text: string },
  ) {
    const user = client.data.user;
    if (!user) {
      client.emit('error', 'Unauthorized');
      return;
    }

    const { message, recipientId, isSupport } =
      await this.chatService.sendMessageWithRecipient(
        payload.chatId,
        user.id,
        payload.text,
        user.role,
      );

    this.broadcastMessage(message, recipientId, isSupport);
  }
}
