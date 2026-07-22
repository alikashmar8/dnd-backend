import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthService } from '../auth/auth.service';
import { DeviceToken } from '../auth/entities/device-token.entity';
import { Order } from '../orders/entities/order.entity';
import { OrdersModule } from '../orders/orders.module';
import { TrackingModule } from '../tracking/tracking.module';
import { User } from '../users/entities/user.entity';
import { DriverLocationController } from './driver-location.controller';
import { DriversController } from './drivers.controller';
import { DriversService } from './drivers.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, User, DeviceToken]),
    OrdersModule,
    TrackingModule,
  ],
  controllers: [DriversController, DriverLocationController],
  providers: [DriversService, AuthService],
  exports: [DriversService],
})
export class DriversModule {}
