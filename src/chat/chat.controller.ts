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
  constructor(private readonly chatService: ChatService) {}

  @Get('support')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  async findSupportThreads(
    @CurrentUser('id') currentUserId: number,
    @Query() pagination: PaginationDto,
  ) {
    return await this.chatService.findAllSupportThreads(
      currentUserId,
      pagination,
    );
  }

  @Get()
  async findAll(
    @CurrentUser('id') currentUserId: number,
    @Query() pagination: PaginationDto,
  ) {
    return await this.chatService.findAllThreads(currentUserId, pagination);
  }

  @Get(':id/messages')
  async findMessages(
    @CurrentUser('id') currentUserId: number,
    @Param('id', ParseIntPipe) chatId: number,
    @Query() pagination: PaginationDto,
  ) {
    return await this.chatService.findMessages(
      chatId,
      currentUserId,
      pagination,
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
    @Param('id', ParseIntPipe) chatId: number,
    @Body() payload: CreateMessageDto,
  ) {
    return await this.chatService.sendMessage(
      chatId,
      currentUserId,
      payload.text,
    );
  }
}
