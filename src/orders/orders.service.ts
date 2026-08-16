import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { Address } from '../addresses/entities/address.entity';
import { computeOrderFees, roundMoney } from '../common/constants/pricing';
import { OrderStatus } from '../enums/order-status.enum';
import { UserRole } from '../enums/user-role.enum';
import { MenuItem } from '../menu/entities/menu-item.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { ShopItem } from '../shop-items/entities/shop-item.entity';
import { User } from '../users/entities/user.entity';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderItem } from './entities/order-item.entity';
import { Order } from './entities/order.entity';
import { OrdersGateway } from './orders.gateway';

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
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly dataSource: DataSource,
    private readonly notificationsService: NotificationsService,
    private readonly ordersGateway: OrdersGateway,
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
      assignedToMe?: boolean;
      history?: boolean;
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

    if (
      currentUser.role === UserRole.SUPERADMIN ||
      currentUser.role === UserRole.KITCHEN_HEAD ||
      currentUser.role === UserRole.WAREHOUSE_HEAD ||
      currentUser.role === UserRole.DRIVER_HEAD
    ) {
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
    } else if (currentUser.role === UserRole.KITCHEN_STAFF) {
      if (!query.history) {
        qb.andWhere(
          '(order.status IN (:...statuses) AND EXISTS (SELECT 1 FROM order_items oi WHERE oi."orderId" = order.id AND oi."itemType" = \'menu\'))',
          {
            statuses: [OrderStatus.CONFIRMED, OrderStatus.PREPARING],
          },
        );
      } else {
        qb.andWhere(
          'EXISTS (SELECT 1 FROM order_items oi WHERE oi."orderId" = order.id AND oi."itemType" = \'menu\')',
        );
      }
      if (query.assignedToMe) {
        qb.andWhere('order.kitchenUserId = :currentUserId', {
          currentUserId: currentUser.id,
        });
      } else {
        qb.andWhere(
          '(order.kitchenUserId IS NULL OR order.kitchenUserId = :currentUserId)',
          { currentUserId: currentUser.id },
        );
      }
    } else if (currentUser.role === UserRole.WAREHOUSE_STAFF) {
      if (!query.history) {
        qb.andWhere(
          '(order.status IN (:...statuses) AND EXISTS (SELECT 1 FROM order_items oi WHERE oi."orderId" = order.id AND oi."itemType" = \'shop\'))',
          {
            statuses: [OrderStatus.CONFIRMED, OrderStatus.PREPARING],
          },
        );
      } else {
        qb.andWhere(
          'EXISTS (SELECT 1 FROM order_items oi WHERE oi."orderId" = order.id AND oi."itemType" = \'shop\')',
        );
      }
      if (query.assignedToMe) {
        qb.andWhere('order.warehouseUserId = :currentUserId', {
          currentUserId: currentUser.id,
        });
      } else {
        qb.andWhere(
          '(order.warehouseUserId IS NULL OR order.warehouseUserId = :currentUserId)',
          { currentUserId: currentUser.id },
        );
      }
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
    } else if (currentUser.role === UserRole.KITCHEN_STAFF) {
      qb.andWhere('order.kitchenUserId = :currentUserId', {
        currentUserId: currentUser.id,
      });
    } else if (currentUser.role === UserRole.WAREHOUSE_STAFF) {
      qb.andWhere('order.warehouseUserId = :currentUserId', {
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

  /** Server-side price preview for the admin order form. Mirrors the exact
   * pricing/availability logic of `createOrderFromItems` (same constants via
   * `computeOrderFees`) so the quoted preview always equals the created order.
   * Read-only: no stock changes, no order rows. */
  async quoteOrder(
    currentUser: User,
    createOrderDto: CreateOrderDto,
  ): Promise<{
    items: Array<{
      itemId: number;
      itemType: 'menu' | 'shop';
      name: string;
      nameAr: string | null;
      price: number;
      quantity: number;
      lineTotal: number;
    }>;
    subtotal: number;
    tax: number;
    deliveryFee: number;
    total: number;
  }> {
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

    const menuItemsToFetch = createOrderDto.items
      .filter((item) => item.itemType === 'menu' || !item.itemType)
      .map((item) => item.itemId);
    const shopItemsToFetch = createOrderDto.items
      .filter((item) => item.itemType === 'shop')
      .map((item) => item.itemId);

    const fetchedMenuItems =
      menuItemsToFetch.length > 0
        ? await this.menuItemRepository.find({
            where: { id: In(menuItemsToFetch) },
          })
        : [];
    const fetchedShopItems =
      shopItemsToFetch.length > 0
        ? await this.shopItemRepository.find({
            where: { id: In(shopItemsToFetch) },
          })
        : [];

    const menuItemMap = new Map(
      fetchedMenuItems.map((item) => [item.id, item]),
    );
    const shopItemMap = new Map(
      fetchedShopItems.map((item) => [item.id, item]),
    );

    let subtotal = 0;
    const items: Array<{
      itemId: number;
      itemType: 'menu' | 'shop';
      name: string;
      nameAr: string | null;
      price: number;
      quantity: number;
      lineTotal: number;
    }> = [];

    for (const itemDto of createOrderDto.items) {
      const itemType = itemDto.itemType || 'menu';

      if (itemType === 'menu') {
        const menuItem = menuItemMap.get(itemDto.itemId);

        if (!menuItem || !menuItem.available) {
          throw new NotFoundException(
            `Menu item ${itemDto.itemId} not available`,
          );
        }

        subtotal += Number(menuItem.price) * itemDto.quantity;
        items.push({
          itemId: menuItem.id,
          itemType: 'menu',
          name: menuItem.name,
          nameAr: menuItem.nameAr ?? null,
          price: Number(menuItem.price),
          quantity: itemDto.quantity,
          lineTotal: roundMoney(Number(menuItem.price) * itemDto.quantity),
        });
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

        subtotal += Number(shopItem.price) * itemDto.quantity;
        items.push({
          itemId: shopItem.id,
          itemType: 'shop',
          name: shopItem.name,
          nameAr: shopItem.nameAr ?? null,
          price: Number(shopItem.price),
          quantity: itemDto.quantity,
          lineTotal: roundMoney(Number(shopItem.price) * itemDto.quantity),
        });
      }
    }

    return { items, subtotal, ...computeOrderFees(subtotal) };
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
    managerOverride?: EntityManager,
  ): Promise<Order> {
    const run = async (manager: EntityManager): Promise<Order> => {
      let subtotal = 0;
      const itemsToInsert: OrderItem[] = [];

      // Re-load the address inside the transaction so the snapshot below
      // reflects the row as of order time (the caller's earlier read was just
      // an ownership check).
      const deliveryAddress = await manager.findOne(Address, {
        where: { id: addressId },
      });

      if (!deliveryAddress) {
        throw new NotFoundException('Delivery address not found');
      }

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

      // Lock every shop row (`pessimistic_write`) so concurrent checkouts
      // serialize on the last unit of stock instead of reading a stale count.
      // The authoritative stock check happens below against the locked row.
      const fetchedShopItems = await Promise.all(
        shopItemsToFetch.map((id) =>
          manager.findOne(ShopItem, {
            where: { id },
            lock: { mode: 'pessimistic_write' },
          }),
        ),
      );

      const menuItemMap = new Map(
        fetchedMenuItems.map((item) => [item.id, item]),
      );
      const shopItemMap = new Map(
        fetchedShopItems
          .filter((item): item is ShopItem => item !== null)
          .map((item) => [item.id, item]),
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
      const orderId = this.generateOrderId();

      let order = this.orderRepository.create({
        id: orderId,
        customerId,
        createdById,
        status: OrderStatus.PENDING,
        addressId,
        deliveryTitle: deliveryAddress.title,
        deliveryCity: deliveryAddress.city,
        deliveryStreet: deliveryAddress.street,
        deliveryDescription: deliveryAddress.description ?? null,
        deliveryLatitude: Number(deliveryAddress.latitude),
        deliveryLongitude: Number(deliveryAddress.longitude),
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

      const fullOrder = await manager.findOne(Order, {
        where: { id: order.id },
        relations: { items: true, address: true },
      });

      return fullOrder ?? order;
    };

    // When a manager is supplied (checkout), the caller owns the transaction
    // and is responsible for emitting the socket update after it commits.
    const createdOrder = managerOverride
      ? await run(managerOverride)
      : await this.withIdCollisionRetry(() => this.dataSource.transaction(run));

    if (!createdOrder) {
      throw new BadRequestException('Failed to create order');
    }

    if (managerOverride) {
      return createdOrder;
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

    this.emitOrderUpdate(order.id);

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

      this.emitOrderUpdate(order.id);

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

      this.emitOrderUpdate(order.id);

      return order;
    }

    if (currentUser.role === UserRole.SUPERADMIN) {
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

      this.emitOrderUpdate(order.id);

      return order;
    }

    throw new ForbiddenException('Insufficient permissions');
  }

  async assignDriver(orderId: string, driverId: string): Promise<Order> {
    const driver = await this.getStaffOrFail(
      Number(driverId),
      UserRole.DRIVER,
      'DRIVER',
    );

    let previousDriverId: number | null;

    return await this.dataSource
      .transaction(async (manager) => {
        const repo = manager.getRepository(Order);
        const order = await repo.findOne({
          where: { id: orderId },
          lock: { mode: 'pessimistic_write' },
        });

        if (!order) {
          throw new NotFoundException('Order not found');
        }

        if (
          order.status === OrderStatus.DELIVERED ||
          order.status === OrderStatus.COMPLETED ||
          order.status === OrderStatus.CANCELLED
        ) {
          throw new ConflictException(
            `Cannot assign a driver to an order with status '${order.status}'`,
          );
        }

        const previousDriver = order.driverId;
        order.driverId = driver.id;
        order.driverAssignedAt = new Date();
        previousDriverId = previousDriver;

        return await repo.save(order);
      })
      .then(async (saved) => {
        // Emit outside the transaction so the write lock isn't held during the
        // broadcast's load + socket I/O.
        this.emitOrderUpdate(saved.id);
        this.sendAssignmentNotification(
          driver.id,
          saved.id,
          'driver',
          'A new delivery order has been assigned to you.',
        );
        if (previousDriverId && previousDriverId !== driver.id) {
          this.sendAssignmentNotification(
            previousDriverId,
            saved.id,
            'driver',
            'You have been unassigned from a delivery order.',
          );
        }
        return saved;
      });
  }

  async assignKitchenStaff(orderId: string, staffId: string): Promise<Order> {
    const staff = await this.getStaffOrFail(
      Number(staffId),
      UserRole.KITCHEN_STAFF,
      'KITCHEN_STAFF',
    );

    return await this.dataSource
      .transaction(async (manager) => {
        const repo = manager.getRepository(Order);
        const order = await repo.findOne({
          where: { id: orderId },
          lock: { mode: 'pessimistic_write' },
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

        const hasMenuItems =
          (await manager.getRepository(OrderItem).count({
            where: { orderId, itemType: 'menu' },
          })) > 0;
        if (!hasMenuItems) {
          throw new BadRequestException('Order has no menu items');
        }

        if (order.kitchenUserId) {
          throw new BadRequestException(
            'Kitchen staff already assigned to this order',
          );
        }

        order.kitchenUserId = staff.id;
        order.kitchenAssignedAt = new Date();

        if (order.status === OrderStatus.CONFIRMED) {
          order.status = OrderStatus.PREPARING;
        }

        return await repo.save(order);
      })
      .then(async (saved) => {
        // Emit outside the transaction so the write lock isn't held during the
        // broadcast's load + socket I/O.
        this.emitOrderUpdate(saved.id);
        this.sendAssignmentNotification(
          staff.id,
          saved.id,
          'kitchen',
          'A new kitchen task has been assigned to you.',
        );
        return saved;
      });
  }

  async assignWarehouseStaff(orderId: string, staffId: string): Promise<Order> {
    const staff = await this.getStaffOrFail(
      Number(staffId),
      UserRole.WAREHOUSE_STAFF,
      'WAREHOUSE_STAFF',
    );

    return await this.dataSource
      .transaction(async (manager) => {
        const repo = manager.getRepository(Order);
        const order = await repo.findOne({
          where: { id: orderId },
          lock: { mode: 'pessimistic_write' },
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

        const hasShopItems =
          (await manager.getRepository(OrderItem).count({
            where: { orderId, itemType: 'shop' },
          })) > 0;
        if (!hasShopItems) {
          throw new BadRequestException('Order has no shop items');
        }

        if (order.warehouseUserId && order.warehouseUserId !== staff.id) {
          throw new BadRequestException(
            'Warehouse staff already assigned to this order',
          );
        }

        order.warehouseUserId = staff.id;
        order.warehouseAssignedAt = new Date();

        if (order.status === OrderStatus.CONFIRMED) {
          order.status = OrderStatus.PREPARING;
        }

        return await repo.save(order);
      })
      .then(async (saved) => {
        // Emit outside the transaction so the write lock isn't held during the
        // broadcast's load + socket I/O.
        this.emitOrderUpdate(saved.id);
        this.sendAssignmentNotification(
          staff.id,
          saved.id,
          'warehouse',
          'A new warehouse task has been assigned to you.',
        );
        return saved;
      });
  }

  async markPrepared(
    currentUser: User,
    orderId: string,
    role?: 'kitchen' | 'warehouse',
  ): Promise<Order> {
    let targetRole: 'kitchen' | 'warehouse';

    if (currentUser.role === UserRole.SUPERADMIN) {
      if (!role) {
        throw new BadRequestException(
          'role is required when admin marks prepared',
        );
      }
      targetRole = role;
    } else if (currentUser.role === UserRole.KITCHEN_STAFF) {
      targetRole = 'kitchen';
    } else if (currentUser.role === UserRole.WAREHOUSE_STAFF) {
      targetRole = 'warehouse';
    } else {
      throw new ForbiddenException('Insufficient permissions');
    }

    const canBypassAssignment = currentUser.role === UserRole.SUPERADMIN;

    const savedOrder = await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(Order);
      const order = await repo.findOne({
        where: { id: orderId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!order) {
        throw new NotFoundException('Order not found');
      }

      if (order.status !== OrderStatus.PREPARING) {
        throw new BadRequestException('Order must be in preparing status');
      }

      const hasMenuItems =
        (await manager.getRepository(OrderItem).count({
          where: { orderId, itemType: 'menu' },
        })) > 0;
      const hasShopItems =
        (await manager.getRepository(OrderItem).count({
          where: { orderId, itemType: 'shop' },
        })) > 0;

      if (targetRole === 'kitchen') {
        if (!hasMenuItems) {
          throw new BadRequestException('Order has no menu items');
        }
        if (order.kitchenUserId !== currentUser.id && !canBypassAssignment) {
          throw new ForbiddenException('You are not assigned to this order');
        }
        order.kitchenPreparedAt = new Date();
      } else {
        if (!hasShopItems) {
          throw new BadRequestException('Order has no shop items');
        }
        if (order.warehouseUserId !== currentUser.id && !canBypassAssignment) {
          throw new ForbiddenException('You are not assigned to this order');
        }
        order.warehousePreparedAt = new Date();
      }

      const kitchenDone = !hasMenuItems || order.kitchenPreparedAt !== null;
      const warehouseDone = !hasShopItems || order.warehousePreparedAt !== null;

      if (kitchenDone && warehouseDone) {
        order.status = OrderStatus.WAITING_FOR_PICKUP;
      }

      return await repo.save(order);
    });

    if (savedOrder.status === OrderStatus.WAITING_FOR_PICKUP) {
      try {
        await this.notificationsService.sendOrderStatusNotification(
          savedOrder.customerId,
          savedOrder.id,
          OrderStatus.WAITING_FOR_PICKUP,
        );
      } catch (error) {
        console.error('Failed to send order status notification:', error);
      }

      // R2 — the assigned driver (if any) should also be told the order is
      // ready for pickup, so they can head over.
      if (savedOrder.driverId) {
        try {
          await this.notificationsService.sendOrderStatusNotification(
            savedOrder.driverId,
            savedOrder.id,
            OrderStatus.WAITING_FOR_PICKUP,
          );
        } catch (error) {
          console.error('Failed to send pickup-ready notification:', error);
        }
      }
    }

    this.emitOrderUpdate(savedOrder.id);

    return (await this.orderRepository.findOne({
      where: { id: savedOrder.id },
    })) as Order;
  }

  /** Resolves a user id into a persisted user, enforcing the expected role. */
  private async getStaffOrFail(
    userId: number,
    expectedRole: UserRole,
    roleLabel: string,
  ): Promise<User> {
    if (!Number.isInteger(userId) || userId <= 0) {
      throw new BadRequestException('Invalid user id');
    }

    const user = await this.userRepository.findOne({
      where: { id: userId, role: expectedRole },
    });

    if (!user) {
      throw new BadRequestException(
        `Provided id does not reference a user with role '${roleLabel}'`,
      );
    }

    return user;
  }

  /** `ORD-YYYYMMDD-<6 base36 chars>` — ~2.1B suffixes per day make collisions
   * practically impossible (previously `ORD-YYYYMMDD-<4 digits>` = 10k/day). */
  private generateOrderId(): string {
    const now = new Date();
    const date = `${now.getFullYear()}${(now.getMonth() + 1)
      .toString()
      .padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}`;
    const random = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `ORD-${date}-${random}`;
  }

  /**
   * Runs a transaction that creates an order, retrying on a primary-key /
   * unique constraint collision (Postgres error 23505). The `orders.id`
   * column is the PK so the database guarantees uniqueness — this retry
   * simply converts a (now very unlikely) collision into a transparent
   * regeneration instead of a 500.
   */
  private async withIdCollisionRetry<T>(run: () => Promise<T>): Promise<T> {
    const MAX_ATTEMPTS = 5;
    let lastError: unknown;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        return await run();
      } catch (error) {
        if (!this.isUniqueViolation(error)) {
          throw error;
        }
        lastError = error;
      }
    }

    throw lastError;
  }

  private isUniqueViolation(error: unknown): boolean {
    const driverError = (error as { driverError?: { code?: string } })
      ?.driverError;
    return driverError?.code === '23505';
  }

  /**
   * Pushes an assignment notification to the newly assigned staff member or
   * driver. Fire-and-forget: push failures must never break the assignment.
   */
  private async sendAssignmentNotification(
    userId: number,
    orderId: string,
    kind: 'driver' | 'kitchen' | 'warehouse',
    message: string,
  ): Promise<void> {
    try {
      await this.notificationsService.sendNotificationToUser(
        userId,
        `New ${kind} assignment`,
        message,
        {
          type: 'order',
          orderId,
        },
      );
    } catch (error) {
      console.error(`Failed to send ${kind} assignment notification:`, error);
    }
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

  /**
   * Loads a single order with every relation clients render (items, address,
   * customer, driver, kitchen/warehouse staff) so a real-time payload carries
   * everything a client needs without a follow-up API request.
   */
  private async loadOrderForBroadcast(orderId: string): Promise<Order> {
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
      relations: {
        items: true,
        address: true,
        customer: true,
        driver: true,
        kitchenUser: true,
        warehouseUser: true,
        createdBy: true,
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return this.decorateOrderItems(order);
  }

  /**
   * Emits the `order.updated` socket event to the relevant recipients after any
   * order mutation. Fire-and-forget: a failure here must never break the REST
   * flow that triggered it. Public so callers that own their own transaction
   * (e.g. cart checkout) can emit after commit.
   */
  async emitOrderUpdate(orderId: string): Promise<void> {
    try {
      const order = await this.loadOrderForBroadcast(orderId);
      this.ordersGateway.broadcastOrderUpdate(order);
    } catch (error) {
      console.error('Failed to broadcast order update:', error);
    }
  }
}
