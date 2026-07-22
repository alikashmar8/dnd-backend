import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { databaseConfig } from './config/database.config';
import { appConfig } from './config/app.config';
import { redisConfig } from './config/redis.config';
import { storageConfig } from './config/storage.config';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { AddressesModule } from './addresses/addresses.module';
import { RestaurantsModule } from './restaurants/restaurants.module';
import { ShopItemsModule } from './shop-items/shop-items.module';
import { MenuModule } from './menu/menu.module';
import { OrdersModule } from './orders/orders.module';
import { DriversModule } from './drivers/drivers.module';
import { ChatModule } from './chat/chat.module';
import { CartModule } from './cart/cart.module';
import { CommonModule } from './common/common.module';
import { TrackingModule } from './tracking/tracking.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { StorageModule } from './storage/storage.module';
import { FilesModule } from './files/files.module';
import { PasswordResetModule } from './password-reset/password-reset.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig, appConfig, redisConfig, storageConfig],
    }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 900000, limit: 3 }]),
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
    AuthModule,
    UsersModule,
    AddressesModule,
    RestaurantsModule,
    ShopItemsModule,
    MenuModule,
    OrdersModule,
    DriversModule,
    ChatModule,
    CartModule,
    CommonModule,
    TrackingModule,
    NotificationsModule,
    AnalyticsModule,
    StorageModule,
    FilesModule,
    PasswordResetModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
