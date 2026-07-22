import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthService } from '../auth/auth.service';
import { DeviceToken } from '../auth/entities/device-token.entity';
import { User } from '../users/entities/user.entity';
import { ShopCategory } from './entities/shop-category.entity';
import { ShopItem } from './entities/shop-item.entity';
import { ShopItemsController } from './shop-items.controller';
import { ShopItemsService } from './shop-items.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ShopItem, ShopCategory, User, DeviceToken]),
  ],
  controllers: [ShopItemsController],
  providers: [ShopItemsService, AuthService],
  exports: [ShopItemsService],
})
export class ShopItemsModule {}
