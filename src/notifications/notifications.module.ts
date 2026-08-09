import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthService } from '../auth/auth.service';
import { DeviceToken } from '../auth/entities/device-token.entity';
import { User } from '../users/entities/user.entity';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { AppNotification } from './entities/app-notification.entity';

@Module({
  imports: [TypeOrmModule.forFeature([DeviceToken, User, AppNotification])],
  controllers: [NotificationsController],
  providers: [NotificationsService, AuthService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
