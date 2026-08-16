/* eslint-disable @typescript-eslint/no-unsafe-member-access */
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

describe('Security & Integrity (e2e)', () => {
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

  async function createAddress(userId: number): Promise<Address> {
    return await dataSource.getRepository(Address).save({
      userId,
      title: 'E2E Home',
      city: 'Riyadh',
      street: '1 Test St',
      description: 'Apartment 12',
      latitude: 24.7136,
      longitude: 46.6753,
    });
  }

  async function createMenuItem(): Promise<MenuItem> {
    const menuCategory = await dataSource
      .getRepository(MenuCategory)
      .save({ name: 'E2E Security Menu Cat' });
    createdCategoryIds.push(menuCategory.id);
    const menuItem = await dataSource.getRepository(MenuItem).save({
      categoryId: menuCategory.id,
      name: 'E2E Security Burger',
      nameAr: 'برجر الأمان',
      price: 10,
      image: 'img',
      rating: 5,
      prepTimeMinutes: 10,
      available: true,
      dietaryTags: [],
    });
    createdItemIds.push(menuItem.id);
    return menuItem;
  }

  async function createShopItem(stockQuantity: number): Promise<ShopItem> {
    const shopCategory = await dataSource
      .getRepository(ShopCategory)
      .save({ name: 'E2E Security Shop Cat' });
    createdCategoryIds.push(shopCategory.id);
    const shopItem = await dataSource.getRepository(ShopItem).save({
      categoryId: shopCategory.id,
      name: 'E2E Security Cola',
      nameAr: 'كولا الأمان',
      unit: 'can',
      price: 5,
      image: 'img',
      rating: 5,
      stockQuantity,
      available: true,
      dietaryTags: [],
    });
    createdItemIds.push(shopItem.id);
    return shopItem;
  }

  it('should require authentication for signed URLs and reject bad uploads', async () => {
    await request(app.getHttpServer())
      .get('/files/some-key/signed-url')
      .expect(401);

    await request(app.getHttpServer())
      .post('/files/signed-urls')
      .send({ keys: ['uploads/a.png'] })
      .expect(401);

    const admin = await createUser(UserRole.SUPERADMIN);
    await request(app.getHttpServer())
      .post('/upload')
      .set('Authorization', `Bearer ${admin.token}`)
      .attach('file', Buffer.from('not an image'), {
        filename: 'payload.txt',
        contentType: 'text/plain',
      })
      .expect(400);
  });

  it('should throttle brute-force login attempts (limit 5 / 60s)', async () => {
    const phone = `+1555${Math.floor(100000000 + Math.random() * 899999999)}`;

    let lastStatus = 0;
    for (let i = 0; i < 6; i++) {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ phone, password: 'wrong-password' });
      lastStatus = res.status;
    }

    expect(lastStatus).toBe(429);
  });

  it('should reject price/total injection and invalid quantities in order create', async () => {
    const admin = await createUser(UserRole.SUPERADMIN);
    const customer = await createUser(UserRole.CUSTOMER);
    const address = await createAddress(customer.user.id);
    const menuItem = await createMenuItem();

    await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        customerId: customer.user.id,
        addressId: address.id,
        items: [{ itemId: menuItem.id, quantity: 1, price: 0.01 }],
      })
      .expect(400);

    await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        customerId: customer.user.id,
        addressId: address.id,
        items: [{ itemId: menuItem.id, quantity: 0 }],
        total: 0,
      })
      .expect(400);

    await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        customerId: customer.user.id,
        addressId: address.id,
        items: [{ itemId: menuItem.id, quantity: 1, itemType: 'script' }],
      })
      .expect(400);
  });

  it('should snapshot the delivery address and preserve Arabic names on created orders', async () => {
    const admin = await createUser(UserRole.SUPERADMIN);
    const customer = await createUser(UserRole.CUSTOMER);
    const address = await createAddress(customer.user.id);
    const menuItem = await createMenuItem();

    const res = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        customerId: customer.user.id,
        addressId: address.id,
        items: [{ itemId: menuItem.id, quantity: 2 }],
      })
      .expect(201);

    const orderId = res.body.id as string;
    createdOrderIds.push(orderId);

    expect(res.body.id).toMatch(/^ORD-\d{8}-[A-Z0-9]{6}$/);
    expect(res.body.deliveryTitle).toBe('E2E Home');
    expect(res.body.deliveryCity).toBe('Riyadh');
    expect(res.body.deliveryStreet).toBe('1 Test St');
    expect(res.body.deliveryDescription).toBe('Apartment 12');
    expect(Number(res.body.deliveryLatitude)).toBeCloseTo(24.7136, 4);
    expect(Number(res.body.deliveryLongitude)).toBeCloseTo(46.6753, 4);
    expect(res.body.items[0].nameAr).toBe('برجر الأمان');
  });

  it('should prevent a customer from viewing another customer order', async () => {
    const admin = await createUser(UserRole.SUPERADMIN);
    const customerA = await createUser(UserRole.CUSTOMER);
    const customerB = await createUser(UserRole.CUSTOMER);
    const address = await createAddress(customerA.user.id);
    const menuItem = await createMenuItem();

    const createRes = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        customerId: customerA.user.id,
        addressId: address.id,
        items: [{ itemId: menuItem.id, quantity: 1 }],
      })
      .expect(201);
    const orderId = createRes.body.id as string;
    createdOrderIds.push(orderId);

    await request(app.getHttpServer())
      .get(`/orders/${orderId}`)
      .set('Authorization', `Bearer ${customerB.token}`)
      .expect(404);

    await request(app.getHttpServer())
      .patch(`/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${customerB.token}`)
      .send({ status: 'cancelled' })
      .expect(403);
  });

  it('should serialize concurrent checkouts on the last unit of stock', async () => {
    const shopItem = await createShopItem(1);
    const customerA = await createUser(UserRole.CUSTOMER);
    const customerB = await createUser(UserRole.CUSTOMER);
    const addressA = await createAddress(customerA.user.id);
    const addressB = await createAddress(customerB.user.id);

    for (const customer of [customerA, customerB]) {
      await request(app.getHttpServer())
        .post('/carts/items')
        .set('Authorization', `Bearer ${customer.token}`)
        .send({ itemId: shopItem.id, itemType: 'shop', quantity: 1 })
        .expect(201);
    }

    const [resA, resB] = await Promise.all([
      request(app.getHttpServer())
        .post('/carts/checkout')
        .set('Authorization', `Bearer ${customerA.token}`)
        .send({ addressId: addressA.id }),
      request(app.getHttpServer())
        .post('/carts/checkout')
        .set('Authorization', `Bearer ${customerB.token}`)
        .send({ addressId: addressB.id }),
    ]);

    const statuses = [resA.status, resB.status].sort();
    expect(statuses).toEqual([201, 400]);

    const winner = resA.status === 201 ? resA : resB;
    if (winner.body?.id) {
      createdOrderIds.push(winner.body.id as string);
    }

    const remaining = await dataSource
      .getRepository(ShopItem)
      .findOneBy({ id: shopItem.id });
    expect(remaining?.stockQuantity).toBe(0);
  });
});
