import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as admin from 'firebase-admin';
import { DeviceToken } from '../auth/entities/device-token.entity';
import { RegisterFcmTokenDto } from './dto/register-fcm-token.dto';
import { SendNotificationDto } from './dto/send-notification.dto';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private fcmApp: any = null;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(DeviceToken)
    private readonly deviceTokenRepository: Repository<DeviceToken>,
  ) {
    this.initializeFirebase();
  }

  private initializeFirebase() {
    try {
      const projectId = this.configService.get<string>('FCM_PROJECT_ID');
      const privateKey = this.configService.get<string>('FCM_PRIVATE_KEY');
      const clientEmail = this.configService.get<string>('FCM_CLIENT_EMAIL');

      if (!projectId || !privateKey || !clientEmail) {
        this.logger.warn(
          'Firebase credentials not configured. Push notifications will be disabled.',
        );
        return;
      }

      // Check if already initialized
      const existingApp = (admin as any).apps?.find(
        (app: any) => app.name === '[DEFAULT]',
      );
      if (existingApp) {
        this.fcmApp = existingApp;
        this.logger.log('Firebase app already initialized');
        return;
      }

      this.fcmApp = (admin as any).initializeApp({
        credential: (admin as any).credential.cert({
          projectId,
          privateKey: privateKey.replace(/\\n/g, '\n'),
          clientEmail,
        }),
      });

      this.logger.log('Firebase Admin initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Firebase Admin:', error);
      this.fcmApp = null;
    }
  }

  async registerFcmToken(
    userId: number,
    dto: RegisterFcmTokenDto,
  ): Promise<DeviceToken> {
    const deviceToken = await this.deviceTokenRepository.findOne({
      where: { userId, fcmToken: dto.fcmToken },
    });

    if (deviceToken) {
      deviceToken.fcmToken = dto.fcmToken;
      deviceToken.lastUsedAt = new Date();
      return this.deviceTokenRepository.save(deviceToken);
    }

    const newDeviceToken = this.deviceTokenRepository.create({
      userId,
      fcmToken: dto.fcmToken,
      accessToken: this.generateAccessToken(),
      status: 'active' as any,
      lastUsedAt: new Date(),
    });

    return this.deviceTokenRepository.save(newDeviceToken);
  }

  async sendNotification(dto: SendNotificationDto): Promise<boolean> {
    if (!this.fcmApp) {
      this.logger.warn('FCM not initialized, skipping notification');
      return false;
    }

    try {
      const message: any = {
        token: dto.token,
        notification: {
          title: dto.title,
          body: dto.body,
          imageUrl: dto.imageUrl,
        },
        data: dto.data ? JSON.parse(dto.data) : undefined,
        android: {
          priority: 'high',
          notification: {
            channelId: 'default',
            priority: 'high',
          },
        },
        apns: {
          payload: {
            aps: {
              alert: {
                title: dto.title,
                body: dto.body,
              },
              sound: 'default',
              badge: 1,
            },
          },
        },
      };

      const messaging = this.fcmApp.messaging();
      const response = await messaging.send(message);
      this.logger.log(`Notification sent successfully: ${response}`);
      return true;
    } catch (error) {
      this.logger.error('Failed to send notification:', error);
      return false;
    }
  }

  async sendNotificationToUser(
    userId: number,
    title: string,
    body: string,
    data?: Record<string, string>,
  ): Promise<boolean> {
    const deviceTokens = await this.deviceTokenRepository.find({
      where: { userId, status: 'active' as any },
    });

    if (deviceTokens.length === 0) {
      this.logger.warn(`No active FCM tokens found for user ${userId}`);
      return false;
    }

    let successCount = 0;
    for (const deviceToken of deviceTokens) {
      if (deviceToken.fcmToken) {
        const result = await this.sendNotification({
          token: deviceToken.fcmToken,
          title,
          body,
          data: data ? JSON.stringify(data) : undefined,
        });
        if (result) {
          successCount++;
        }
      }
    }

    this.logger.log(
      `Sent notifications to ${successCount}/${deviceTokens.length} devices for user ${userId}`,
    );
    return successCount > 0;
  }

  async sendChatNotification(
    recipientId: number,
    senderName: string,
    message: string,
    chatId: number,
  ): Promise<boolean> {
    return this.sendNotificationToUser(
      recipientId,
      `New message from ${senderName}`,
      message,
      {
        type: 'chat',
        chatId: chatId.toString(),
      },
    );
  }

  async sendOrderStatusNotification(
    userId: number,
    orderId: string,
    status: string,
  ): Promise<boolean> {
    const statusMessages: Record<string, string> = {
      PENDING: 'Your order has been received and is pending confirmation.',
      CONFIRMED: 'Your order has been confirmed!',
      PREPARING: 'Your order is being prepared.',
      OUT_FOR_DELIVERY: 'Your order is out for delivery!',
      DELIVERED: 'Your order has been delivered. Enjoy!',
      CANCELLED: 'Your order has been cancelled.',
      COMPLETED: 'Your order has been completed.',
    };

    const message =
      statusMessages[status] || `Order status updated to ${status}`;

    return this.sendNotificationToUser(
      userId,
      `Order #${orderId} Update`,
      message,
      {
        type: 'order',
        orderId,
        status,
      },
    );
  }

  private generateAccessToken(): string {
    return (
      Math.random().toString(36).substring(2, 15) +
      Math.random().toString(36).substring(2, 15)
    );
  }

  isConfigured(): boolean {
    return this.fcmApp !== null;
  }
}
