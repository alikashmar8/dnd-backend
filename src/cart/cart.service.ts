import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Cart } from './entities/cart.entity';
import { CartItem } from './entities/cart-item.entity';
import { ShopItem } from '../shop-items/entities/shop-item.entity';
import { CreateCartItemDto } from './dto/create-cart-item.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';
import { Order, OrderSource } from '../orders/entities/order.entity';
import { OrderItem } from '../orders/entities/order-item.entity';
import { Address } from '../addresses/entities/address.entity';
import { OrderStatus } from '../enums/order-status.enum';
import { OrdersService } from '../orders/orders.service';

@Injectable()
export class CartService {
  constructor(
    @InjectRepository(Cart)
    private readonly cartRepository: Repository<Cart>,
    @InjectRepository(CartItem)
    private readonly cartItemRepository: Repository<CartItem>,
    @InjectRepository(ShopItem)
    private readonly shopItemRepository: Repository<ShopItem>,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(OrderItem)
    private readonly orderItemRepository: Repository<OrderItem>,
    @InjectRepository(Address)
    private readonly addressRepository: Repository<Address>,
    private readonly dataSource: DataSource,
    private readonly ordersService: OrdersService,
  ) {}

  async getActiveCart(currentUserId: number): Promise<Cart> {
    const cart = await this.cartRepository.findOne({
      where: { userId: currentUserId, active: true },
      relations: {
        items: {
          product: true,
        },
      },
    });

    if (cart) {
      return cart;
    }

    const newCart = this.cartRepository.create({
      userId: currentUserId,
      active: true,
      items: [],
    });

    return await this.cartRepository.save(newCart);
  }

  async addItemToCart(
    currentUserId: number,
    createCartItemDto: CreateCartItemDto,
  ): Promise<CartItem> {
    const cart = await this.getActiveCart(currentUserId);
    const product = await this.shopItemRepository.findOne({
      where: { id: createCartItemDto.productId },
    });

    if (!product || !product.available) {
      throw new NotFoundException('Product not found or unavailable');
    }

    if (product.stockQuantity < createCartItemDto.quantity) {
      throw new BadRequestException(
        'Insufficient stock to add product to cart',
      );
    }

    let cartItem = await this.cartItemRepository.findOne({
      where: { cartId: cart.id, productId: product.id },
    });

    if (cartItem) {
      cartItem.quantity += createCartItemDto.quantity;
      cartItem.price = Number(product.price);
      return await this.cartItemRepository.save(cartItem);
    }

    cartItem = this.cartItemRepository.create({
      cartId: cart.id,
      productId: product.id,
      quantity: createCartItemDto.quantity,
      price: Number(product.price),
      product,
    });

    return await this.cartItemRepository.save(cartItem);
  }

  async updateCartItem(
    currentUserId: number,
    itemId: number,
    updateCartItemDto: UpdateCartItemDto,
  ): Promise<CartItem> {
    const cart = await this.getActiveCart(currentUserId);
    const cartItem = await this.cartItemRepository.findOne({
      where: { id: itemId, cartId: cart.id },
      relations: {
        product: true,
      },
    });

    if (!cartItem) {
      throw new NotFoundException('Cart item not found');
    }

    if (updateCartItemDto.quantity !== undefined) {
      if (updateCartItemDto.quantity <= 0) {
        throw new BadRequestException('Quantity must be greater than zero');
      }

      if (
        !cartItem.product.available ||
        cartItem.product.stockQuantity < updateCartItemDto.quantity
      ) {
        throw new BadRequestException(
          'Insufficient stock for requested quantity',
        );
      }

      cartItem.quantity = updateCartItemDto.quantity;
      cartItem.price = Number(cartItem.product.price);
    }

    return await this.cartItemRepository.save(cartItem);
  }

  async removeCartItem(currentUserId: number, itemId: number): Promise<void> {
    const cart = await this.getActiveCart(currentUserId);
    const cartItem = await this.cartItemRepository.findOne({
      where: { id: itemId, cartId: cart.id },
    });

    if (!cartItem) {
      throw new NotFoundException('Cart item not found');
    }

    await this.cartItemRepository.remove(cartItem);
  }

  async clearCart(currentUserId: number): Promise<void> {
    const cart = await this.getActiveCart(currentUserId);
    await this.cartItemRepository.delete({ cartId: cart.id });
  }

  async listCartItems(
    currentUserId: number,
    pagination: { skip?: number; take?: number },
  ): Promise<{ items: CartItem[]; total: number; skip: number; take: number }> {
    const cart = await this.getActiveCart(currentUserId);
    const skip = pagination.skip ?? 0;
    const take = pagination.take ?? 20;

    const [items, total] = await this.cartItemRepository
      .createQueryBuilder('cartItem')
      .leftJoinAndSelect('cartItem.product', 'product')
      .where('cartItem.cartId = :cartId', { cartId: cart.id })
      .orderBy('cartItem.createdAt', 'DESC')
      .skip(skip)
      .take(take)
      .getManyAndCount();

    return { items, total, skip, take };
  }

  async checkoutCart(currentUserId: number, addressId: number): Promise<Order> {
    const cart = await this.getActiveCart(currentUserId);

    if (!cart.items || cart.items.length === 0) {
      throw new BadRequestException('Cannot checkout an empty cart');
    }

    const address = await this.addressRepository.findOne({
      where: { id: addressId, userId: currentUserId },
    });

    if (!address) {
      throw new NotFoundException('Delivery address not found');
    }

    // Validate cart items and prepare order items
    const orderItems: Array<{ itemId: number; quantity: number }> = [];
    let subtotal = 0;

    for (const item of cart.items) {
      if (!item.product.available) {
        throw new BadRequestException(
          `Product ${item.product.name} is unavailable`,
        );
      }
      if (item.product.stockQuantity < item.quantity) {
        throw new BadRequestException(
          `Insufficient stock for product ${item.product.name}`,
        );
      }
      subtotal += Number(item.price) * item.quantity;
      orderItems.push({ itemId: item.productId, quantity: item.quantity });
    }

    // Create order using shared logic
    const order = await this.ordersService.createOrderFromItems(
      currentUserId,
      currentUserId, // For customer checkout, createdById is the same as customerId
      OrderSource.SHOP,
      null, // No restaurant for shop orders
      address.id,
      orderItems,
    );

    // Deactivate cart after successful order creation
    cart.active = false;
    await this.cartRepository.save(cart);

    return order;
  }
}
