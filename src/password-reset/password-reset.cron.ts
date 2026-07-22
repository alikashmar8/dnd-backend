import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { PasswordResetToken } from './entities/password-reset-token.entity';

@Injectable()
export class PasswordResetCron {
  private readonly logger = new Logger(PasswordResetCron.name);

  constructor(
    @InjectRepository(PasswordResetToken)
    private readonly resetTokenRepository: Repository<PasswordResetToken>,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanExpiredTokens() {
    const result = await this.resetTokenRepository.delete({
      expiresAt: LessThan(new Date()),
    });
    if (result.affected && result.affected > 0) {
      this.logger.log(
        `Cleaned ${result.affected} expired password reset tokens`,
      );
    }

    const usedResult = await this.resetTokenRepository.delete({ used: true });
    if (usedResult.affected && usedResult.affected > 0) {
      this.logger.log(
        `Cleaned ${usedResult.affected} used password reset tokens`,
      );
    }
  }
}
