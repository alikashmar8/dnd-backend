/* eslint-disable @typescript-eslint/no-unsafe-member-access */
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
import { OrderStatus } from './../src/enums/order-status.enum';
import { UserRole } from './../src/enums/user-role.enum';
import { TrackingService } from './../src/tracking/tracking.service';

interface DriverLocationPayload {
  driverId: number;
  latitude: number;
  longitude: number;
  updatedAt: string;
}

describe('Driver Live Location Tracking (e2e)', () => {
  jest.setTimeout(30000);

  let app: INestApplication<App>;
  let dataSource: DataSource;
  let httpServer: any;
  let baseUrl: string;
  let trackingService: TrackingService;

  const createdOrderIds: string[] = [];
  const createdUserIds: number[] = [];
  const createdCategoryIds: number[] = [];
  const createdItemIds: number[] = [];
  const createdDriverIds: number[] = [];

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

    await app.listen(0);
    const server = app.getHttpServer() as HttpServer;
    const address = server.address();
    const port = (address as { port: number }).port;
    baseUrl = `http://127.0.0.1:${port}`;
    httpServer = app.getHttpServer();

    dataSource = app.get(DataSource);
    trackingService = app.get(TrackingService);
  });

  afterAll(async () => {
    for (const driverId of createdDriverIds) {
      try {
        await trackingService.removeLocation(driverId);
      } catch {
        // Redis may already be down during teardown; best-effort only.
      }
    }
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
    if (role === UserRole.DRIVER) createdDriverIds.push(user.id);

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

  async function createAddress(userId: number): Promise<Address> {
    return await dataSource.getRepository(Address).save({
      userId,
      title: 'E2E Tracking Home',
      city: 'Riyadh',
      street: '1 Tracking St',
      latitude: 24.7136,
      longitude: 46.6753,
    });
  }

  async function createOrderDirect(
    customerId: number,
    driverId: number,
    status: OrderStatus,
    addressId: number,
  ): Promise<string> {
    const orderId = `ORD-TRK-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await dataSource.getRepository(Order).save({
      id: orderId,
      customerId,
      driverId,
      status,
      addressId,
      etaMinutes: 40,
      subtotal: 10,
      tax: 1,
      deliveryFee: 2,
      total: 13,
      deliveryTitle: 'E2E Tracking Home',
      deliveryCity: 'Riyadh',
      deliveryStreet: '1 Tracking St',
      deliveryLatitude: 24.7136,
      deliveryLongitude: 46.6753,
    });
    createdOrderIds.push(orderId);
    return orderId;
  }

  function connectTrackingSocket(token: string): Promise<Socket> {
    return new Promise((resolve, reject) => {
      const socket = io(`${baseUrl}/tracking`, {
        transports: ['websocket'],
        auth: { token },
        reconnection: false,
      });
      socket.on('connect', () => {
        // The gateway's `handleConnection` resolves auth + joins rooms
        // asynchronously; `connected` is the ack that it is done, so events
        // emitted after this point always see `client.data.user`.
        socket.once('connected', () => resolve(socket));
      });
      socket.on('connect_error', reject);
    });
  }

  function waitFor<T>(socket: Socket, event: string): Promise<T> {
    return new Promise((resolve) =>
      socket.once(event, (payload: T) => resolve(payload)),
    );
  }

  it('accepts a valid location update from the assigned driver during active delivery', async () => {
    const driver = await createUser(UserRole.DRIVER);
    const customer = await createUser(UserRole.CUSTOMER);
    const address = await createAddress(customer.user.id);
    await createOrderDirect(
      customer.user.id,
      driver.user.id,
      OrderStatus.IN_ROUTE,
      address.id,
    );

    await request(httpServer)
      .patch('/driver/location')
      .set('Authorization', `Bearer ${driver.token}`)
      .send({ latitude: 24.7, longitude: 46.6 })
      .expect(200);

    const res = await request(httpServer)
      .get(`/drivers/${driver.user.id}/location`)
      .set('Authorization', `Bearer ${driver.token}`)
      .expect(200);

    expect(Number(res.body.latitude)).toBeCloseTo(24.7, 6);
    expect(Number(res.body.longitude)).toBeCloseTo(46.6, 6);
    expect(res.body.driverId).toBe(driver.user.id);
    expect(new Date(res.body.updatedAt).getTime()).toBeGreaterThan(0);
  });

  it('rejects a driver who has no active in_route order', async () => {
    const driver = await createUser(UserRole.DRIVER);

    const res = await request(httpServer)
      .patch('/driver/location')
      .set('Authorization', `Bearer ${driver.token}`)
      .send({ latitude: 24.7, longitude: 46.6 });

    expect(res.status).toBe(400);
  });

  it('rejects location updates once the order reaches a terminal state', async () => {
    for (const status of [
      OrderStatus.DELIVERED,
      OrderStatus.COMPLETED,
      OrderStatus.CANCELLED,
    ]) {
      const driver = await createUser(UserRole.DRIVER);
      const customer = await createUser(UserRole.CUSTOMER);
      const address = await createAddress(customer.user.id);
      await createOrderDirect(
        customer.user.id,
        driver.user.id,
        status,
        address.id,
      );

      const res = await request(httpServer)
        .patch('/driver/location')
        .set('Authorization', `Bearer ${driver.token}`)
        .send({ latitude: 24.7, longitude: 46.6 });

      expect(res.status).toBe(400);
    }
  });

  it('rejects invalid and impossible coordinates', async () => {
    const driver = await createUser(UserRole.DRIVER);
    const customer = await createUser(UserRole.CUSTOMER);
    const address = await createAddress(customer.user.id);
    await createOrderDirect(
      customer.user.id,
      driver.user.id,
      OrderStatus.IN_ROUTE,
      address.id,
    );

    const invalidPayloads = [
      { latitude: 91, longitude: 46.6 },
      { latitude: -91, longitude: 46.6 },
      { latitude: 24.7, longitude: 181 },
      { latitude: 24.7, longitude: -181 },
      { latitude: 'not-a-number', longitude: 46.6 },
      { latitude: NaN, longitude: 46.6 },
      { latitude: Infinity, longitude: 46.6 },
      { latitude: 24.7, longitude: NaN },
    ];

    for (const payload of invalidPayloads) {
      await request(httpServer)
        .patch('/driver/location')
        .set('Authorization', `Bearer ${driver.token}`)
        .send(payload)
        .expect(400);
    }

    // Nothing was stored for the driver.
    await request(httpServer)
      .get(`/drivers/${driver.user.id}/location`)
      .set('Authorization', `Bearer ${driver.token}`)
      .expect(404);
  });

  it('does not allow a different driver to update into an active delivery', async () => {
    const driverA = await createUser(UserRole.DRIVER);
    const driverB = await createUser(UserRole.DRIVER);
    const customer = await createUser(UserRole.CUSTOMER);
    const address = await createAddress(customer.user.id);
    await createOrderDirect(
      customer.user.id,
      driverA.user.id,
      OrderStatus.IN_ROUTE,
      address.id,
    );

    // Driver B has no active delivery → rejected (cannot push into A's order).
    await request(httpServer)
      .patch('/driver/location')
      .set('Authorization', `Bearer ${driverB.token}`)
      .send({ latitude: 25.0, longitude: 47.0 })
      .expect(400);

    // Driver A publishes their own position.
    await request(httpServer)
      .patch('/driver/location')
      .set('Authorization', `Bearer ${driverA.token}`)
      .send({ latitude: 24.7, longitude: 46.6 })
      .expect(200);

    // Driver A's location is intact and was never overwritten by B.
    const res = await request(httpServer)
      .get(`/drivers/${driverA.user.id}/location`)
      .set('Authorization', `Bearer ${driverA.token}`)
      .expect(200);
    expect(Number(res.body.latitude)).toBeCloseTo(24.7, 6);

    // Driver B has no location stored at all.
    await request(httpServer)
      .get(`/drivers/${driverB.user.id}/location`)
      .set('Authorization', `Bearer ${driverB.token}`)
      .expect(404);
  });

  it('isolates customers: A can view the driver, B cannot', async () => {
    const driver = await createUser(UserRole.DRIVER);
    const customerA = await createUser(UserRole.CUSTOMER);
    const customerB = await createUser(UserRole.CUSTOMER);
    const address = await createAddress(customerA.user.id);
    await createOrderDirect(
      customerA.user.id,
      driver.user.id,
      OrderStatus.IN_ROUTE,
      address.id,
    );

    await request(httpServer)
      .patch('/driver/location')
      .set('Authorization', `Bearer ${driver.token}`)
      .send({ latitude: 24.8, longitude: 46.8 })
      .expect(200);

    // Customer A (owns the active order) can read the location.
    const ok = await request(httpServer)
      .get(`/drivers/${driver.user.id}/location`)
      .set('Authorization', `Bearer ${customerA.token}`)
      .expect(200);
    expect(Number(ok.body.latitude)).toBeCloseTo(24.8, 6);

    // Customer B (no active order with this driver) is forbidden.
    await request(httpServer)
      .get(`/drivers/${driver.user.id}/location`)
      .set('Authorization', `Bearer ${customerB.token}`)
      .expect(403);

    // Customer B cannot subscribe to the driver's tracking room.
    const client = await connectTrackingSocket(customerB.token);
    try {
      const error = waitFor<string>(client, 'error');
      client.emit('subscribe:driver', { driverId: driver.user.id });
      expect(await error).toBe('Not allowed to subscribe to this driver');
    } finally {
      client.disconnect();
    }
  });

  it('blocks unauthenticated and unauthorized access to tracking data', async () => {
    const driver = await createUser(UserRole.DRIVER);
    const kitchenStaff = await createUser(UserRole.KITCHEN_STAFF);
    const customer = await createUser(UserRole.CUSTOMER);
    const address = await createAddress(customer.user.id);
    await createOrderDirect(
      customer.user.id,
      driver.user.id,
      OrderStatus.IN_ROUTE,
      address.id,
    );

    await request(httpServer)
      .get(`/drivers/${driver.user.id}/location`)
      .expect(401);

    await request(httpServer)
      .patch('/driver/location')
      .set('Authorization', `Bearer ${kitchenStaff.token}`)
      .send({ latitude: 24.7, longitude: 46.6 })
      .expect(403);

    await request(httpServer)
      .get(`/drivers/${driver.user.id}/location`)
      .set('Authorization', `Bearer ${kitchenStaff.token}`)
      .expect(403);
  });

  it('does not leak the driver live location through order APIs', async () => {
    const driver = await createUser(UserRole.DRIVER);
    const customer = await createUser(UserRole.CUSTOMER);
    const admin = await createUser(UserRole.SUPERADMIN);
    const address = await createAddress(customer.user.id);
    const orderId = await createOrderDirect(
      customer.user.id,
      driver.user.id,
      OrderStatus.IN_ROUTE,
      address.id,
    );

    await request(httpServer)
      .patch('/driver/location')
      .set('Authorization', `Bearer ${driver.token}`)
      .send({ latitude: 25.1234, longitude: 47.5678 })
      .expect(200);

    const res = await request(httpServer)
      .get(`/orders/${orderId}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200);

    const body = JSON.stringify(res.body);
    expect(body).not.toContain('25.1234');
    expect(body).not.toContain('47.5678');
  });

  it('delivers the same location payload in realtime to customer and admin', async () => {
    const driver = await createUser(UserRole.DRIVER);
    const customer = await createUser(UserRole.CUSTOMER);
    const admin = await createUser(UserRole.SUPERADMIN);
    const address = await createAddress(customer.user.id);
    await createOrderDirect(
      customer.user.id,
      driver.user.id,
      OrderStatus.IN_ROUTE,
      address.id,
    );

    const driverSocket = await connectTrackingSocket(driver.token);
    const customerSocket = await connectTrackingSocket(customer.token);
    const adminSocket = await connectTrackingSocket(admin.token);

    try {
      const customerSubscribed = waitFor<{ driverId: number }>(
        customerSocket,
        'subscribed',
      );
      customerSocket.emit('subscribe:driver', { driverId: driver.user.id });
      expect((await customerSubscribed).driverId).toBe(driver.user.id);

      const adminSubscribed = waitFor<{ driverId: number }>(
        adminSocket,
        'subscribed',
      );
      adminSocket.emit('subscribe:driver', { driverId: driver.user.id });
      expect((await adminSubscribed).driverId).toBe(driver.user.id);

      const customerBroadcast = waitFor<DriverLocationPayload>(
        customerSocket,
        'driver:location:broadcast',
      );
      const adminBroadcast = waitFor<DriverLocationPayload>(
        adminSocket,
        'driver:location:broadcast',
      );

      driverSocket.emit('driver:location:update', {
        latitude: 24.95,
        longitude: 46.85,
      });

      const fromCustomer = await customerBroadcast;
      const fromAdmin = await adminBroadcast;

      expect(fromCustomer.driverId).toBe(driver.user.id);
      expect(fromAdmin.driverId).toBe(driver.user.id);
      // Both consumers receive the exact same authoritative location.
      expect(fromCustomer.latitude).toBe(fromAdmin.latitude);
      expect(fromCustomer.longitude).toBe(fromAdmin.longitude);
      expect(fromCustomer.latitude).toBe(24.95);
      expect(fromCustomer.longitude).toBe(46.85);
      expect(fromCustomer.updatedAt).toBe(fromAdmin.updatedAt);

      // Latest location is retrievable immediately afterwards (initial state
      // for a client that opens the page after the driver is already moving).
      const latest = await request(httpServer)
        .get(`/drivers/${driver.user.id}/location`)
        .set('Authorization', `Bearer ${customer.token}`)
        .expect(200);
      expect(Number(latest.body.latitude)).toBeCloseTo(24.95, 6);
      expect(Number(latest.body.longitude)).toBeCloseTo(46.85, 6);
    } finally {
      driverSocket.disconnect();
      customerSocket.disconnect();
      adminSocket.disconnect();
    }
  });

  it('rejects a socket location update when the driver has no active delivery', async () => {
    const driver = await createUser(UserRole.DRIVER);

    const driverSocket = await connectTrackingSocket(driver.token);
    try {
      const error = waitFor<string>(driverSocket, 'error');
      driverSocket.emit('driver:location:update', {
        latitude: 24.7,
        longitude: 46.6,
      });
      expect(await error).toBe('No active delivery in progress');
    } finally {
      driverSocket.disconnect();
    }
  });

  it('does not store invalid coordinates sent over the socket', async () => {
    const driver = await createUser(UserRole.DRIVER);
    const customer = await createUser(UserRole.CUSTOMER);
    const address = await createAddress(customer.user.id);
    await createOrderDirect(
      customer.user.id,
      driver.user.id,
      OrderStatus.IN_ROUTE,
      address.id,
    );

    const driverSocket = await connectTrackingSocket(driver.token);
    try {
      // Out-of-range coords fail the DTO validation in the gateway pipe.
      driverSocket.emit('driver:location:update', {
        latitude: 999,
        longitude: 46.6,
      });
      // Give the (rejected) handler time to run, then confirm nothing stored.
      await new Promise((r) => setTimeout(r, 300));
    } finally {
      driverSocket.disconnect();
    }

    await request(httpServer)
      .get(`/drivers/${driver.user.id}/location`)
      .set('Authorization', `Bearer ${driver.token}`)
      .expect(404);
  });
});
