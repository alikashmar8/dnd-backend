/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument */
import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from '../auth/auth.service';
import { UserRole } from '../enums/user-role.enum';
import { TrackingGateway } from './tracking.gateway';
import { TrackingService } from './tracking.service';

function mockSocket(user?: { id: number; role: UserRole }) {
  const emit = jest.fn();
  const to = jest.fn().mockReturnValue({ emit });
  return {
    data: { user },
    emit,
    join: jest.fn().mockResolvedValue(undefined),
    leave: jest.fn(),
    to,
    disconnect: jest.fn(),
    handshake: { auth: {} },
  } as any;
}

describe('TrackingGateway', () => {
  let gateway: TrackingGateway;
  let trackingService: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrackingGateway,
        {
          provide: AuthService,
          useValue: { validateUserByToken: jest.fn() },
        },
        {
          provide: TrackingService,
          useValue: {
            updateLocation: jest.fn(),
            hasActiveDelivery: jest.fn(),
            canViewDriverLocation: jest.fn(),
          },
        },
      ],
    }).compile();

    gateway = module.get<TrackingGateway>(TrackingGateway);
    trackingService = module.get(TrackingService);
  });

  describe('driver:location:update', () => {
    it('rejects a socket with no authenticated user', async () => {
      const client = mockSocket(undefined);
      await gateway.handleLocationUpdate(client, {
        latitude: 24,
        longitude: 46,
      });
      expect(client.emit).toHaveBeenCalledWith('error', 'Unauthorized');
      expect(trackingService.updateLocation).not.toHaveBeenCalled();
    });

    it('rejects a non-driver publishing a location', async () => {
      const client = mockSocket({ id: 2, role: UserRole.CUSTOMER });
      await gateway.handleLocationUpdate(client, {
        latitude: 24,
        longitude: 46,
      });
      expect(client.emit).toHaveBeenCalledWith(
        'error',
        'Only drivers can update their location',
      );
      expect(trackingService.updateLocation).not.toHaveBeenCalled();
    });

    it('rejects a driver with no active delivery', async () => {
      const client = mockSocket({ id: 5, role: UserRole.DRIVER });
      trackingService.hasActiveDelivery.mockResolvedValue(false);
      await gateway.handleLocationUpdate(client, {
        latitude: 24,
        longitude: 46,
      });
      expect(client.emit).toHaveBeenCalledWith(
        'error',
        'No active delivery in progress',
      );
      expect(trackingService.updateLocation).not.toHaveBeenCalled();
    });

    it('stores and broadcasts a valid location using the authenticated identity', async () => {
      const client = mockSocket({ id: 5, role: UserRole.DRIVER });
      trackingService.hasActiveDelivery.mockResolvedValue(true);
      trackingService.updateLocation.mockResolvedValue(undefined);

      await gateway.handleLocationUpdate(client, {
        latitude: 24.7,
        longitude: 46.6,
      });

      // Self-scoped: never trusts a client-supplied driverId.
      expect(trackingService.updateLocation).toHaveBeenCalledWith(
        5,
        24.7,
        46.6,
      );
      expect(client.to).toHaveBeenCalledWith('user_5');
      expect(client.emit).toHaveBeenCalledWith(
        'driver:location:broadcast',
        expect.objectContaining({
          driverId: 5,
          latitude: 24.7,
          longitude: 46.6,
          updatedAt: expect.any(String),
        }),
      );
    });
  });

  describe('subscribe:driver', () => {
    it('rejects a socket with no authenticated user', async () => {
      const client = mockSocket(undefined);
      await gateway.handleSubscribeDriver(client, { driverId: 5 });
      expect(client.emit).toHaveBeenCalledWith('error', 'Unauthorized');
      expect(client.join).not.toHaveBeenCalled();
    });

    it('rejects a caller not authorized to view the driver', async () => {
      const client = mockSocket({ id: 11, role: UserRole.CUSTOMER });
      trackingService.canViewDriverLocation.mockResolvedValue(false);
      await gateway.handleSubscribeDriver(client, { driverId: 5 });
      expect(client.emit).toHaveBeenCalledWith(
        'error',
        'Not allowed to subscribe to this driver',
      );
      expect(client.join).not.toHaveBeenCalled();
    });

    it('joins the driver room for an authorized caller', async () => {
      const client = mockSocket({ id: 10, role: UserRole.CUSTOMER });
      trackingService.canViewDriverLocation.mockResolvedValue(true);
      await gateway.handleSubscribeDriver(client, { driverId: 5 });
      expect(client.join).toHaveBeenCalledWith('user_5');
      expect(client.emit).toHaveBeenCalledWith('subscribed', { driverId: 5 });
    });
  });

  describe('unsubscribe:driver', () => {
    it('leaves the driver room', () => {
      const client = mockSocket({ id: 10, role: UserRole.CUSTOMER });
      gateway.handleUnsubscribeDriver(client, { driverId: 5 });
      expect(client.leave).toHaveBeenCalledWith('user_5');
      expect(client.emit).toHaveBeenCalledWith('unsubscribed', { driverId: 5 });
    });
  });
});
