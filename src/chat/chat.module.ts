import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthService } from 'src/auth/auth.service';
import { Order } from 'src/orders/entities/order.entity';
import { DeviceToken } from '../auth/entities/device-token.entity';
import { CommonModule } from '../common/common.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { User } from '../users/entities/user.entity';
import { ChatController } from './chat.controller';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';
import { ChatMessage } from './entities/chat-message.entity';
import { Chat } from './entities/chat.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Chat, ChatMessage, User, DeviceToken, Order]),
    CommonModule,
    NotificationsModule,
  ],
  controllers: [ChatController],
  providers: [ChatService, ChatGateway, AuthService],
  exports: [ChatService],
})
export class ChatModule {}
