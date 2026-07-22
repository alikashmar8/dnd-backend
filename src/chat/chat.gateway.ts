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

    const chat = await this.chatService.findById(payload.chatId);
    if (!chat || (chat.user1Id !== user.id && chat.user2Id !== user.id)) {
      client.emit('error', 'Chat not found or access denied');
      return;
    }

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

    const message = await this.chatService.sendMessage(
      payload.chatId,
      user.id,
      payload.text,
    );

    this.server.to(`chat_${payload.chatId}`).emit('message', message);
  }
}
