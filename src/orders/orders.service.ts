import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { Address } from '../addresses/entities/address.entity';
import { OrderStatus } from '../enums/order-status.enum';
import { UserRole } from '../enums/user-role.enum';
import { computeOrderFees, roundMoney } from '../common/constants/pricing';
import { MenuItem } from '../menu/entities/menu-item.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { ShopItem } from '../shop-items/entities/shop-item.entity';
import { User } from '../users/entities/user.entity';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderItem } from './entities/order-item.entity';
import { Order } from './entities/order.entity';

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
      .leftJoinAndSelect('order.address', 'address')
      .leftJoinAndSelect('order.customer', 'customer')
      .leftJoinAndSelect('order.driver', 'driver')
      .leftJoinAndSelect('order.kitchenUser', 'kitchenUser')
      .leftJoinAndSelect('order.warehouseUser', 'warehouseUser')
      .orderBy('order.createdAt', 'DESC')
      .skip(skip)
      .take(take);

    if (currentUser.role === UserRole.ADMIN) {
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
    } else if (currentUser.role === UserRole.KITCHEN) {
      qb.andWhere(
        '(order.status IN (:...statuses) AND EXISTS (SELECT 1 FROM order_items oi WHERE oi."orderId" = order.id AND oi."itemType" = \'menu\'))',
        {
          statuses: [OrderStatus.CONFIRMED, OrderStatus.PREPARING],
        },
      );
      qb.andWhere(
        '(order.kitchenUserId IS NULL OR order.kitchenUserId = :currentUserId)',
        { currentUserId: currentUser.id },
      );
    } else if (currentUser.role === UserRole.WAREHOUSE) {
      qb.andWhere(
        '(order.status IN (:...statuses) AND EXISTS (SELECT 1 FROM order_items oi WHERE oi."orderId" = order.id AND oi."itemType" = \'shop\'))',
        {
          statuses: [OrderStatus.CONFIRMED, OrderStatus.PREPARING],
        },
      );
      qb.andWhere(
        '(order.warehouseUserId IS NULL OR order.warehouseUserId = :currentUserId)',
        { currentUserId: currentUser.id },
      );
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
    return {
      items: items.map((order) => this.decorateOrderItems(order)),
      total,
      skip,
      take,
    };
  }

  async findOneForUser(currentUser: User, id: string): Promise<Order> {
    const qb = this.orderRepository
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.items', 'item')
      .leftJoinAndSelect('order.address', 'address')
      .leftJoinAndSelect('order.customer', 'customer')
      .leftJoinAndSelect('order.driver', 'driver')
      .leftJoinAndSelect('order.kitchenUser', 'kitchenUser')
      .leftJoinAndSelect('order.warehouseUser', 'warehouseUser')
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

    const order = await qb.getOne();

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return this.decorateOrderItems(order);
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
      address.id,
      createOrderDto.items,
    );
  }

  async createOrderFromItems(
    customerId: number,
    createdById: number | null,
    addressId: number,
    items: Array<{
      itemId: number;
      quantity: number;
      itemType?: 'menu' | 'shop';
    }>,
  ): Promise<Order> {
    let subtotal = 0;
    const itemsToInsert: OrderItem[] = [];

    const createdOrder = await this.dataSource.transaction(async (manager) => {
      const menuItemsToFetch = items
        .filter((item) => item.itemType === 'menu' || !item.itemType)
        .map((item) => item.itemId);
      const shopItemsToFetch = items
        .filter((item) => item.itemType === 'shop')
        .map((item) => item.itemId);

      const fetchedMenuItems =
        menuItemsToFetch.length > 0
          ? await manager.find(MenuItem, {
              where: { id: In(menuItemsToFetch) },
            })
          : [];
      const fetchedShopItems =
        shopItemsToFetch.length > 0
          ? await manager.find(ShopItem, {
              where: { id: In(shopItemsToFetch) },
            })
          : [];

      const menuItemMap = new Map(
        fetchedMenuItems.map((item) => [item.id, item]),
      );
      const shopItemMap = new Map(
        fetchedShopItems.map((item) => [item.id, item]),
      );

      for (const itemDto of items) {
        const itemType = itemDto.itemType || 'menu';

        if (itemType === 'menu') {
          const menuItem = menuItemMap.get(itemDto.itemId);

          if (!menuItem || !menuItem.available) {
            throw new NotFoundException(
              `Menu item ${itemDto.itemId} not available`,
            );
          }

          subtotal += Number(menuItem.price) * itemDto.quantity;
          const orderItem = this.orderItemRepository.create({
            itemId: menuItem.id.toString(),
            itemType: 'menu',
            name: menuItem.name,
            nameAr: menuItem.nameAr ?? null,
            price: Number(menuItem.price),
            quantity: itemDto.quantity,
            image: menuItem.image,
          });
          itemsToInsert.push(orderItem);
        } else {
          const shopItem = shopItemMap.get(itemDto.itemId);

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
            itemType: 'shop',
            name: shopItem.name,
            nameAr: shopItem.nameAr ?? null,
            price: Number(shopItem.price),
            quantity: itemDto.quantity,
            image: shopItem.image,
          });
          itemsToInsert.push(orderItem);
        }
      }

      const { tax, deliveryFee, total } = computeOrderFees(subtotal);
      const etaMinutes = 40;
      const today = new Date();
      const orderId = `ORD-${today.getFullYear()}-${(today.getMonth() + 1)
        .toString()
        .padStart(
          2,
          '0',
        )}-${today.getDate().toString().padStart(2, '0')}-${Math.floor(Math.random() * 10000)}`;

      let order = this.orderRepository.create({
        id: orderId,
        customerId,
        createdById,
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
      relations: {
        driver: true,
        address: true,
        items: true,
        kitchenUser: true,
        warehouseUser: true,
      },
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
        [OrderStatus.CONFIRMED]: [],
        [OrderStatus.PREPARING]: [],
        [OrderStatus.WAITING_FOR_PICKUP]: [OrderStatus.IN_ROUTE],
        [OrderStatus.IN_ROUTE]: [OrderStatus.DELIVERED],
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

    if (currentUser.role === UserRole.ADMIN) {
      const validAdminTransitions: Record<OrderStatus, OrderStatus[]> = {
        [OrderStatus.PENDING]: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
        [OrderStatus.CONFIRMED]: [OrderStatus.CANCELLED],
        [OrderStatus.PREPARING]: [OrderStatus.CANCELLED],
        [OrderStatus.WAITING_FOR_PICKUP]: [],
        [OrderStatus.IN_ROUTE]: [],
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

    throw new ForbiddenException('Insufficient permissions');
  }

  async assignDriver(
    currentUser: User,
    orderId: string,
    driverId: number,
  ): Promise<Order> {
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
      relations: { driver: true, address: true, items: true },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    order.driverId = driverId;
    await this.orderRepository.save(order);
    return order;
  }

  async assignKitchenUser(
    currentUser: User,
    orderId: string,
    userId?: number,
  ): Promise<Order> {
    if (
      currentUser.role !== UserRole.KITCHEN &&
      currentUser.role !== UserRole.ADMIN
    ) {
      throw new ForbiddenException('Only kitchen users can be assigned');
    }

    const targetUserId =
      currentUser.role === UserRole.ADMIN ? userId : currentUser.id;

    if (!targetUserId) {
      throw new BadRequestException(
        'userId is required when admin assigns a kitchen user',
      );
    }

    const order = await this.orderRepository.findOne({
      where: { id: orderId },
      relations: { items: true, kitchenUser: true, warehouseUser: true },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (
      order.status !== OrderStatus.CONFIRMED &&
      order.status !== OrderStatus.PREPARING
    ) {
      throw new BadRequestException('Order must be confirmed or preparing');
    }

    const hasMenuItems = order.items.some((item) => item.itemType === 'menu');
    if (!hasMenuItems) {
      throw new BadRequestException('Order has no menu items');
    }

    if (order.kitchenUserId) {
      throw new BadRequestException(
        'Kitchen user already assigned to this order',
      );
    }

    order.kitchenUserId = targetUserId;
    order.kitchenAssignedAt = new Date();

    if (order.status === OrderStatus.CONFIRMED) {
      order.status = OrderStatus.PREPARING;
    }

    return await this.orderRepository.save(order);
  }

  async assignWarehouseUser(
    currentUser: User,
    orderId: string,
    userId?: number,
  ): Promise<Order> {
    if (
      currentUser.role !== UserRole.WAREHOUSE &&
      currentUser.role !== UserRole.ADMIN
    ) {
      throw new ForbiddenException('Only warehouse users can be assigned');
    }

    const targetUserId =
      currentUser.role === UserRole.ADMIN ? userId : currentUser.id;

    if (!targetUserId) {
      throw new BadRequestException(
        'userId is required when admin assigns a warehouse user',
      );
    }

    const order = await this.orderRepository.findOne({
      where: { id: orderId },
      relations: { items: true, kitchenUser: true, warehouseUser: true },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (
      order.status !== OrderStatus.CONFIRMED &&
      order.status !== OrderStatus.PREPARING
    ) {
      throw new BadRequestException('Order must be confirmed or preparing');
    }

    const hasShopItems = order.items.some((item) => item.itemType === 'shop');
    if (!hasShopItems) {
      throw new BadRequestException('Order has no shop items');
    }

    if (order.warehouseUserId && order.warehouseUserId !== targetUserId) {
      throw new BadRequestException(
        'Warehouse user already assigned to this order',
      );
    }

    order.warehouseUserId = targetUserId;
    order.warehouseAssignedAt = new Date();

    if (order.status === OrderStatus.CONFIRMED) {
      order.status = OrderStatus.PREPARING;
    }

    return await this.orderRepository.save(order);
  }

  async markPrepared(
    currentUser: User,
    orderId: string,
    role?: 'kitchen' | 'warehouse',
  ): Promise<Order> {
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
      relations: { items: true, kitchenUser: true, warehouseUser: true },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.status !== OrderStatus.PREPARING) {
      throw new BadRequestException('Order must be in preparing status');
    }

    const hasMenuItems = order.items.some((item) => item.itemType === 'menu');
    const hasShopItems = order.items.some((item) => item.itemType === 'shop');

    let targetRole: 'kitchen' | 'warehouse';

    if (currentUser.role === UserRole.ADMIN) {
      if (!role) {
        throw new BadRequestException(
          'role is required when admin marks prepared',
        );
      }
      targetRole = role;
    } else if (currentUser.role === UserRole.KITCHEN) {
      targetRole = 'kitchen';
    } else if (currentUser.role === UserRole.WAREHOUSE) {
      targetRole = 'warehouse';
    } else {
      throw new ForbiddenException('Insufficient permissions');
    }

    if (targetRole === 'kitchen') {
      if (!hasMenuItems) {
        throw new BadRequestException('Order has no menu items');
      }
      if (
        order.kitchenUserId !== currentUser.id &&
        currentUser.role !== UserRole.ADMIN
      ) {
        throw new ForbiddenException('You are not assigned to this order');
      }
      order.kitchenPreparedAt = new Date();
    } else {
      if (!hasShopItems) {
        throw new BadRequestException('Order has no shop items');
      }
      if (
        order.warehouseUserId !== currentUser.id &&
        currentUser.role !== UserRole.ADMIN
      ) {
        throw new ForbiddenException('You are not assigned to this order');
      }
      order.warehousePreparedAt = new Date();
    }

    await this.orderRepository.save(order);

    const kitchenDone = !hasMenuItems || order.kitchenPreparedAt !== null;
    const warehouseDone = !hasShopItems || order.warehousePreparedAt !== null;

    if (kitchenDone && warehouseDone) {
      order.status = OrderStatus.WAITING_FOR_PICKUP;
      await this.orderRepository.save(order);

      try {
        await this.notificationsService.sendOrderStatusNotification(
          order.customerId,
          order.id,
          OrderStatus.WAITING_FOR_PICKUP,
        );
      } catch (error) {
        console.error('Failed to send order status notification:', error);
      }
    }

    return (await this.orderRepository.findOne({
      where: { id: orderId },
    })) as Order;
  }

  /** Attaches a server-computed `lineTotal` to every order item so clients
   * never perform pricing math. */
  private decorateOrderItems(order: Order): Order {
    if (order.items?.length) {
      for (const item of order.items) {
        (item as OrderItem & { lineTotal: number }).lineTotal = roundMoney(
          Number(item.price) * item.quantity,
        );
      }
    }
    return order;
  }
}
