import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { SeedService } from './seed.service';
import { databaseConfig } from '../../config/database.config';
import { User } from '../../users/entities/user.entity';
import { Address } from '../../addresses/entities/address.entity';
import { Restaurant } from '../../restaurants/entities/restaurant.entity';
import { MenuCategory } from '../../menu/entities/menu-category.entity';
import { MenuItem } from '../../menu/entities/menu-item.entity';
import { ShopItem } from '../../shop-items/entities/shop-item.entity';
import { ShopCategory } from '../../shop-items/entities/shop-category.entity';
import { Order } from '../../orders/entities/order.entity';
import { OrderItem } from '../../orders/entities/order-item.entity';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig],
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService): TypeOrmModuleOptions => {
        const dbConfig = configService.get<TypeOrmModuleOptions>('database');
        if (!dbConfig) {
          throw new Error('Database configuration not found');
        }
        return dbConfig;
      },
    }),
    TypeOrmModule.forFeature([
      User,
      Address,
      Restaurant,
      MenuCategory,
      MenuItem,
      ShopItem,
      ShopCategory,
      Order,
      OrderItem,
    ]),
  ],
  providers: [SeedService],
})
export class SeedModule {}
