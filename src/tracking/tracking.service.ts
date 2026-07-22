import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

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

  constructor(private readonly configService: ConfigService) {
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
