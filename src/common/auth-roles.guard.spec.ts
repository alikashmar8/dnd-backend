import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
  UnauthorizedException,
} from '@nestjs/common';
import request from 'supertest';
import { Reflector } from '@nestjs/core';
import { AuthController } from '../auth/auth.controller';
import { CartController } from '../cart/cart.controller';
import { OrdersController } from '../orders/orders.controller';
import { AuthGuard } from './guards/auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { AuthService } from '../auth/auth.service';
import { OrdersService } from '../orders/orders.service';
import { CartService } from '../cart/cart.service';
import { UserRole } from '../enums/user-role.enum';
import { TrackingService } from '../tracking/tracking.service';

const mockAuthService = {
  validateUserByToken: jest.fn((token: string) => {
    if (token === 'customer-token') {
      return Promise.resolve({ id: 1, role: UserRole.CUSTOMER });
    }
    if (token === 'driver-token') {
      return Promise.resolve({ id: 2, role: UserRole.DRIVER });
    }
    throw new UnauthorizedException('Invalid or expired token');
  }),
  logout: jest.fn(() => Promise.resolve()),
  register: jest.fn(() => Promise.resolve({ access_token: 'new-token' })),
  login: jest.fn(() => Promise.resolve({ access_token: 'login-token' })),
};

const mockOrdersService = {
  findAllForUser: jest.fn(() => Promise.resolve([{ id: 'order-1' }])),
  findOneForUser: jest.fn(() => Promise.resolve({ id: 'order-1' })),
  create: jest.fn(() => Promise.resolve({ id: 'order-1' })),
};

const mockCartService = {
  getActiveCart: jest.fn(() => Promise.resolve({ id: 1, active: true })),
  listCartItems: jest.fn(() => Promise.resolve([{ id: 1 }])),
  addItemToCart: jest.fn(() => Promise.resolve({ id: 1 })),
  updateCartItem: jest.fn(() => Promise.resolve({ id: 1 })),
  removeCartItem: jest.fn(() => Promise.resolve()),
  clearCart: jest.fn(() => Promise.resolve()),
  checkoutCart: jest.fn(() => Promise.resolve({ id: 1 })),
};

const mockTrackingService = {
  updateLocation: jest.fn(() => Promise.resolve()),
  getLocation: jest.fn(() => Promise.resolve(null)),
  getLocationByOrder: jest.fn(() => Promise.resolve(null)),
  removeLocation: jest.fn(() => Promise.resolve()),
};

describe('Guard enforcement', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController, OrdersController, CartController],
      providers: [
        AuthGuard,
        RolesGuard,
        Reflector,
        { provide: AuthService, useValue: mockAuthService },
        { provide: OrdersService, useValue: mockOrdersService },
        { provide: CartService, useValue: mockCartService },
        { provide: TrackingService, useValue: mockTrackingService },
      ],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    jest.clearAllMocks();
  });

  it('should deny logout without an authorization header', async () => {
    await request(app.getHttpServer()).post('/auth/logout').expect(401);
  });

  it('should allow logout with a valid token', async () => {
    await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Authorization', 'Bearer customer-token')
      .expect(200)
      .expect({ message: 'Logged out successfully' });
  });

  it('should deny access to orders for unauthenticated users', async () => {
    await request(app.getHttpServer()).get('/orders').expect(401);
  });

  it('should allow access to orders for any authenticated role', async () => {
    await request(app.getHttpServer())
      .get('/orders')
      .set('Authorization', 'Bearer driver-token')
      .expect(200);
  });

  it('should allow access to orders for authenticated customers', async () => {
    await request(app.getHttpServer())
      .get('/orders')
      .set('Authorization', 'Bearer customer-token')
      .expect(200)
      .expect([{ id: 'order-1' }]);
  });

  it('should deny access to carts for the wrong role', async () => {
    await request(app.getHttpServer())
      .get('/carts/active')
      .set('Authorization', 'Bearer driver-token')
      .expect(403);
  });

  it('should allow access to carts for authenticated customers', async () => {
    await request(app.getHttpServer())
      .get('/carts/active')
      .set('Authorization', 'Bearer customer-token')
      .expect(200)
      .expect({ id: 1, active: true });
  });
});
