import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Address } from '../addresses/entities/address.entity';
import { AuthService } from '../auth/auth.service';
import { DeviceToken } from '../auth/entities/device-token.entity';
import { CommonModule } from '../common/common.module';
import { MenuItem } from '../menu/entities/menu-item.entity';
import { OrderItem } from '../orders/entities/order-item.entity';
import { Order } from '../orders/entities/order.entity';
import { OrdersModule } from '../orders/orders.module';
import { ShopItem } from '../shop-items/entities/shop-item.entity';
import { User } from '../users/entities/user.entity';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';
import { CartItem } from './entities/cart-item.entity';
import { Cart } from './entities/cart.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Cart,
      CartItem,
      MenuItem,
      ShopItem,
      Order,
      OrderItem,
      Address,
      User,
      DeviceToken,
    ]),
    CommonModule,
    OrdersModule,
  ],
  controllers: [CartController],
  providers: [CartService, AuthService],
  exports: [CartService],
})
export class CartModule {}
