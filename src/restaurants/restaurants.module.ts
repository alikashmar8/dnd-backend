import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthService } from '../auth/auth.service';
import { DeviceToken } from '../auth/entities/device-token.entity';
import { User } from '../users/entities/user.entity';
import { Address } from '../addresses/entities/address.entity';
import { Restaurant } from './entities/restaurant.entity';
import { RestaurantsController } from './restaurants.controller';
import { RestaurantsService } from './restaurants.service';

@Module({
  imports: [TypeOrmModule.forFeature([Restaurant, Address, User, DeviceToken])],
  controllers: [RestaurantsController],
  providers: [RestaurantsService, AuthService],
  exports: [RestaurantsService],
})
export class RestaurantsModule {}
