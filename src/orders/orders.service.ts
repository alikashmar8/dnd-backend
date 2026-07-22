import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Order, OrderSource } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { Address } from '../addresses/entities/address.entity';
import { MenuItem } from '../menu/entities/menu-item.entity';
import { ShopItem } from '../shop-items/entities/shop-item.entity';
import { Restaurant } from '../restaurants/entities/restaurant.entity';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderStatus } from '../enums/order-status.enum';
import { UserRole } from '../enums/user-role.enum';
import { User } from '../users/entities/user.entity';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(OrderItem)
    private readonly orderItemRepository: Repository<OrderItem>,
    @InjectRepository(Address)
    private readonly addressRepository: Repository<Address>,
    @InjectRepository(MenuItem)
    private readonly menuItemRepository: Repository<MenuItem>,
    @InjectRepository(ShopItem)
    private readonly shopItemRepository: Repository<ShopItem>,
    @InjectRepository(Restaurant)
    private readonly restaurantRepository: Repository<Restaurant>,
    private readonly dataSource: DataSource,
    private readonly notificationsService: NotificationsService,
  ) {}

  async findAllForUser(
    currentUser: User,
    query: {
      skip?: number;
      take?: number;
      status?: OrderStatus;
      search?: string;
      customerId?: number;
      driverId?: number;
    },
  ): Promise<{ items: Order[]; total: number; skip: number; take: number }> {
    const skip = query.skip ?? 0;
    const take = query.take ?? 20;

    const qb = this.orderRepository
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.items', 'item')
      .leftJoinAndSelect('order.restaurant', 'restaurant')
      .leftJoinAndSelect('order.address', 'address')
      .leftJoinAndSelect('order.customer', 'customer')
      .leftJoinAndSelect('order.driver', 'driver')
      .orderBy('order.createdAt', 'DESC')
      .skip(skip)
      .take(take);

    if (currentUser.role === UserRole.ADMIN) {
      // Admin can see all orders — apply manual filters if provided
      if (query.customerId) {
        qb.andWhere('order.customerId = :customerId', {
          customerId: query.customerId,
        });
      }
      if (query.driverId) {
        qb.andWhere('order.driverId = :driverId', { driverId: query.driverId });
      }
    } else if (currentUser.role === UserRole.CUSTOMER) {
      qb.andWhere('order.customerId = :currentUserId', {
        currentUserId: currentUser.id,
      });
    } else if (currentUser.role === UserRole.DRIVER) {
      qb.andWhere('order.driverId = :currentUserId', {
        currentUserId: currentUser.id,
      });
    }

    if (query.status) {
      qb.andWhere('order.status = :status', { status: query.status });
    }

    if (query.search) {
      const search = `%${query.search.trim().toLowerCase()}%`;
      qb.andWhere(
        '(LOWER(order.id) LIKE :search OR LOWER(customer.name) LIKE :search OR LOWER(customer.phone) LIKE :search)',
        { search },
      );
    }

    const [items, total] = await qb.getManyAndCount();
    return { items, total, skip, take };
  }

  async findOneForUser(currentUser: User, id: string): Promise<Order> {
    const qb = this.orderRepository
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.items', 'item')
      .leftJoinAndSelect('order.restaurant', 'restaurant')
      .leftJoinAndSelect('order.address', 'address')
      .leftJoinAndSelect('order.customer', 'customer')
      .leftJoinAndSelect('order.driver', 'driver')
      .where('order.id = :id', { id });

    if (currentUser.role === UserRole.CUSTOMER) {
      qb.andWhere('order.customerId = :currentUserId', {
        currentUserId: currentUser.id,
      });
    } else if (currentUser.role === UserRole.DRIVER) {
      qb.andWhere('order.driverId = :currentUserId', {
        currentUserId: currentUser.id,
      });
    }
    // Admin can see any order, so no additional filter needed

    const order = await qb.getOne();

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return order;
  }

  async create(
    currentUser: User,
    createOrderDto: CreateOrderDto,
  ): Promise<Order> {
    if (!createOrderDto.customerId) {
      throw new BadRequestException('customerId is required');
    }

    const address = await this.addressRepository.findOne({
      where: {
        id: createOrderDto.addressId,
        userId: createOrderDto.customerId,
      },
    });

    if (!address) {
      throw new NotFoundException('Delivery address not found');
    }

    return await this.createOrderFromItems(
      createOrderDto.customerId,
      currentUser.id,
      createOrderDto.source,
      createOrderDto.restaurantId || null,
      address.id,
      createOrderDto.items,
    );
  }

  async createOrderFromItems(
    customerId: number,
    createdById: number | null,
    source: OrderSource,
    restaurantId: number | null,
    addressId: number,
    items: Array<{ itemId: number; quantity: number }>,
  ): Promise<Order> {
    let subtotal = 0;
    const itemsToInsert: OrderItem[] = [];
    let finalRestaurantId: number | null = null;

    const createdOrder = await this.dataSource.transaction(async (manager) => {
      if (source === OrderSource.RESTAURANT) {
        if (!restaurantId) {
          throw new BadRequestException(
            'restaurantId is required for restaurant orders',
          );
        }

        const restaurant = await manager.findOne(Restaurant, {
          where: { id: restaurantId },
        });

        if (!restaurant) {
          throw new NotFoundException('Restaurant not found');
        }

        finalRestaurantId = restaurant.id;
      }

      for (const itemDto of items) {
        if (source === OrderSource.RESTAURANT) {
          const menuItem = await manager.findOne(MenuItem, {
            where: { id: itemDto.itemId },
            relations: {
              restaurant: true,
            },
          });

          if (!menuItem || !menuItem.available) {
            throw new NotFoundException(
              `Menu item ${itemDto.itemId} not available`,
            );
          }

          if (menuItem.restaurant?.id !== restaurantId) {
            throw new BadRequestException(
              'All menu items must belong to the selected restaurant',
            );
          }

          subtotal += Number(menuItem.price) * itemDto.quantity;
          const orderItem = this.orderItemRepository.create({
            itemId: menuItem.id.toString(),
            name: menuItem.name,
            price: Number(menuItem.price),
            quantity: itemDto.quantity,
            image: menuItem.image,
          });
          itemsToInsert.push(orderItem);
        } else {
          const shopItem = await manager.findOne(ShopItem, {
            where: { id: itemDto.itemId },
          });

          if (!shopItem || !shopItem.available) {
            throw new NotFoundException(
              `Shop item ${itemDto.itemId} not available`,
            );
          }

          if (shopItem.stockQuantity < itemDto.quantity) {
            throw new BadRequestException(
              `Insufficient stock for item ${shopItem.name}`,
            );
          }

          shopItem.stockQuantity -= itemDto.quantity;
          await manager.save(shopItem);

          subtotal += Number(shopItem.price) * itemDto.quantity;
          const orderItem = this.orderItemRepository.create({
            itemId: shopItem.id.toString(),
            name: shopItem.name,
            price: Number(shopItem.price),
            quantity: itemDto.quantity,
            image: shopItem.image,
          });
          itemsToInsert.push(orderItem);
        }
      }

      const tax = Number((subtotal * 0.05).toFixed(2));
      const deliveryFee = source === OrderSource.RESTAURANT ? 7 : 5;
      const total = Number((subtotal + tax + deliveryFee).toFixed(2));
      const etaMinutes = source === OrderSource.RESTAURANT ? 35 : 45;
      const orderId = `ORD-${Date.now()}`;

      let order = this.orderRepository.create({
        id: orderId,
        customerId,
        createdById,
        source,
        restaurantId: finalRestaurantId,
        status: OrderStatus.PENDING,
        addressId,
        etaMinutes,
        subtotal,
        tax,
        deliveryFee,
        total,
        driverId: null,
      });

      order = await manager.save(order);

      for (const orderItem of itemsToInsert) {
        orderItem.order = order;
        orderItem.orderId = order.id;
        await manager.save(orderItem);
      }

      return order;
    });

    if (!createdOrder) {
      throw new BadRequestException('Failed to create order');
    }

    const order = await this.orderRepository.findOne({
      where: { id: createdOrder.id },
      relations: {
        items: true,
        address: true,
        restaurant: true,
        driver: true,
      },
    });

    if (!order) {
      throw new BadRequestException('Failed to retrieve created order');
    }

    return order;
  }

  async updateOrderStatus(
    currentUser: User,
    orderId: string,
    status: OrderStatus,
  ): Promise<Order> {
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
      relations: { driver: true, restaurant: true, address: true, items: true },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (currentUser.role === UserRole.CUSTOMER) {
      if (order.customerId !== currentUser.id) {
        throw new ForbiddenException("Cannot modify another user's order");
      }

      if (status !== OrderStatus.CANCELLED) {
        throw new BadRequestException(
          'Customers may only cancel pending orders',
        );
      }

      if (order.status !== OrderStatus.PENDING) {
        throw new BadRequestException('Only pending orders can be cancelled');
      }

      order.status = OrderStatus.CANCELLED;
      await this.orderRepository.save(order);

      // Send notification
      try {
        await this.notificationsService.sendOrderStatusNotification(
          order.customerId,
          order.id,
          status,
        );
      } catch (error) {
        console.error('Failed to send order status notification:', error);
      }

      return order;
    }

    if (currentUser.role === UserRole.DRIVER) {
      if (order.driverId !== currentUser.id) {
        throw new ForbiddenException("Cannot modify another driver's order");
      }

      const validDriverTransitions: Record<OrderStatus, OrderStatus[]> = {
        [OrderStatus.PENDING]: [],
        [OrderStatus.CONFIRMED]: [OrderStatus.OUT_FOR_DELIVERY],
        [OrderStatus.PREPARING]: [OrderStatus.OUT_FOR_DELIVERY],
        [OrderStatus.OUT_FOR_DELIVERY]: [OrderStatus.DELIVERED],
        [OrderStatus.DELIVERED]: [],
        [OrderStatus.COMPLETED]: [],
        [OrderStatus.CANCELLED]: [],
      };

      const allowedTransitions = validDriverTransitions[order.status] || [];
      if (!allowedTransitions.includes(status)) {
        throw new BadRequestException(
          `Drivers can only transition from ${order.status} to ${status}`,
        );
      }

      order.status = status;
      await this.orderRepository.save(order);

      // Send notification to customer
      try {
        await this.notificationsService.sendOrderStatusNotification(
          order.customerId,
          order.id,
          status,
        );
      } catch (error) {
        console.error('Failed to send order status notification:', error);
      }

      return order;
    }

    const validAdminTransitions: Record<OrderStatus, OrderStatus[]> = {
      [OrderStatus.PENDING]: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
      [OrderStatus.CONFIRMED]: [
        OrderStatus.PREPARING,
        OrderStatus.OUT_FOR_DELIVERY,
        OrderStatus.CANCELLED,
      ],
      [OrderStatus.PREPARING]: [
        OrderStatus.OUT_FOR_DELIVERY,
        OrderStatus.CANCELLED,
      ],
      [OrderStatus.OUT_FOR_DELIVERY]: [OrderStatus.DELIVERED],
      [OrderStatus.DELIVERED]: [OrderStatus.COMPLETED],
      [OrderStatus.COMPLETED]: [],
      [OrderStatus.CANCELLED]: [],
    };

    const allowedAdminTransitions = validAdminTransitions[order.status] || [];
    if (!allowedAdminTransitions.includes(status)) {
      throw new BadRequestException(
        `Admin cannot transition from ${order.status} to ${status}`,
      );
    }

    order.status = status;
    await this.orderRepository.save(order);

    // Send notification to customer
    try {
      await this.notificationsService.sendOrderStatusNotification(
        order.customerId,
        order.id,
        status,
      );
    } catch (error) {
      console.error('Failed to send order status notification:', error);
    }

    return order;
  }

  async assignDriver(
    currentUser: User,
    orderId: string,
    driverId: number,
  ): Promise<Order> {
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
      relations: { driver: true, restaurant: true, address: true, items: true },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    order.driverId = driverId;
    await this.orderRepository.save(order);
    return order;
  }
}
