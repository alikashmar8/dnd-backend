import { Controller, Post, Body, UseGuards, Get } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { RegisterFcmTokenDto } from './dto/register-fcm-token.dto';
import { SendNotificationDto } from './dto/send-notification.dto';
import { AuthGuard } from '../common/guards/auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../enums/user-role.enum';

@Controller('notifications')
@UseGuards(AuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post('token')
  async registerFcmToken(
    @CurrentUser() user: User,
    @Body() dto: RegisterFcmTokenDto,
  ) {
    const deviceToken = await this.notificationsService.registerFcmToken(
      user.id,
      dto,
    );
    return {
      success: true,
      message: 'FCM token registered successfully',
      data: deviceToken,
    };
  }

  @Get('status')
  async getStatus() {
    return {
      configured: this.notificationsService.isConfigured(),
      message: this.notificationsService.isConfigured()
        ? 'FCM is configured and ready'
        : 'FCM is not configured. Set environment variables to enable push notifications.',
    };
  }

  @Post('send')
  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPERADMIN)
  async sendNotification(@Body() dto: SendNotificationDto) {
    const success = await this.notificationsService.sendNotification(dto);
    return {
      success,
      message: success
        ? 'Notification sent successfully'
        : 'Failed to send notification',
    };
  }
}
