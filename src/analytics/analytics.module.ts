import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthService } from '../auth/auth.service';
import { DeviceToken } from '../auth/entities/device-token.entity';
import { MenuItem } from '../menu/entities/menu-item.entity';
import { OrderItem } from '../orders/entities/order-item.entity';
import { Order } from '../orders/entities/order.entity';
import { Restaurant } from '../restaurants/entities/restaurant.entity';
import { ShopItem } from '../shop-items/entities/shop-item.entity';
import { User } from '../users/entities/user.entity';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Order,
      OrderItem,
      User,
      Restaurant,
      MenuItem,
      ShopItem,
      DeviceToken,
    ]),
  ],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, AuthService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
