/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
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
import { ShopCategory } from './../src/shop-items/entities/shop-category.entity';
import { ShopItem } from './../src/shop-items/entities/shop-item.entity';
import { UserRole } from './../src/enums/user-role.enum';
import { OrderStatus } from './../src/enums/order-status.enum';

describe('Orders — Push Model Order Flow (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

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

    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
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
        await dataSource
          .getRepository(ShopItem)
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
        await dataSource
          .getRepository(ShopCategory)
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

  async function createMixedOrderFixture() {
    const customer = await createUser(UserRole.CUSTOMER);
    const kitchenHead = await createUser(UserRole.KITCHEN_HEAD);
    const warehouseHead = await createUser(UserRole.WAREHOUSE_HEAD);
    const driverHead = await createUser(UserRole.DRIVER_HEAD);
    const kitchenStaff = await createUser(UserRole.KITCHEN_STAFF);
    const warehouseStaff = await createUser(UserRole.WAREHOUSE_STAFF);
    const driver = await createUser(UserRole.DRIVER);

    const menuCategory = await dataSource
      .getRepository(MenuCategory)
      .save({ name: 'E2E Menu Category' });
    createdCategoryIds.push(menuCategory.id);
    const shopCategory = await dataSource
      .getRepository(ShopCategory)
      .save({ name: 'E2E Shop Category' });
    createdCategoryIds.push(shopCategory.id);

    const menuItem = await dataSource.getRepository(MenuItem).save({
      categoryId: menuCategory.id,
      name: 'E2E Burger',
      price: 10,
      image: 'img',
      rating: 5,
      prepTimeMinutes: 10,
      available: true,
      dietaryTags: [],
    });
    createdItemIds.push(menuItem.id);

    const shopItem = await dataSource.getRepository(ShopItem).save({
      categoryId: shopCategory.id,
      name: 'E2E Milk',
      unit: 'gallon',
      price: 4.99,
      image: 'img',
      rating: 5,
      stockQuantity: 50,
      available: true,
      dietaryTags: [],
    });
    createdItemIds.push(shopItem.id);

    const address = await dataSource.getRepository(Address).save({
      userId: customer.user.id,
      title: 'E2E Home',
      city: 'Beirut',
      street: '1 Test St',
      latitude: 33.8938,
      longitude: 35.5018,
    });

    const orderId = `ORD-E2E-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    await dataSource.getRepository(Order).save({
      id: orderId,
      customerId: customer.user.id,
      status: OrderStatus.CONFIRMED,
      addressId: address.id,
      etaMinutes: 40,
      subtotal: 14.99,
      tax: 0.75,
      deliveryFee: 5,
      total: 20.74,
      driverId: null,
    });
    createdOrderIds.push(orderId);

    await dataSource.getRepository(OrderItem).save([
      {
        orderId,
        itemId: menuItem.id.toString(),
        itemType: 'menu',
        name: menuItem.name,
        price: menuItem.price,
        quantity: 1,
        image: menuItem.image,
      },
      {
        orderId,
        itemId: shopItem.id.toString(),
        itemType: 'shop',
        name: shopItem.name,
        price: shopItem.price,
        quantity: 1,
        image: shopItem.image,
      },
    ]);

    return {
      orderId,
      tokens: {
        kitchenHead: kitchenHead.token,
        warehouseHead: warehouseHead.token,
        driverHead: driverHead.token,
        kitchenStaff: kitchenStaff.token,
        warehouseStaff: warehouseStaff.token,
        driver: driver.token,
      },
      users: {
        kitchenStaff: kitchenStaff.user,
        warehouseStaff: warehouseStaff.user,
        driver: driver.user,
      },
    };
  }

  it('should serialize concurrent kitchen + warehouse mark-prepared to WAITING_FOR_PICKUP', async () => {
    const fixture = await createMixedOrderFixture();

    const assignKitchen = await request(app.getHttpServer())
      .patch(`/orders/${fixture.orderId}/assign-kitchen`)
      .set('Authorization', `Bearer ${fixture.tokens.kitchenHead}`)
      .send({ staffId: fixture.users.kitchenStaff.id.toString() })
      .expect(200);
    expect(assignKitchen.body.status).toBe(OrderStatus.PREPARING);

    const assignWarehouse = await request(app.getHttpServer())
      .patch(`/orders/${fixture.orderId}/assign-warehouse`)
      .set('Authorization', `Bearer ${fixture.tokens.warehouseHead}`)
      .send({ staffId: fixture.users.warehouseStaff.id.toString() })
      .expect(200);
    expect(assignWarehouse.body.status).toBe(OrderStatus.PREPARING);

    const [kitchenRes, warehouseRes] = await Promise.all([
      request(app.getHttpServer())
        .patch(`/orders/${fixture.orderId}/mark-prepared`)
        .set('Authorization', `Bearer ${fixture.tokens.kitchenStaff}`),
      request(app.getHttpServer())
        .patch(`/orders/${fixture.orderId}/mark-prepared`)
        .set('Authorization', `Bearer ${fixture.tokens.warehouseStaff}`),
    ]);

    expect(kitchenRes.status).toBe(200);
    expect(warehouseRes.status).toBe(200);

    const updated = await dataSource
      .getRepository(Order)
      .findOneBy({ id: fixture.orderId });
    expect(updated?.status).toBe(OrderStatus.WAITING_FOR_PICKUP);
    expect(updated?.kitchenPreparedAt).not.toBeNull();
    expect(updated?.warehousePreparedAt).not.toBeNull();
  });

  it('should expose only assigned tasks to staff via assignedToMe', async () => {
    const fixture = await createMixedOrderFixture();

    await request(app.getHttpServer())
      .patch(`/orders/${fixture.orderId}/assign-kitchen`)
      .set('Authorization', `Bearer ${fixture.tokens.kitchenHead}`)
      .send({ staffId: fixture.users.kitchenStaff.id.toString() })
      .expect(200);

    const res = await request(app.getHttpServer())
      .get('/orders')
      .query({ assignedToMe: 'true', status: OrderStatus.PREPARING })
      .set('Authorization', `Bearer ${fixture.tokens.kitchenStaff}`)
      .expect(200);

    expect(Array.isArray(res.body.items)).toBe(true);
    const ids = res.body.items.map((o: Order) => o.id);
    expect(ids).toContain(fixture.orderId);
  });

  it('should reject KITCHEN_STAFF from assign-kitchen with 403', async () => {
    const fixture = await createMixedOrderFixture();

    await request(app.getHttpServer())
      .patch(`/orders/${fixture.orderId}/assign-kitchen`)
      .set('Authorization', `Bearer ${fixture.tokens.kitchenStaff}`)
      .send({ staffId: fixture.users.kitchenStaff.id.toString() })
      .expect(403);
  });

  it('should reject KITCHEN_HEAD from assign-warehouse with 403', async () => {
    const fixture = await createMixedOrderFixture();

    await request(app.getHttpServer())
      .patch(`/orders/${fixture.orderId}/assign-warehouse`)
      .set('Authorization', `Bearer ${fixture.tokens.kitchenHead}`)
      .send({ staffId: fixture.users.warehouseStaff.id.toString() })
      .expect(403);
  });

  it('should allow DRIVER_HEAD to assign a driver and validate the DRIVER role', async () => {
    const fixture = await createMixedOrderFixture();

    const res = await request(app.getHttpServer())
      .patch(`/orders/${fixture.orderId}/assign-driver`)
      .set('Authorization', `Bearer ${fixture.tokens.driverHead}`)
      .send({ driverId: fixture.users.driver.id.toString() })
      .expect(200);

    expect(res.body.driverId).toBe(fixture.users.driver.id);
    expect(res.body.driverAssignedAt).not.toBeNull();

    await request(app.getHttpServer())
      .patch(`/orders/${fixture.orderId}/assign-driver`)
      .set('Authorization', `Bearer ${fixture.tokens.driverHead}`)
      .send({ driverId: fixture.users.kitchenStaff.id.toString() })
      .expect(400);
  });
});
