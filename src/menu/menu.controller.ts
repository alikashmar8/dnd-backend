import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { MenuService } from './menu.service';
import { GetMenuItemsQueryDto } from './dto/get-menu-items-query.dto.js';
import { UpdateMenuItemDto } from './dto/update-menu-item.dto.js';
import { CreateMenuItemDto } from './dto/create-menu-item.dto';
import { CreateMenuCategoryDto } from './dto/create-menu-category.dto';
import { UpdateMenuCategoryDto } from './dto/update-menu-category.dto';
import { AuthGuard } from '../common/guards/auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../enums/user-role.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';

@Controller('menu')
@UseGuards(AuthGuard)
export class MenuController {
  constructor(private readonly menuService: MenuService) {}

  @Get('items')
  async findItems(
    @CurrentUser() currentUser: User,
    @Query() query: GetMenuItemsQueryDto,
  ) {
    return await this.menuService.findItems(currentUser, query);
  }

  @Get('items/:id')
  async findItem(
    @CurrentUser() currentUser: User,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return await this.menuService.findItem(currentUser, id);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPERADMIN)
  @Post('items')
  async createItem(@Body() dto: CreateMenuItemDto) {
    return await this.menuService.createItem(dto);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPERADMIN)
  @Patch('items/:id')
  async updateItem(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateMenuItemDto,
  ) {
    return await this.menuService.updateItem(id, dto);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPERADMIN)
  @Delete('items/:id')
  async deleteItem(@Param('id', ParseIntPipe) id: number) {
    return await this.menuService.deleteItem(id);
  }

  @Get('categories')
  async findCategories(@CurrentUser() currentUser: User) {
    return await this.menuService.findCategories(currentUser);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPERADMIN)
  @Post('categories')
  async createCategory(@Body() dto: CreateMenuCategoryDto) {
    return await this.menuService.createCategory(dto);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPERADMIN)
  @Patch('categories/:id')
  async updateCategory(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateMenuCategoryDto,
  ) {
    return await this.menuService.updateCategory(id, dto);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPERADMIN)
  @Delete('categories/:id')
  async deleteCategory(@Param('id', ParseIntPipe) id: number) {
    return await this.menuService.deleteCategory(id);
  }
}
