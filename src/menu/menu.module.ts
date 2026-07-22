import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MenuController } from './menu.controller';
import { MenuService } from './menu.service';
import { MenuItem } from './entities/menu-item.entity.js';
import { MenuCategory } from './entities/menu-category.entity.js';
import { Restaurant } from '../restaurants/entities/restaurant.entity.js';
import { CommonModule } from '../common/common.module.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([MenuItem, MenuCategory, Restaurant]),
    CommonModule,
    AuthModule,
  ],
  controllers: [MenuController],
  providers: [MenuService],
  exports: [MenuService],
})
export class MenuModule {}
