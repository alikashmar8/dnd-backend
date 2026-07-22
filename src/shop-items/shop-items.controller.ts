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
import { ShopItemsService } from './shop-items.service';
import { GetShopItemsQueryDto } from './dto/get-shop-items-query.dto';
import { UpdateShopItemDto } from './dto/update-shop-item.dto';
import { CreateShopItemDto } from './dto/create-shop-item.dto';
import { CreateShopCategoryDto } from './dto/create-shop-category.dto';
import { UpdateShopCategoryDto } from './dto/update-shop-category.dto';
import { AuthGuard } from '../common/guards/auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../enums/user-role.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';

@Controller('shop-items')
@UseGuards(AuthGuard)
export class ShopItemsController {
  constructor(private readonly shopItemsService: ShopItemsService) {}

  /* ── Category routes must come BEFORE :id routes ──────────── */
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('categories')
  async findCategories() {
    return await this.shopItemsService.findCategories();
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post('categories')
  async createCategory(@Body() dto: CreateShopCategoryDto) {
    return await this.shopItemsService.createCategory(dto);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch('categories/:id')
  async updateCategory(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateShopCategoryDto,
  ) {
    return await this.shopItemsService.updateCategory(id, dto);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Delete('categories/:id')
  async deleteCategory(@Param('id', ParseIntPipe) id: number) {
    return await this.shopItemsService.deleteCategory(id);
  }

  /* ── Item routes ─────────────────────────────────────────── */
  @Get()
  async findAll(
    @CurrentUser() currentUser: User,
    @Query() query: GetShopItemsQueryDto,
  ) {
    return await this.shopItemsService.findAll(currentUser, query);
  }

  @Get(':id')
  async findOne(
    @CurrentUser() currentUser: User,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return await this.shopItemsService.findOne(currentUser, id);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post()
  async createItem(@Body() dto: CreateShopItemDto) {
    return await this.shopItemsService.createItem(dto);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch(':id')
  async updateItem(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateShopItemDto,
  ) {
    return await this.shopItemsService.updateItem(id, dto);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Delete(':id')
  async deleteItem(@Param('id', ParseIntPipe) id: number) {
    return await this.shopItemsService.deleteItem(id);
  }
}
