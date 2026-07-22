import {
  Injectable,
  Logger,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { User } from '../users/entities/user.entity';
import { PasswordResetToken } from './entities/password-reset-token.entity';
import { DeviceToken } from '../auth/entities/device-token.entity';
import { DeviceTokenStatus } from '../auth/entities/device-token.entity';
import { MailService } from './mail.service';
import { SmsService } from './sms.service';

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    @InjectRepository(PasswordResetToken)
    private readonly resetTokenRepository: Repository<PasswordResetToken>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(DeviceToken)
    private readonly deviceTokenRepository: Repository<DeviceToken>,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
    private readonly smsService: SmsService,
  ) {}

  async requestReset(
    email?: string,
    phone?: string,
  ): Promise<{ message: string }> {
    const user = await this.userRepository.findOne({
      where: email ? { email } : { phone },
    });

    if (!user) {
      return { message: 'If an account exists, a reset code has been sent.' };
    }

    const token = crypto.randomBytes(32).toString('hex');
    const code = crypto.randomInt(100000, 999999).toString();
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiryMinutes =
      this.configService.get<number>('PASSWORD_RESET_EXPIRY_MINUTES') || 30;

    const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

    await this.resetTokenRepository.save(
      this.resetTokenRepository.create({
        userId: user.id,
        tokenHash,
        code,
        expiresAt,
      }),
    );

    if (email) {
      const sent = await this.mailService.sendResetEmail(email, token, code);
      if (!sent) {
        this.logger.warn(`Failed to send reset email to ${email}`);
      }
    }

    if (phone) {
      const sent = await this.smsService.sendResetSms(phone, code);
      if (!sent) {
        this.logger.warn(`Failed to send reset SMS to ${phone}`);
      }
    }

    return { message: 'If an account exists, a reset code has been sent.' };
  }

  async resetPassword(
    token?: string,
    code?: string,
    newPassword?: string,
  ): Promise<{ message: string }> {
    if (!newPassword) {
      throw new BadRequestException('Password is required');
    }

    let tokenHash: string | undefined;
    let queryCode: string | undefined;

    if (token) {
      tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    }
    if (code) {
      queryCode = code;
    }

    const condition = tokenHash
      ? { tokenHash, used: false }
      : { code: queryCode, used: false };
    const resetToken = await this.resetTokenRepository.findOne({
      where: condition,
      relations: { user: true },
    });

    if (!resetToken) {
      throw new UnauthorizedException('Invalid or expired reset code');
    }

    if (resetToken.expiresAt < new Date()) {
      throw new UnauthorizedException('Reset code has expired');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    resetToken.user.passwordHash = hashedPassword;
    await this.userRepository.save(resetToken.user);

    resetToken.used = true;
    await this.resetTokenRepository.save(resetToken);

    await this.deviceTokenRepository.update(
      { userId: resetToken.userId, status: DeviceTokenStatus.ACTIVE },
      { status: DeviceTokenStatus.INACTIVE },
    );

    return { message: 'Password has been reset successfully.' };
  }

  async changePassword(
    userId: number,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    await this.userRepository.save(user);

    return { message: 'Password changed successfully.' };
  }
}
