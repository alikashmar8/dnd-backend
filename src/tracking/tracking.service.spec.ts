/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TrackingService } from './tracking.service';
import { Order } from '../orders/entities/order.entity';
import { UserRole } from '../enums/user-role.enum';
import { OrderStatus } from '../enums/order-status.enum';

const mockOrderRepo = () => ({
  findOne: jest.fn(),
});

describe('TrackingService authorization (R5)', () => {
  let service: TrackingService;
  let orderRepo: any;
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        TrackingService,
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue(undefined) },
        },
        { provide: getRepositoryToken(Order), useFactory: mockOrderRepo },
      ],
    }).compile();

    service = module.get<TrackingService>(TrackingService);
    orderRepo = module.get(getRepositoryToken(Order));
  });

  afterEach(async () => {
    await (service as any)?.redis?.disconnect?.();
  });

  it('allows the driver themself', async () => {
    const user = { id: 5, role: UserRole.DRIVER } as any;
    expect(await service.canViewDriverLocation(user, 5)).toBe(true);
  });

  it('allows SUPERADMIN', async () => {
    const user = { id: 1, role: UserRole.SUPERADMIN } as any;
    expect(await service.canViewDriverLocation(user, 5)).toBe(true);
  });

  it('allows DRIVER_HEAD (dispatch)', async () => {
    const user = { id: 2, role: UserRole.DRIVER_HEAD } as any;
    expect(await service.canViewDriverLocation(user, 5)).toBe(true);
  });

  it('denies unrelated staff', async () => {
    const user = { id: 3, role: UserRole.KITCHEN_STAFF } as any;
    expect(await service.canViewDriverLocation(user, 5)).toBe(false);
  });

  it('allows a customer with an active in_route order to that driver', async () => {
    orderRepo.findOne.mockResolvedValue({ id: 'ORD-1' });
    const user = { id: 10, role: UserRole.CUSTOMER } as any;
    expect(await service.canViewDriverLocation(user, 5)).toBe(true);
    expect(orderRepo.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          customerId: 10,
          driverId: 5,
          status: OrderStatus.IN_ROUTE,
        },
      }),
    );
  });

  it('denies a customer without an active order to that driver', async () => {
    orderRepo.findOne.mockResolvedValue(null);
    const user = { id: 11, role: UserRole.CUSTOMER } as any;
    expect(await service.canViewDriverLocation(user, 5)).toBe(false);
  });
});

describe('TrackingService active-delivery guard', () => {
  let service: TrackingService;
  let orderRepo: any;
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        TrackingService,
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue(undefined) },
        },
        { provide: getRepositoryToken(Order), useFactory: mockOrderRepo },
      ],
    }).compile();

    service = module.get<TrackingService>(TrackingService);
    orderRepo = module.get(getRepositoryToken(Order));
  });

  afterEach(async () => {
    await (service as any)?.redis?.disconnect?.();
  });

  it('allows location updates while the driver has an active in_route order', async () => {
    orderRepo.findOne.mockResolvedValue({ id: 'ORD-1', status: 'in_route' });
    expect(await service.hasActiveDelivery(5)).toBe(true);
    expect(orderRepo.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { driverId: 5, status: OrderStatus.IN_ROUTE },
      }),
    );
  });

  it('rejects location updates when the driver has no in_route order', async () => {
    orderRepo.findOne.mockResolvedValue(null);
    expect(await service.hasActiveDelivery(5)).toBe(false);
  });

  it('rejects location updates when only terminal orders exist', async () => {
    // `hasActiveDelivery` only matches in_route, so a delivered/completed/
    // cancelled order (findOne returns null for the in_route query) means no
    // active delivery.
    orderRepo.findOne.mockResolvedValue(null);
    expect(await service.hasActiveDelivery(5)).toBe(false);
  });
});
