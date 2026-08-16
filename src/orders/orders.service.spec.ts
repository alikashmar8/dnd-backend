/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/require-await */
import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { OrdersService } from './orders.service';
import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { Address } from '../addresses/entities/address.entity';
import { MenuItem } from '../menu/entities/menu-item.entity';
import { ShopItem } from '../shop-items/entities/shop-item.entity';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CreateOrderDto } from './dto/create-order.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { User } from '../users/entities/user.entity';
import { OrdersGateway } from './orders.gateway';

const mockRepository = () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  update: jest.fn(),
});

const mockDataSource = () => ({
  transaction: jest.fn(),
});

const mockNotificationsService = {
  sendPushNotification: jest.fn().mockResolvedValue(undefined),
  sendNotificationToUser: jest.fn().mockResolvedValue(true),
  sendOrderStatusNotification: jest.fn().mockResolvedValue(true),
};

const mockOrdersGateway = {
  broadcastOrderUpdate: jest.fn(),
};

// Resolved by the in-transaction Address lookup in `createOrderFromItems`.
const mockDeliveryAddress = {
  id: 1,
  title: 'Home',
  city: 'Riyadh',
  street: 'King Rd',
  description: 'Apartment 12',
  latitude: 24.7,
  longitude: 46.7,
} as any;

describe('OrdersService', () => {
  let service: OrdersService;
  let orderRepository: jest.Mocked<Repository<Order>>;
  let orderItemRepository: jest.Mocked<Repository<OrderItem>>;
  let addressRepository: jest.Mocked<Repository<Address>>;
  let menuItemRepository: jest.Mocked<Repository<MenuItem>>;
  let shopItemRepository: jest.Mocked<Repository<ShopItem>>;
  let userRepository: jest.Mocked<Repository<User>>;
  let dataSource: any;
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: getRepositoryToken(Order), useFactory: mockRepository },
        { provide: getRepositoryToken(OrderItem), useFactory: mockRepository },
        { provide: getRepositoryToken(Address), useFactory: mockRepository },
        { provide: getRepositoryToken(MenuItem), useFactory: mockRepository },
        { provide: getRepositoryToken(ShopItem), useFactory: mockRepository },
        { provide: getRepositoryToken(User), useFactory: mockRepository },
        { provide: DataSource, useFactory: mockDataSource },
        { provide: NotificationsService, useValue: mockNotificationsService },
        { provide: OrdersGateway, useValue: mockOrdersGateway },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
    orderRepository = module.get(getRepositoryToken(Order));
    orderItemRepository = module.get(getRepositoryToken(OrderItem));
    addressRepository = module.get(getRepositoryToken(Address));
    menuItemRepository = module.get(getRepositoryToken(MenuItem));
    shopItemRepository = module.get(getRepositoryToken(ShopItem));
    userRepository = module.get(getRepositoryToken(User));
    dataSource = module.get<DataSource>(DataSource);
  });

  it('should create a restaurant order', async () => {
    const userId = 1;
    const dto: CreateOrderDto = {
      customerId: userId,
      addressId: 1,
      items: [{ itemId: 1, quantity: 2 }],
    };

    const user = { id: userId, role: 'ADMIN' } as any;

    addressRepository.findOne.mockResolvedValue({ id: 1, userId } as any);
    const order = { id: 'ORD-1', customerId: userId } as any;

    const manager = {
      find: jest.fn().mockResolvedValue([
        {
          id: 1,
          available: true,
          price: 10,
          name: 'Burger',
          nameAr: null,
          image: 'img',
        },
      ]),
      findOne: jest
        .fn()
        .mockImplementation((entity: any) =>
          entity === Address
            ? Promise.resolve(mockDeliveryAddress)
            : Promise.resolve(order),
        ),
      save: jest.fn().mockResolvedValue(order),
    } as any;

    orderRepository.findOne.mockResolvedValue(order);
    orderItemRepository.create.mockReturnValue({} as any);
    orderItemRepository.save = jest.fn().mockResolvedValue({} as any);
    dataSource.transaction.mockImplementation(async (cb) => cb(manager));

    const result = await service.create(user, dto);
    expect(result).toEqual(order);
  });

  it('should notify the driver on assignment (R1)', async () => {
    const driver = { id: 9, role: 'DRIVER' } as any;
    const savedOrder = {
      id: 'ORD-1',
      driverId: 9,
      driverAssignedAt: new Date(),
    } as any;

    const userRepository = module.get(getRepositoryToken(User));
    userRepository.findOne.mockResolvedValue(driver);

    orderRepository.findOne.mockResolvedValue(savedOrder);

    dataSource.transaction.mockImplementation(async (cb) =>
      cb({
        getRepository: () => ({
          findOne: jest.fn().mockResolvedValue(savedOrder),
          save: jest.fn().mockResolvedValue(savedOrder),
        }),
      }),
    );

    await service.assignDriver('ORD-1', '9');

    expect(
      mockNotificationsService.sendNotificationToUser,
    ).toHaveBeenCalledWith(
      9,
      expect.stringContaining('assignment'),
      expect.stringContaining('delivery order'),
      expect.objectContaining({ type: 'order', orderId: 'ORD-1' }),
    );
  });

  it('should notify the driver when the order becomes ready for pickup (R2)', async () => {
    const kitchenStaff = { id: 5, role: 'kitchen_staff' } as any;
    const savedOrder = {
      id: 'ORD-1',
      customerId: 1,
      driverId: 9,
      kitchenUserId: 5,
      status: 'preparing',
      kitchenPreparedAt: new Date(),
      warehousePreparedAt: new Date(),
    } as any;

    userRepository.findOne.mockResolvedValue(kitchenStaff);

    const manager = {
      getRepository: jest.fn().mockReturnValue({
        findOne: jest.fn().mockResolvedValue(savedOrder),
        count: jest.fn().mockResolvedValue(1),
        save: jest.fn().mockResolvedValue({
          ...savedOrder,
          status: 'waiting_for_pickup',
        }),
      }),
    } as any;

    dataSource.transaction.mockImplementation(async (cb) => cb(manager));

    orderRepository.findOne.mockResolvedValue({
      ...savedOrder,
      status: 'waiting_for_pickup',
    });

    await service.markPrepared(kitchenStaff, 'ORD-1', 'kitchen');

    expect(
      mockNotificationsService.sendOrderStatusNotification,
    ).toHaveBeenCalledWith(9, 'ORD-1', 'waiting_for_pickup');
  });

  it('should lock shop-item rows while creating an order (no oversell)', async () => {
    const user = { id: 1, role: 'SUPERADMIN' } as any;
    const dto: CreateOrderDto = {
      customerId: 2,
      addressId: 1,
      items: [{ itemId: 10, quantity: 2, itemType: 'shop' }],
    };

    addressRepository.findOne.mockResolvedValue({ id: 1, userId: 2 } as any);

    const shopItem = {
      id: 10,
      available: true,
      price: 5,
      stockQuantity: 3,
      name: 'Cola',
      nameAr: null,
      image: null,
    } as any;
    const order = { id: 'ORD-1', customerId: 2 } as any;

    const manager = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockImplementation((entity: any) => {
        if (entity === Address) return Promise.resolve(mockDeliveryAddress);
        if (entity === ShopItem) return Promise.resolve(shopItem);
        return Promise.resolve(order);
      }),
      save: jest.fn().mockResolvedValue(order),
    } as any;

    orderRepository.findOne.mockResolvedValue(order);
    orderItemRepository.create.mockReturnValue({} as any);
    orderItemRepository.save = jest.fn().mockResolvedValue({} as any);
    dataSource.transaction.mockImplementation(async (cb) => cb(manager));

    await service.create(user, dto);

    expect(manager.findOne).toHaveBeenCalledWith(ShopItem, {
      where: { id: 10 },
      lock: { mode: 'pessimistic_write' },
    });
    expect(shopItem.stockQuantity).toBe(1);
  });

  it('should reject when shop stock is insufficient', async () => {
    const user = { id: 1, role: 'SUPERADMIN' } as any;
    const dto: CreateOrderDto = {
      customerId: 2,
      addressId: 1,
      items: [{ itemId: 10, quantity: 5, itemType: 'shop' }],
    };

    addressRepository.findOne.mockResolvedValue({ id: 1, userId: 2 } as any);

    const shopItem = {
      id: 10,
      available: true,
      price: 5,
      stockQuantity: 1,
      name: 'Cola',
    } as any;

    const manager = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockImplementation((entity: any) => {
        if (entity === Address) return Promise.resolve(mockDeliveryAddress);
        if (entity === ShopItem) return Promise.resolve(shopItem);
        return Promise.resolve(undefined);
      }),
      save: jest.fn(),
    } as any;

    dataSource.transaction.mockImplementation(async (cb) => cb(manager));

    await expect(service.create(user, dto)).rejects.toThrow(
      'Insufficient stock',
    );
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('should create a mixed menu + shop order', async () => {
    const user = { id: 1, role: 'SUPERADMIN' } as any;
    const dto: CreateOrderDto = {
      customerId: 2,
      addressId: 1,
      items: [
        { itemId: 1, quantity: 1, itemType: 'menu' },
        { itemId: 10, quantity: 1, itemType: 'shop' },
      ],
    };

    addressRepository.findOne.mockResolvedValue({ id: 1, userId: 2 } as any);

    const menuItem = {
      id: 1,
      available: true,
      price: 10,
      name: 'Burger',
      nameAr: null,
      image: null,
    } as any;
    const shopItem = {
      id: 10,
      available: true,
      price: 5,
      stockQuantity: 3,
      name: 'Cola',
      nameAr: null,
      image: null,
    } as any;
    const order = { id: 'ORD-1', customerId: 2 } as any;

    const manager = {
      find: jest.fn().mockResolvedValue([menuItem]),
      findOne: jest.fn().mockImplementation((entity: any) => {
        if (entity === Address) return Promise.resolve(mockDeliveryAddress);
        if (entity === ShopItem) return Promise.resolve(shopItem);
        return Promise.resolve(order);
      }),
      save: jest.fn().mockResolvedValue(order),
    } as any;

    orderRepository.findOne.mockResolvedValue(order);
    orderItemRepository.create
      .mockReturnValueOnce({ itemType: 'menu' } as any)
      .mockReturnValueOnce({ itemType: 'shop' } as any);
    orderItemRepository.save = jest.fn().mockResolvedValue({} as any);
    dataSource.transaction.mockImplementation(async (cb) => cb(manager));

    await service.create(user, dto);

    expect(orderItemRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ itemType: 'menu' }),
    );
    expect(orderItemRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ itemType: 'shop' }),
    );
  });

  it('should reject driver assignment on a completed order (state machine)', async () => {
    const driver = { id: 9, role: 'DRIVER' } as any;
    const completedOrder = { id: 'ORD-1', status: 'completed' } as any;

    const userRepository = module.get(getRepositoryToken(User));
    userRepository.findOne.mockResolvedValue(driver);

    dataSource.transaction.mockImplementation(async (cb) =>
      cb({
        getRepository: () => ({
          findOne: jest.fn().mockResolvedValue(completedOrder),
          save: jest.fn(),
        }),
      }),
    );

    await expect(service.assignDriver('ORD-1', '9')).rejects.toThrow(
      ConflictException,
    );
  });

  it('should notify the previous driver when an order is reassigned', async () => {
    const newDriver = { id: 9, role: 'DRIVER' } as any;
    const orderWithPreviousDriver = {
      id: 'ORD-1',
      driverId: 7,
      driverAssignedAt: new Date(),
    } as any;

    const userRepository = module.get(getRepositoryToken(User));
    userRepository.findOne.mockResolvedValue(newDriver);

    dataSource.transaction.mockImplementation(async (cb) =>
      cb({
        getRepository: () => ({
          findOne: jest.fn().mockResolvedValue(orderWithPreviousDriver),
          save: jest.fn().mockResolvedValue(orderWithPreviousDriver),
        }),
      }),
    );

    await service.assignDriver('ORD-1', '9');

    expect(
      mockNotificationsService.sendNotificationToUser,
    ).toHaveBeenCalledWith(
      7,
      expect.stringContaining('assignment'),
      expect.stringContaining('unassigned'),
      expect.objectContaining({ type: 'order', orderId: 'ORD-1' }),
    );
  });

  it('should quote server-side totals without creating an order', async () => {
    const user = { id: 1, role: 'SUPERADMIN' } as any;
    const dto: CreateOrderDto = {
      customerId: 2,
      addressId: 1,
      items: [
        { itemId: 1, quantity: 2, itemType: 'menu' },
        { itemId: 10, quantity: 1, itemType: 'shop' },
      ],
    };

    addressRepository.findOne.mockResolvedValue({ id: 1, userId: 2 } as any);
    menuItemRepository.find.mockResolvedValue([
      {
        id: 1,
        available: true,
        price: 10,
        name: 'Burger',
        nameAr: null,
      } as any,
    ]);
    shopItemRepository.find.mockResolvedValue([
      {
        id: 10,
        available: true,
        price: 5,
        stockQuantity: 3,
        name: 'Cola',
        nameAr: null,
      } as any,
    ]);

    const quote = await service.quoteOrder(user, dto);

    expect(quote.subtotal).toBe(25);
    expect(quote.tax).toBeCloseTo(1.25, 2);
    expect(quote.deliveryFee).toBe(5);
    expect(quote.total).toBeCloseTo(31.25, 2);
    expect(quote.items).toEqual([
      expect.objectContaining({ itemId: 1, lineTotal: 20 }),
      expect.objectContaining({ itemId: 10, lineTotal: 5 }),
    ]);
    expect(orderRepository.create).not.toHaveBeenCalled();
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('should reject a quote for an item out of stock', async () => {
    const user = { id: 1, role: 'SUPERADMIN' } as any;
    const dto: CreateOrderDto = {
      customerId: 2,
      addressId: 1,
      items: [{ itemId: 10, quantity: 5, itemType: 'shop' }],
    };

    addressRepository.findOne.mockResolvedValue({ id: 1, userId: 2 } as any);
    shopItemRepository.find.mockResolvedValue([
      {
        id: 10,
        available: true,
        price: 5,
        stockQuantity: 1,
        name: 'Cola',
      } as any,
    ]);

    await expect(service.quoteOrder(user, dto)).rejects.toThrow(
      'Insufficient stock',
    );
  });

  it('should snapshot the delivery address onto the order at creation time', async () => {
    const user = { id: 1, role: 'SUPERADMIN' } as any;
    const dto: CreateOrderDto = {
      customerId: 2,
      addressId: 1,
      items: [{ itemId: 1, quantity: 1, itemType: 'menu' }],
    };

    addressRepository.findOne.mockResolvedValue({ id: 1, userId: 2 } as any);

    const order = { id: 'ORD-1', customerId: 2 } as any;
    const manager = {
      find: jest.fn().mockResolvedValue([
        {
          id: 1,
          available: true,
          price: 10,
          name: 'Burger',
          nameAr: null,
          image: null,
        } as any,
      ]),
      findOne: jest
        .fn()
        .mockImplementation((entity: any) =>
          entity === Address
            ? Promise.resolve(mockDeliveryAddress)
            : Promise.resolve(order),
        ),
      save: jest.fn().mockResolvedValue(order),
    } as any;

    orderRepository.findOne.mockResolvedValue(order);
    orderItemRepository.create.mockReturnValue({} as any);
    orderItemRepository.save = jest.fn().mockResolvedValue({} as any);
    dataSource.transaction.mockImplementation(async (cb) => cb(manager));

    await service.create(user, dto);

    expect(orderRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        addressId: 1,
        deliveryTitle: 'Home',
        deliveryCity: 'Riyadh',
        deliveryStreet: 'King Rd',
        deliveryDescription: 'Apartment 12',
        deliveryLatitude: 24.7,
        deliveryLongitude: 46.7,
      }),
    );
  });

  it('should generate a collision-resistant order id', async () => {
    const user = { id: 1, role: 'SUPERADMIN' } as any;
    const dto: CreateOrderDto = {
      customerId: 2,
      addressId: 1,
      items: [{ itemId: 1, quantity: 1, itemType: 'menu' }],
    };

    addressRepository.findOne.mockResolvedValue({ id: 1, userId: 2 } as any);

    const order = { id: 'ORD-1', customerId: 2 } as any;
    const manager = {
      find: jest.fn().mockResolvedValue([
        {
          id: 1,
          available: true,
          price: 10,
          name: 'Burger',
          nameAr: null,
          image: null,
        } as any,
      ]),
      findOne: jest
        .fn()
        .mockImplementation((entity: any) =>
          entity === Address
            ? Promise.resolve(mockDeliveryAddress)
            : Promise.resolve(order),
        ),
      save: jest.fn().mockResolvedValue(order),
    } as any;

    orderRepository.findOne.mockResolvedValue(order);
    orderItemRepository.create.mockReturnValue({} as any);
    orderItemRepository.save = jest.fn().mockResolvedValue({} as any);
    dataSource.transaction.mockImplementation(async (cb) => cb(manager));

    await service.create(user, dto);

    expect(orderRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        id: expect.stringMatching(/^ORD-\d{8}-[A-Z0-9]{6}$/),
      }),
    );
  });

  it('should retry order creation when the generated id collides (unique violation)', async () => {
    const user = { id: 1, role: 'SUPERADMIN' } as any;
    const dto: CreateOrderDto = {
      customerId: 2,
      addressId: 1,
      items: [{ itemId: 1, quantity: 1, itemType: 'menu' }],
    };

    addressRepository.findOne.mockResolvedValue({ id: 1, userId: 2 } as any);

    const order = { id: 'ORD-1', customerId: 2 } as any;
    const manager = {
      find: jest.fn().mockResolvedValue([
        {
          id: 1,
          available: true,
          price: 10,
          name: 'Burger',
          nameAr: null,
          image: null,
        } as any,
      ]),
      findOne: jest
        .fn()
        .mockImplementation((entity: any) =>
          entity === Address
            ? Promise.resolve(mockDeliveryAddress)
            : Promise.resolve(order),
        ),
      save: jest.fn().mockResolvedValue(order),
    } as any;

    orderRepository.findOne.mockResolvedValue(order);
    orderItemRepository.create.mockReturnValue({} as any);
    orderItemRepository.save = jest.fn().mockResolvedValue({} as any);

    dataSource.transaction
      .mockImplementationOnce(async () => {
        throw { driverError: { code: '23505' } };
      })
      .mockImplementationOnce(async (cb) => cb(manager));

    await service.create(user, dto);

    expect(dataSource.transaction).toHaveBeenCalledTimes(2);
  });

  it('should not retry on non-unique-constraint errors', async () => {
    const user = { id: 1, role: 'SUPERADMIN' } as any;
    const dto: CreateOrderDto = {
      customerId: 2,
      addressId: 1,
      items: [{ itemId: 1, quantity: 1, itemType: 'menu' }],
    };

    addressRepository.findOne.mockResolvedValue({ id: 1, userId: 2 } as any);

    dataSource.transaction.mockImplementation(async () => {
      throw new Error('connection dropped');
    });

    await expect(service.create(user, dto)).rejects.toThrow(
      'connection dropped',
    );
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
  });
});
