import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { redisConfig } from '../config/redis.config';
import { TrackingGateway } from './tracking.gateway';
import { TrackingService } from './tracking.service';

@Module({
  imports: [ConfigModule.forFeature(redisConfig), AuthModule],
  providers: [TrackingGateway, TrackingService],
  exports: [TrackingService],
})
export class TrackingModule {}
