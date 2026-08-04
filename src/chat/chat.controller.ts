import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';
import { AuthGuard } from '../common/guards/auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateChatDto } from './dto/create-chat.dto';
import { CreateMessageDto } from './dto/create-message.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { UserRole } from '../enums/user-role.enum';

@Controller('chats')
@UseGuards(AuthGuard)
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly chatGateway: ChatGateway,
  ) {}

  @Get('support')
  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPERADMIN)
  async findSupportThreads(
    @CurrentUser('id') currentUserId: number,
    @Query() pagination: PaginationDto,
  ) {
    return await this.chatService.findAllSupportThreads(
      currentUserId,
      pagination,
    );
  }

  @Get('unread-count')
  async unreadCount(
    @CurrentUser('id') currentUserId: number,
    @CurrentUser('role') role: UserRole,
  ) {
    return {
      total: await this.chatService.getUnreadCount(currentUserId, role),
    };
  }

  @Get()
  async findAll(
    @CurrentUser('id') currentUserId: number,
    @Query() pagination: PaginationDto,
  ) {
    return await this.chatService.findAllThreads(currentUserId, pagination);
  }

  @Post(':id/read')
  async markChatAsRead(
    @CurrentUser('id') currentUserId: number,
    @CurrentUser('role') role: UserRole,
    @Param('id', ParseIntPipe) chatId: number,
  ) {
    const result = await this.chatService.markChatAsRead(
      chatId,
      currentUserId,
      role,
    );

    // Notify the senders of the messages that were just read so their read
    // receipts update live. For support threads, also notify every staff
    // member so the whole team inbox stays in sync.
    if (result.messageIds.length > 0) {
      this.chatGateway.broadcastMessagesRead(
        chatId,
        result.messageIds,
        result.senderIds,
        result.isSupport,
      );
    }

    return result;
  }

  @Get(':id/messages')
  async findMessages(
    @CurrentUser('id') currentUserId: number,
    @CurrentUser('role') role: UserRole,
    @Param('id', ParseIntPipe) chatId: number,
    @Query() pagination: PaginationDto,
  ) {
    return await this.chatService.findMessages(
      chatId,
      currentUserId,
      pagination,
      role,
    );
  }

  @Post()
  async createThread(
    @CurrentUser('id') currentUserId: number,
    @Body() payload: CreateChatDto,
  ) {
    return await this.chatService.getOrCreateThread(
      currentUserId,
      payload.participantId,
    );
  }

  @Post(':id/messages')
  async sendMessage(
    @CurrentUser('id') currentUserId: number,
    @CurrentUser('role') role: UserRole,
    @Param('id', ParseIntPipe) chatId: number,
    @Body() payload: CreateMessageDto,
  ) {
    const { message, recipientId, isSupport } =
      await this.chatService.sendMessageWithRecipient(
        chatId,
        currentUserId,
        payload.text,
        role,
      );

    // Push the message to both participants' sockets in real time. Support
    // thread messages also fan out to every connected staff member so the
    // shared inbox updates without a refetch.
    this.chatGateway.broadcastMessage(message, recipientId, isSupport);

    return message;
  }
}
