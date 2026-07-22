import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthService } from '../auth/auth.service';
import { DeviceToken } from '../auth/entities/device-token.entity';
import { User } from '../users/entities/user.entity';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([DeviceToken, User])],
  controllers: [NotificationsController],
  providers: [NotificationsService, AuthService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
