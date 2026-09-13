/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import request from 'supertest';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { AuthGuard } from '../common/guards/auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthService } from '../auth/auth.service';
import { UserRole } from '../enums/user-role.enum';

const mockAuthService = {
  validateUserByToken: jest.fn((token: string) => {
    if (token === 'superadmin-token') {
      return Promise.resolve({ id: 1, role: UserRole.SUPERADMIN });
    }
    if (token === 'customer-token') {
      return Promise.resolve({ id: 2, role: UserRole.CUSTOMER });
    }
    throw new Error('Invalid or expired token');
  }),
};

const mockAnalyticsService = {
  getOverview: jest.fn(() => Promise.resolve({ totals: {} })),
  getOrderReports: jest.fn(() =>
    Promise.resolve({
      summary: { completedOrders: 1 },
      series: [],
      topItems: { items: [], total: 0, skip: 0, take: 20 },
      dateRange: {},
    }),
  ),
};

describe('AnalyticsController (reports)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AnalyticsController],
      providers: [
        AuthGuard,
        RolesGuard,
        Reflector,
        { provide: AuthService, useValue: mockAuthService },
        { provide: AnalyticsService, useValue: mockAnalyticsService },
      ],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    jest.clearAllMocks();
  });

  const validQuery = 'startDate=2026-07-01&endDate=2026-07-31';

  it('should require authentication', async () => {
    await request(app.getHttpServer())
      .get(`/analytics/reports/orders?${validQuery}`)
      .expect(401);
  });

  it('should deny non-superadmin roles', async () => {
    await request(app.getHttpServer())
      .get(`/analytics/reports/orders?${validQuery}`)
      .set('Authorization', 'Bearer customer-token')
      .expect(403);
  });

  it('should allow a SUPERADMIN with a valid date range', async () => {
    await request(app.getHttpServer())
      .get(`/analytics/reports/orders?${validQuery}`)
      .set('Authorization', 'Bearer superadmin-token')
      .expect(200)
      .expect((res) => {
        expect(mockAnalyticsService.getOrderReports).toHaveBeenCalledWith(
          expect.objectContaining({
            startDate: '2026-07-01',
            endDate: '2026-07-31',
            take: 20,
            skip: 0,
          }),
        );
        expect(res.body.summary.completedOrders).toBe(1);
      });
  });

  it('should reject a malformed start date', async () => {
    await request(app.getHttpServer())
      .get('/analytics/reports/orders?startDate=07/01/2026&endDate=2026-07-31')
      .set('Authorization', 'Bearer superadmin-token')
      .expect(400);
  });

  it('should reject missing end date', async () => {
    await request(app.getHttpServer())
      .get('/analytics/reports/orders?startDate=2026-07-01')
      .set('Authorization', 'Bearer superadmin-token')
      .expect(400);
  });

  it('should reject take above the maximum page size', async () => {
    await request(app.getHttpServer())
      .get(`/analytics/reports/orders?${validQuery}&take=1000000`)
      .set('Authorization', 'Bearer superadmin-token')
      .expect(400);
  });

  it('should reject negative skip', async () => {
    await request(app.getHttpServer())
      .get(`/analytics/reports/orders?${validQuery}&skip=-5`)
      .set('Authorization', 'Bearer superadmin-token')
      .expect(400);
  });

  it('should reject unknown query parameters', async () => {
    await request(app.getHttpServer())
      .get(`/analytics/reports/orders?${validQuery}&order=status`)
      .set('Authorization', 'Bearer superadmin-token')
      .expect(400);
  });
});
