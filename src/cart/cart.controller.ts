import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CartService } from './cart.service';
import { AuthGuard } from '../common/guards/auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../enums/user-role.enum';
import { CreateCartItemDto } from './dto/create-cart-item.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';
import { PaginationDto } from '../common/dto/pagination.dto';

@Controller('carts')
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.CUSTOMER)
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get('active')
  async getActiveCart(@CurrentUser('id') currentUserId: number) {
    return await this.cartService.getActiveCart(currentUserId);
  }

  @Get('items')
  async listCartItems(
    @CurrentUser('id') currentUserId: number,
    @Query() pagination: PaginationDto,
  ) {
    return await this.cartService.listCartItems(currentUserId, pagination);
  }

  @Post('items')
  async addItem(
    @CurrentUser('id') currentUserId: number,
    @Body() createCartItemDto: CreateCartItemDto,
  ) {
    return await this.cartService.addItemToCart(
      currentUserId,
      createCartItemDto,
    );
  }

  @Patch('items/:id')
  async updateItem(
    @CurrentUser('id') currentUserId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() updateCartItemDto: UpdateCartItemDto,
  ) {
    return await this.cartService.updateCartItem(
      currentUserId,
      id,
      updateCartItemDto,
    );
  }

  @Delete('items/:id')
  async removeItem(
    @CurrentUser('id') currentUserId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.cartService.removeCartItem(currentUserId, id);
    return { message: 'Cart item removed successfully' };
  }

  @Delete('clear')
  async clearCart(@CurrentUser('id') currentUserId: number) {
    await this.cartService.clearCart(currentUserId);
    return { message: 'Cart cleared successfully' };
  }

  @Post('checkout')
  async checkout(
    @CurrentUser('id') currentUserId: number,
    @Body('addressId', ParseIntPipe) addressId: number,
  ) {
    return await this.cartService.checkoutCart(currentUserId, addressId);
  }
}
