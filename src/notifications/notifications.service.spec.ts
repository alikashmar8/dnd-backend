/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotificationsService } from './notifications.service';
import { DeviceToken } from '../auth/entities/device-token.entity';
import { AppNotification } from './entities/app-notification.entity';
import { FIREBASE_ADMIN } from '../firebase/firebase-admin.module';

jest.mock('firebase-admin/messaging', () => ({
  getMessaging: jest.fn().mockImplementation(() => ({ send: jest.fn() })),
}));

import { getMessaging } from 'firebase-admin/messaging';

const mockDeviceTokenRepo = () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  update: jest.fn(),
});

const mockNotificationRepo = () => ({
  findAndCount: jest.fn(),
  count: jest.fn(),
  update: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
});

describe('NotificationsService', () => {
  let service: NotificationsService;
  let notificationRepo: any;
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: FIREBASE_ADMIN, useValue: {} },
        {
          provide: getRepositoryToken(DeviceToken),
          useFactory: mockDeviceTokenRepo,
        },
        {
          provide: getRepositoryToken(AppNotification),
          useFactory: mockNotificationRepo,
        },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
    notificationRepo = module.get(getRepositoryToken(AppNotification));
  });

  it('persists an inbox row for every notification sent (R7)', async () => {
    const deviceTokenRepo = module.get(getRepositoryToken(DeviceToken));
    deviceTokenRepo.find.mockResolvedValue([]);
    notificationRepo.create.mockReturnValue({ id: 1, userId: 5 });
    notificationRepo.save.mockResolvedValue({ id: 1 });

    await service.sendNotificationToUser(
      5,
      'New driver assignment',
      'Order #1',
      {
        type: 'order',
        orderId: 'ORD-1',
      },
    );

    expect(notificationRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 5,
        title: 'New driver assignment',
        type: 'order',
        data: { type: 'order', orderId: 'ORD-1' },
      }),
    );
    expect(notificationRepo.save).toHaveBeenCalled();
  });

  it('marks a single notification as read scoped to the user (R7)', async () => {
    await service.markAsRead(5, 12);
    expect(notificationRepo.update).toHaveBeenCalledWith(
      { id: 12, userId: 5 },
      { isRead: true },
    );
  });

  it('re-registers an FCM token idempotently on the authenticated session row', async () => {
    const deviceTokenRepo = module.get(getRepositoryToken(DeviceToken));
    const existingRow = {
      id: 7,
      userId: 5,
      accessToken: 'abc',
      fcmToken: 'token-1',
      status: 'active',
    };
    deviceTokenRepo.update.mockResolvedValue({ affected: 0 });
    deviceTokenRepo.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(existingRow);
    deviceTokenRepo.save.mockImplementation(async (row: unknown) =>
      Promise.resolve(row),
    );

    const result = await service.registerFcmToken(5, 'abc', {
      fcmToken: 'token-1',
    });

    // Deactivates the token for any *other* account first
    expect(deviceTokenRepo.update).toHaveBeenCalledWith(
      expect.objectContaining({
        fcmToken: 'token-1',
        userId: expect.anything(),
      }),
      { status: 'inactive' },
    );
    // Updates the existing session row instead of creating a duplicate
    expect(deviceTokenRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 7, fcmToken: 'token-1', status: 'active' }),
    );
    expect(result.id).toBe(7);
  });

  it('deactivates a stored device token when FCM rejects it as invalid', async () => {
    const deviceTokenRepo = module.get(getRepositoryToken(DeviceToken));
    // Simulate a configured app whose messaging.send() rejects
    (getMessaging as jest.Mock).mockReturnValue({
      send: jest.fn().mockRejectedValue({
        code: 'messaging/invalid-argument',
        message: 'The registration token is not a valid FCM registration token',
      }),
    });
    deviceTokenRepo.update.mockResolvedValue({ affected: 1 });

    const result = await service.sendNotification({
      token: 'bad-token',
      title: 'T',
      body: 'B',
    });

    expect(result).toBe(false);
    expect(deviceTokenRepo.update).toHaveBeenCalledWith(
      { fcmToken: 'bad-token' },
      { status: 'inactive' },
    );
  });

  it('returns items with an unread count (R7)', async () => {
    notificationRepo.findAndCount.mockResolvedValue([
      [{ id: 1, userId: 5 }],
      1,
    ]);
    notificationRepo.count.mockResolvedValue(0);

    const result = await service.findForUser(5, 0, 20);
    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.unreadCount).toBe(0);
  });
});
