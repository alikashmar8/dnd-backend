import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthService } from '../auth/auth.service';
import { DeviceToken } from '../auth/entities/device-token.entity';
import { User } from '../users/entities/user.entity';
import { AdsController } from './ads.controller';
import { AdsService } from './ads.service';
import { Ad } from './entities/ad.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Ad, User, DeviceToken])],
  controllers: [AdsController],
  providers: [AdsService, AuthService],
  exports: [AdsService],
})
export class AdsModule {}
