import {
  Inject,
  Injectable,
  Logger,
  NotAcceptableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { getMessaging, Messaging } from 'firebase-admin/messaging';
import { FIREBASE_ADMIN } from '../firebase/firebase-admin.module';
import type { FirebaseApp } from '../firebase/firebase-admin.module';
import {
  DeviceToken,
  DeviceTokenStatus,
} from '../auth/entities/device-token.entity';
import { RegisterFcmTokenDto } from './dto/register-fcm-token.dto';
import { SendNotificationDto } from './dto/send-notification.dto';
import { AppNotification } from './entities/app-notification.entity';

// FCM error codes that mean a stored registration token is no longer valid on
// the Firebase side (device uninstalled app, revoked, or token rotated).
const INVALID_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

// FCM v1 reports malformed tokens as INVALID_ARGUMENT with this description.
const INVALID_TOKEN_MESSAGE = /not a valid FCM registration token/i;

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @Inject(FIREBASE_ADMIN) private readonly fcmApp: FirebaseApp,
    @InjectRepository(DeviceToken)
    private readonly deviceTokenRepository: Repository<DeviceToken>,
    @InjectRepository(AppNotification)
    private readonly notificationRepository: Repository<AppNotification>,
  ) {}

  /**
   * Idempotently (re)registers the caller's FCM token.
   *
   * - Prefers to update the device row belonging to the authenticated session
   *   (matched by accessToken) so repeated calls never accumulate rows.
   * - Deactivates any other ACTIVE row that already holds the same fcmToken
   *   (a token belongs to exactly one device/account at a time).
   */
  async registerFcmToken(
    userId: number,
    accessToken: string | undefined,
    dto: RegisterFcmTokenDto,
  ): Promise<DeviceToken> {
    const token = dto.fcmToken?.trim();
    if (!token) {
      throw new NotAcceptableException('fcmToken must not be empty');
    }

    // The same physical device cannot be actively registered to two accounts.
    await this.deviceTokenRepository.update(
      {
        fcmToken: token,
        userId: Not(userId),
        status: DeviceTokenStatus.ACTIVE,
      },
      { status: DeviceTokenStatus.INACTIVE },
    );

    let deviceToken: DeviceToken | null = null;

    if (accessToken) {
      deviceToken = await this.deviceTokenRepository.findOne({
        where: { accessToken },
      });
    }

    if (deviceToken) {
      deviceToken.fcmToken = token;
      deviceToken.status = DeviceTokenStatus.ACTIVE;
      deviceToken.lastUsedAt = new Date();
      return this.deviceTokenRepository.save(deviceToken);
    }

    deviceToken = await this.deviceTokenRepository.findOne({
      where: { userId, fcmToken: token },
    });

    if (deviceToken) {
      deviceToken.status = DeviceTokenStatus.ACTIVE;
      deviceToken.lastUsedAt = new Date();
      return this.deviceTokenRepository.save(deviceToken);
    }

    const newDeviceToken = this.deviceTokenRepository.create({
      userId,
      fcmToken: token,
      accessToken: this.generateAccessToken(),
      status: DeviceTokenStatus.ACTIVE,
      lastUsedAt: new Date(),
    });

    return this.deviceTokenRepository.save(newDeviceToken);
  }

  async sendNotification(dto: SendNotificationDto): Promise<boolean> {
    if (!this.fcmApp) {
      this.logger.error(
        'Firebase Admin not initialized — cannot send push notification',
      );
      return false;
    }

    try {
      const message = this.buildMessage(dto);

      const messaging: Messaging = getMessaging(this.fcmApp);
      const response = await messaging.send(message);
      this.logger.log(`Notification sent successfully: ${response}`);
      return true;
    } catch (error) {
      const err = error as {
        code?: string;
        message?: string;
        errorInfo?: { code?: string };
      };
      const code = err?.code ?? err?.errorInfo?.code;
      const isInvalidToken =
        INVALID_TOKEN_CODES.has(code ?? '') ||
        INVALID_TOKEN_MESSAGE.test(err?.message ?? '');
      if (isInvalidToken) {
        this.logger.warn(
          `FCM token ${dto.token} is invalid or unregistered (${code ?? 'invalid-argument'}); deactivating stored row.`,
        );
        await this.deviceTokenRepository.update(
          { fcmToken: dto.token },
          { status: DeviceTokenStatus.INACTIVE },
        );
      } else {
        this.logger.error('Failed to send notification:', error);
      }
      return false;
    }
  }

  /**
   * Builds an FCM v1 message. `notification.image` is the supported image
   * field (Android); `imageUrl` is NOT a valid FCM field. `data` must be a
   * flat map of string values.
   */
  private buildMessage(dto: SendNotificationDto): {
    token: string;
    notification: {
      title: string;
      body: string;
      image?: string;
    };
    data?: Record<string, string>;
    android: Record<string, unknown>;
    apns: Record<string, unknown>;
  } {
    return {
      token: dto.token,
      notification: {
        title: dto.title,
        body: dto.body,
        ...(dto.imageUrl ? { image: dto.imageUrl } : {}),
      },
      data: dto.data ? this.sanitizeData(dto.data) : undefined,
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
  }

  /** Flattens a JSON string into the string->string map FCM requires. */
  private sanitizeData(data: string): Record<string, string> | undefined {
    try {
      const parsed: unknown = JSON.parse(data);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const result: Record<string, string> = {};
        for (const [key, value] of Object.entries(
          parsed as Record<string, unknown>,
        )) {
          result[key] =
            typeof value === 'string' ? value : JSON.stringify(value);
        }
        return result;
      }
    } catch {
      this.logger.warn('Ignoring invalid notification data JSON');
    }
    return undefined;
  }

  async sendNotificationToUser(
    userId: number,
    title: string,
    body: string,
    data?: Record<string, string>,
  ): Promise<boolean> {
    const deviceTokens = await this.deviceTokenRepository.find({
      where: { userId, status: DeviceTokenStatus.ACTIVE },
    });

    // Persist an inbox row regardless of whether FCM push succeeds so staff can
    // review missed pushes in-app (R7).
    try {
      const notification = this.notificationRepository.create({
        userId,
        title,
        body,
        type: data?.type ?? 'system',
        data: data ?? null,
      });
      await this.notificationRepository.save(notification);
    } catch (error) {
      this.logger.error('Failed to persist notification inbox row:', error);
    }

    if (deviceTokens.length === 0) {
      this.logger.warn(`No active FCM tokens found for user ${userId}`);
      return false;
    }

    // Deduplicate by token so a device is never pushed twice for one event.
    const seen = new Set<string>();
    let successCount = 0;
    let attempted = 0;
    for (const deviceToken of deviceTokens) {
      if (!deviceToken.fcmToken || seen.has(deviceToken.fcmToken)) {
        continue;
      }
      seen.add(deviceToken.fcmToken);
      attempted++;
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

    this.logger.log(
      `Sent notifications to ${successCount}/${attempted} devices for user ${userId}`,
    );
    return successCount > 0;
  }

  async findForUser(
    userId: number,
    skip = 0,
    take = 20,
  ): Promise<{
    items: AppNotification[];
    total: number;
    skip: number;
    take: number;
    unreadCount: number;
  }> {
    const [items, total] = await this.notificationRepository.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      skip,
      take,
    });
    const unreadCount = await this.notificationRepository.count({
      where: { userId, isRead: false },
    });
    return { items, total, skip, take, unreadCount };
  }

  async markAsRead(userId: number, notificationId: number): Promise<void> {
    await this.notificationRepository.update(
      { id: notificationId, userId },
      { isRead: true },
    );
  }

  async markAllAsRead(userId: number): Promise<void> {
    await this.notificationRepository.update(
      { userId, isRead: false },
      { isRead: true },
    );
  }

  async unreadCount(userId: number): Promise<number> {
    return this.notificationRepository.count({
      where: { userId, isRead: false },
    });
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
      pending: 'Your order has been received and is pending confirmation.',
      confirmed: 'Your order has been confirmed!',
      preparing: 'Your order is being prepared.',
      waiting_for_pickup: 'Your order is ready and waiting for pickup.',
      in_route: 'Your order is out for delivery!',
      delivered: 'Your order has been delivered. Enjoy!',
      cancelled: 'Your order has been cancelled.',
      completed: 'Your order has been completed.',
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
