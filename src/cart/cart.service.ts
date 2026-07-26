import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { Cart } from './entities/cart.entity';
import { CartItem } from './entities/cart-item.entity';
import { MenuItem } from '../menu/entities/menu-item.entity';
import { ShopItem } from '../shop-items/entities/shop-item.entity';
import { CreateCartItemDto } from './dto/create-cart-item.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';
import { Order } from '../orders/entities/order.entity';
import { OrderItem } from '../orders/entities/order-item.entity';
import { Address } from '../addresses/entities/address.entity';
import { OrdersService } from '../orders/orders.service';

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
  ): Promise<{ items: CartItem[]; total: number; skip: number; take: number }> {
    const cart = await this.getActiveCart(currentUserId);
    const skip = pagination.skip ?? 0;
    const take = pagination.take ?? 20;

    const [items, total] = await this.cartItemRepository
      .createQueryBuilder('cartItem')
      .leftJoinAndSelect(
        'cartItem.menuItem',
        'menuItem',
        'cartItem.itemType = :menuType AND cartItem.itemId = menuItem.id',
        { menuType: 'menu' },
      )
      .leftJoinAndSelect(
        'cartItem.shopItem',
        'shopItem',
        'cartItem.itemType = :shopType AND cartItem.itemId = shopItem.id',
        { shopType: 'shop' },
      )
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

    const menuItems = cart.items.filter((item) => item.itemType === 'menu');
    const shopItems = cart.items.filter((item) => item.itemType === 'shop');

    const menuItemIds = menuItems.map((item) => item.itemId);
    const fetchedMenuItems =
      menuItemIds.length > 0
        ? await this.menuItemRepository.find({ where: { id: In(menuItemIds) } })
        : [];

    const shopItemIds = shopItems.map((item) => item.itemId);
    const fetchedShopItems =
      shopItemIds.length > 0
        ? await this.shopItemRepository.find({ where: { id: In(shopItemIds) } })
        : [];

    const menuItemMap: Map<number, MenuItem> = new Map(
      fetchedMenuItems.map((item) => [item.id, item]),
    );
    const shopItemMap: Map<number, ShopItem> = new Map(
      fetchedShopItems.map((item) => [item.id, item]),
    );

    for (const cartItem of menuItems) {
      const menuItem = menuItemMap.get(cartItem.itemId);
      if (!menuItem || !menuItem.available) {
        throw new BadRequestException('Menu item not available');
      }
    }

    for (const cartItem of shopItems) {
      const shopItem = shopItemMap.get(cartItem.itemId);
      if (!shopItem || !shopItem.available) {
        throw new BadRequestException('Shop item not available');
      }
      if (shopItem.stockQuantity < cartItem.quantity) {
        throw new BadRequestException(
          `Insufficient stock for item ${shopItem.name}`,
        );
      }
    }

    const orderItems: Array<{
      itemId: number;
      quantity: number;
      itemType: 'menu' | 'shop';
    }> = [];

    for (const cartItem of cart.items) {
      orderItems.push({
        itemId: cartItem.itemId,
        quantity: cartItem.quantity,
        itemType: cartItem.itemType,
      });
    }

    const order = await this.ordersService.createOrderFromItems(
      currentUserId,
      currentUserId,
      address.id,
      orderItems,
    );

    cart.active = false;
    await this.cartRepository.save(cart);

    return order;
  }
}
