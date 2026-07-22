import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthService } from '../auth/auth.service';
import { DeviceToken } from '../auth/entities/device-token.entity';
import { User } from '../users/entities/user.entity';
import { PasswordResetToken } from './entities/password-reset-token.entity';
import { MailService } from './mail.service';
import { PasswordResetController } from './password-reset.controller';
import { PasswordResetCron } from './password-reset.cron';
import { PasswordResetService } from './password-reset.service';
import { SmsService } from './sms.service';

@Module({
  imports: [TypeOrmModule.forFeature([PasswordResetToken, User, DeviceToken])],
  controllers: [PasswordResetController],
  providers: [
    PasswordResetService,
    PasswordResetCron,
    MailService,
    SmsService,
    AuthService,
  ],
  exports: [PasswordResetService],
})
export class PasswordResetModule {}
