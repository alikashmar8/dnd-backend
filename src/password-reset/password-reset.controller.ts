import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthGuard } from '../common/guards/auth.guard';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { PasswordResetService } from './password-reset.service';

@Controller('auth')
export class PasswordResetController {
  constructor(private readonly passwordResetService: PasswordResetService) {}

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 900000 } })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return await this.passwordResetService.requestReset(dto.email, dto.phone);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 900000 } })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return await this.passwordResetService.resetPassword(
      dto.token,
      dto.code,
      dto.identifier,
      dto.password,
    );
  }

  @Post('change-password')
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async changePassword(
    @CurrentUser('id') userId: number,
    @Headers('authorization') authHeader: string,
    @Body() dto: ChangePasswordDto,
  ) {
    return await this.passwordResetService.changePassword(
      userId,
      dto.currentPassword,
      dto.newPassword,
      authHeader?.replace('Bearer ', ''),
    );
  }
}
