import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Redis from 'ioredis';
import { Order } from '../orders/entities/order.entity';
import { OrderStatus } from '../enums/order-status.enum';
import { UserRole } from '../enums/user-role.enum';
import { User } from '../users/entities/user.entity';

export interface DriverLocation {
  driverId: number;
  latitude: number;
  longitude: number;
  updatedAt: string;
}

const LOCATION_TTL = 60;

@Injectable()
export class TrackingService implements OnModuleDestroy {
  private readonly logger = new Logger(TrackingService.name);
  private readonly redis: Redis;
  private readonly locationPrefix = 'driver:location:';

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
  ) {
    const host = this.configService.get<string>('redis.host', 'localhost');
    const port = this.configService.get<number>('redis.port', 6379);
    const password = this.configService.get<string | undefined>(
      'redis.password',
    );

    this.redis = new Redis({ host, port, password, lazyConnect: true });

    this.redis.connect().catch((err: Error) => {
      this.logger.error(`Failed to connect to Redis: ${err.message}`);
    });
  }

  /**
   * R5 — decides who may subscribe to / fetch a driver's live location:
   * - the driver themself
   * - SUPERADMIN or DRIVER_HEAD (dispatch)
   * - a CUSTOMER who owns an active `in_route` order assigned to that driver
   * Everything else is denied.
   */
  async canViewDriverLocation(
    currentUser: User,
    driverId: number,
  ): Promise<boolean> {
    if (!currentUser || !currentUser.id) return false;

    if (currentUser.id === driverId) return true;

    if (
      currentUser.role === UserRole.SUPERADMIN ||
      currentUser.role === UserRole.DRIVER_HEAD
    ) {
      return true;
    }

    if (currentUser.role === UserRole.CUSTOMER) {
      const activeOrder = await this.orderRepository.findOne({
        where: {
          customerId: currentUser.id,
          driverId,
          status: OrderStatus.IN_ROUTE,
        },
      });
      return Boolean(activeOrder);
    }

    return false;
  }

  async onModuleDestroy() {
    await this.redis.quit();
  }

  async updateLocation(
    driverId: number,
    latitude: number,
    longitude: number,
  ): Promise<void> {
    const key = `${this.locationPrefix}${driverId}`;
    const data: DriverLocation = {
      driverId,
      latitude,
      longitude,
      updatedAt: new Date().toISOString(),
    };

    await this.redis.setex(key, LOCATION_TTL, JSON.stringify(data));
  }

  async getLocation(driverId: number): Promise<DriverLocation | null> {
    const key = `${this.locationPrefix}${driverId}`;
    const raw = await this.redis.get(key);

    if (!raw) {
      return null;
    }

    return JSON.parse(raw) as DriverLocation;
  }

  async removeLocation(driverId: number): Promise<void> {
    const key = `${this.locationPrefix}${driverId}`;
    await this.redis.del(key);
  }
}
