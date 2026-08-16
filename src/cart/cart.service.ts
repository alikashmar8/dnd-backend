import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Address } from '../addresses/entities/address.entity';
import { computeOrderFees, roundMoney } from '../common/constants/pricing';
import { MenuItem } from '../menu/entities/menu-item.entity';
import { Order } from '../orders/entities/order.entity';
import { OrdersService } from '../orders/orders.service';
import { ShopItem } from '../shop-items/entities/shop-item.entity';
import { CreateCartItemDto } from './dto/create-cart-item.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';
import { CartItem } from './entities/cart-item.entity';
import { Cart } from './entities/cart.entity';

export interface CartSummary {
  subtotal: number;
  tax: number;
  deliveryFee: number;
  total: number;
}

@Injectable()
export class CartService {
  constructor(
    @InjectRepository(Cart)
    private readonly cartRepository: Repository<Cart>,
    @InjectRepository(CartItem)
    private readonly cartItemRepository: Repository<CartItem>,
    @InjectRepository(MenuItem)
    private readonly menuItemRepository: Repository<MenuItem>,
    @InjectRepository(ShopItem)
    private readonly shopItemRepository: Repository<ShopItem>,
    private readonly dataSource: DataSource,
    private readonly ordersService: OrdersService,
  ) {}

  async getActiveCart(currentUserId: number): Promise<Cart> {
    return await this.dataSource.transaction(async (manager) => {
      const cart = await manager.findOne(Cart, {
        where: { userId: currentUserId, active: true },
        relations: {
          items: true,
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

      return await manager.save(newCart);
    });
  }

  async getActiveCartDetails(currentUserId: number) {
    const cart = await this.getActiveCart(currentUserId);

    const items = await this.cartItemRepository
      .createQueryBuilder('cartItem')
      .leftJoinAndMapOne(
        'cartItem.menuItem',
        MenuItem,
        'menuItem',
        'cartItem.itemType = :menuType AND cartItem.itemId = menuItem.id',
        { menuType: 'menu' },
      )
      .leftJoinAndMapOne(
        'cartItem.shopItem',
        ShopItem,
        'shopItem',
        'cartItem.itemType = :shopType AND cartItem.itemId = shopItem.id',
        { shopType: 'shop' },
      )
      .where('cartItem.cartId = :cartId', { cartId: cart.id })
      .orderBy('cartItem.createdAt', 'DESC')
      .getMany();

    return {
      ...cart,
      items: items.map((item) => ({
        ...item,
        lineTotal: roundMoney(Number(item.price) * item.quantity),
      })),
      summary: this.buildSummary(items),
    };
  }

  async addItemToCart(
    currentUserId: number,
    createCartItemDto: CreateCartItemDto,
  ): Promise<CartItem> {
    const cart = await this.getActiveCart(currentUserId);

    let item: MenuItem | ShopItem | null;

    if (createCartItemDto.itemType === 'menu') {
      item = await this.menuItemRepository.findOne({
        where: { id: createCartItemDto.itemId },
      });

      if (!item || !item.available) {
        throw new NotFoundException('Menu item not found or unavailable');
      }
    } else {
      item = await this.shopItemRepository.findOne({
        where: { id: createCartItemDto.itemId },
      });

      if (!item || !item.available) {
        throw new NotFoundException('Shop item not found or unavailable');
      }

      if (item.stockQuantity < createCartItemDto.quantity) {
        throw new BadRequestException('Insufficient stock to add item to cart');
      }
    }

    let cartItem = await this.cartItemRepository.findOne({
      where: {
        cartId: cart.id,
        itemId: createCartItemDto.itemId,
        itemType: createCartItemDto.itemType,
      },
    });

    if (cartItem) {
      cartItem.quantity += createCartItemDto.quantity;
      cartItem.price = Number(item.price);
      return await this.cartItemRepository.save(cartItem);
    }

    cartItem = this.cartItemRepository.create({
      cartId: cart.id,
      itemId: createCartItemDto.itemId,
      itemType: createCartItemDto.itemType,
      quantity: createCartItemDto.quantity,
      price: Number(item.price),
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
    });

    if (!cartItem) {
      throw new NotFoundException('Cart item not found');
    }

    if (updateCartItemDto.quantity !== undefined) {
      if (updateCartItemDto.quantity <= 0) {
        throw new BadRequestException('Quantity must be greater than zero');
      }

      let item: MenuItem | ShopItem | null;

      if (cartItem.itemType === 'menu') {
        item = await this.menuItemRepository.findOne({
          where: { id: cartItem.itemId },
        });

        if (!item || !item.available) {
          throw new BadRequestException('Menu item not available');
        }
      } else {
        item = await this.shopItemRepository.findOne({
          where: { id: cartItem.itemId },
        });

        if (!item || !item.available) {
          throw new BadRequestException('Shop item not available');
        }

        if (item.stockQuantity < updateCartItemDto.quantity) {
          throw new BadRequestException(
            'Insufficient stock for requested quantity',
          );
        }
      }

      cartItem.quantity = updateCartItemDto.quantity;
      cartItem.price = Number(item.price);
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
  ): Promise<{
    items: Array<CartItem & { lineTotal: number }>;
    total: number;
    skip: number;
    take: number;
    summary: CartSummary;
  }> {
    const cart = await this.getActiveCart(currentUserId);
    const skip = pagination.skip ?? 0;
    const take = pagination.take ?? 20;

    const [pageItems, total] = await this.cartItemRepository
      .createQueryBuilder('cartItem')
      .leftJoinAndMapOne(
        'cartItem.menuItem',
        MenuItem,
        'menuItem',
        'cartItem.itemType = :menuType AND cartItem.itemId = menuItem.id',
        { menuType: 'menu' },
      )
      .leftJoinAndMapOne(
        'cartItem.shopItem',
        ShopItem,
        'shopItem',
        'cartItem.itemType = :shopType AND cartItem.itemId = shopItem.id',
        { shopType: 'shop' },
      )
      .where('cartItem.cartId = :cartId', { cartId: cart.id })
      .orderBy('cartItem.createdAt', 'DESC')
      .skip(skip)
      .take(take)
      .getManyAndCount();

    const allItems = await this.cartItemRepository.find({
      where: { cartId: cart.id },
    });

    return {
      items: pageItems.map((item) => ({
        ...item,
        lineTotal: roundMoney(Number(item.price) * item.quantity),
      })),
      total,
      skip,
      take,
      summary: this.buildSummary(allItems),
    };
  }

  private buildSummary(items: CartItem[]): CartSummary {
    const subtotal = roundMoney(
      items.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0),
    );
    return { subtotal, ...computeOrderFees(subtotal) };
  }

  async checkoutCart(currentUserId: number, addressId: number): Promise<Order> {
    // One transaction: the cart row is locked (`pessimistic_write`) so two
    // concurrent checkouts of the same cart serialize — the second sees the
    // cart deactivated and fails instead of creating a duplicate order.
    const order = await this.dataSource.transaction(async (manager) => {
      const cart = await manager.findOne(Cart, {
        where: { userId: currentUserId, active: true },
        lock: { mode: 'pessimistic_write' },
        // `Cart.items` is eager; a `FOR UPDATE` query cannot join an outer
        // relation (Postgres: "FOR UPDATE cannot be applied to the nullable
        // side of an outer join"). Items are fetched explicitly below.
        loadEagerRelations: false,
      });

      if (!cart) {
        throw new BadRequestException('Cannot checkout an empty cart');
      }

      const cartItems = await manager.find(CartItem, {
        where: { cartId: cart.id },
      });

      if (cartItems.length === 0) {
        throw new BadRequestException('Cannot checkout an empty cart');
      }

      const address = await manager.findOne(Address, {
        where: { id: addressId, userId: currentUserId },
      });

      if (!address) {
        throw new NotFoundException('Delivery address not found');
      }

      const orderItems = cartItems.map((item) => ({
        itemId: item.itemId,
        quantity: item.quantity,
        itemType: item.itemType,
      }));

      // Stock validation + decrement happens authoritatively inside this
      // transaction against row-locked shop items.
      const created = await this.ordersService.createOrderFromItems(
        currentUserId,
        currentUserId,
        address.id,
        orderItems,
        manager,
      );

      cart.active = false;
      await manager.save(cart);

      return created;
    });

    this.ordersService.emitOrderUpdate(order.id);

    return order;
  }
}
