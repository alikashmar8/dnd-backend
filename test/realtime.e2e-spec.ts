/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { Server as HttpServer } from 'http';
import { DataSource } from 'typeorm';
import { io, Socket } from 'socket.io-client';
import * as bcrypt from 'bcryptjs';
import { AppModule } from './../src/app.module';
import { User } from './../src/users/entities/user.entity';
import {
  DeviceToken,
  DeviceTokenStatus,
} from './../src/auth/entities/device-token.entity';
import { Order } from './../src/orders/entities/order.entity';
import { OrderItem } from './../src/orders/entities/order-item.entity';
import { Address } from './../src/addresses/entities/address.entity';
import { MenuCategory } from './../src/menu/entities/menu-category.entity';
import { MenuItem } from './../src/menu/entities/menu-item.entity';
import { UserRole } from './../src/enums/user-role.enum';

describe('Realtime — order.updated over Socket.io (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let httpServer: any;
  let baseUrl: string;

  const createdOrderIds: string[] = [];
  const createdUserIds: number[] = [];
  const createdCategoryIds: number[] = [];
  const createdItemIds: number[] = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    // Bind to an ephemeral port so socket.io-client can reach the gateway.
    await app.listen(0);
    const server = app.getHttpServer() as HttpServer;
    const address = server.address();
    const port = (address as { port: number }).port;
    baseUrl = `http://127.0.0.1:${port}`;
    httpServer = app.getHttpServer();

    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    const sockets = await dataSource
      .getRepository(DeviceToken)
      .createQueryBuilder()
      .getMany();
    void sockets;
    if (dataSource?.isInitialized) {
      if (createdOrderIds.length) {
        await dataSource
          .getRepository(OrderItem)
          .createQueryBuilder()
          .delete()
          .where('"orderId" IN (:...ids)', { ids: createdOrderIds })
          .execute();
        await dataSource
          .getRepository(Order)
          .createQueryBuilder()
          .delete()
          .where('id IN (:...ids)', { ids: createdOrderIds })
          .execute();
      }
      if (createdItemIds.length) {
        await dataSource
          .getRepository(MenuItem)
          .createQueryBuilder()
          .delete()
          .where('id IN (:...ids)', { ids: createdItemIds })
          .execute();
      }
      if (createdCategoryIds.length) {
        await dataSource
          .getRepository(MenuCategory)
          .createQueryBuilder()
          .delete()
          .where('id IN (:...ids)', { ids: createdCategoryIds })
          .execute();
      }
      if (createdUserIds.length) {
        await dataSource
          .getRepository(DeviceToken)
          .createQueryBuilder()
          .delete()
          .where('"userId" IN (:...ids)', { ids: createdUserIds })
          .execute();
        await dataSource
          .getRepository(Address)
          .createQueryBuilder()
          .delete()
          .where('"userId" IN (:...ids)', { ids: createdUserIds })
          .execute();
        await dataSource
          .getRepository(User)
          .createQueryBuilder()
          .delete()
          .where('id IN (:...ids)', { ids: createdUserIds })
          .execute();
      }
    }
    await app.close();
  });

  async function createUser(
    role: UserRole,
  ): Promise<{ user: User; token: string }> {
    const phone = `+1555${Math.floor(100000000 + Math.random() * 899999999)}`;
    const passwordHash = await bcrypt.hash('test-password', 4);

    const user = await dataSource.getRepository(User).save({
      name: `E2E ${role}`,
      phone,
      passwordHash,
      role,
    });
    createdUserIds.push(user.id);

    const token = `e2e-${role}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await dataSource.getRepository(DeviceToken).save({
      userId: user.id,
      accessToken: token,
      deviceInfo: 'e2e',
      deviceType: 'e2e',
      fcmToken: null,
      status: DeviceTokenStatus.ACTIVE,
      lastUsedAt: new Date(),
    });

    return { user, token };
  }

  function connectSocket(token: string): Promise<Socket> {
    return new Promise((resolve, reject) => {
      const socket = io(`${baseUrl}/orders`, {
        transports: ['websocket'],
        auth: { token },
        reconnection: false,
      });
      socket.on('connect', () => resolve(socket));
      socket.on('connect_error', reject);
    });
  }

  it('should disconnect a socket whose token is invalid', async () => {
    const client = io(`${baseUrl}/orders`, {
      transports: ['websocket'],
      auth: { token: 'definitely-not-a-token' },
      reconnection: false,
    });

    // The transport-level handshake succeeds first; the gateway then rejects
    // the invalid token by actively disconnecting the client. Wait for that.
    await new Promise<void>((resolve, reject) => {
      client.once('connect', () => resolve());
      client.once('connect_error', () => reject(new Error('handshake failed')));
    });

    await Promise.race([
      new Promise<void>((resolve) =>
        client.once('disconnect', () => resolve()),
      ),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error('socket stayed connected with invalid token')),
          2000,
        ),
      ),
    ]);
    client.disconnect();
  });

  it('should deliver order.updated to the owning customer over the socket', async () => {
    const admin = await createUser(UserRole.SUPERADMIN);
    const customer = await createUser(UserRole.CUSTOMER);

    const address = await dataSource.getRepository(Address).save({
      userId: customer.user.id,
      title: 'E2E Realtime Home',
      city: 'Riyadh',
      street: '1 Test St',
      latitude: 24.7136,
      longitude: 46.6753,
    });

    const menuCategory = await dataSource
      .getRepository(MenuCategory)
      .save({ name: 'E2E Realtime Menu Cat' });
    createdCategoryIds.push(menuCategory.id);
    const menuItem = await dataSource.getRepository(MenuItem).save({
      categoryId: menuCategory.id,
      name: 'E2E Realtime Burger',
      price: 10,
      image: 'img',
      rating: 5,
      prepTimeMinutes: 10,
      available: true,
      dietaryTags: [],
    });
    createdItemIds.push(menuItem.id);

    const client = await connectSocket(customer.token);

    try {
      const received = new Promise<{ id: string; status: string }>(
        (resolve) => {
          client.once('order.updated', (payload) => {
            resolve(payload as { id: string; status: string });
          });
        },
      );

      const res = await request(httpServer)
        .post('/orders')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          customerId: customer.user.id,
          addressId: address.id,
          items: [{ itemId: menuItem.id, quantity: 1 }],
        })
        .expect(201);
      const orderId = res.body.id as string;
      createdOrderIds.push(orderId);

      const payload = await received;
      expect(payload.id).toBe(orderId);
      expect(payload.status).toBe('pending');
      // Socket payloads must not leak credentials.
      expect(JSON.stringify(payload)).not.toContain('passwordHash');
    } finally {
      client.disconnect();
    }
  });
});
