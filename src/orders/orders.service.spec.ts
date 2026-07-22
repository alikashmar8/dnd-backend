import { Test, TestingModule } from '@nestjs/testing';
import { DataSource, Repository } from 'typeorm';
import { OrdersService } from './orders.service';
import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { Address } from '../addresses/entities/address.entity';
import { MenuItem } from '../menu/entities/menu-item.entity';
import { ShopItem } from '../shop-items/entities/shop-item.entity';
import { Restaurant } from '../restaurants/entities/restaurant.entity';
import { getRepositoryToken } from '@nestjs/typeorm';
import { OrderSource } from './entities/order.entity';
import { CreateOrderDto } from './dto/create-order.dto';
import { NotificationsService } from '../notifications/notifications.service';

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
};

describe('OrdersService', () => {
  let service: OrdersService;
  let orderRepository: jest.Mocked<Repository<Order>>;
  let orderItemRepository: jest.Mocked<Repository<OrderItem>>;
  let addressRepository: jest.Mocked<Repository<Address>>;
  let restaurantRepository: jest.Mocked<Repository<Restaurant>>;
  let menuItemRepository: jest.Mocked<Repository<MenuItem>>;
  let shopItemRepository: jest.Mocked<Repository<ShopItem>>;
  let dataSource: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: getRepositoryToken(Order), useFactory: mockRepository },
        { provide: getRepositoryToken(OrderItem), useFactory: mockRepository },
        { provide: getRepositoryToken(Address), useFactory: mockRepository },
        { provide: getRepositoryToken(MenuItem), useFactory: mockRepository },
        { provide: getRepositoryToken(ShopItem), useFactory: mockRepository },
        { provide: getRepositoryToken(Restaurant), useFactory: mockRepository },
        { provide: DataSource, useFactory: mockDataSource },
        { provide: NotificationsService, useValue: mockNotificationsService },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
    orderRepository = module.get(getRepositoryToken(Order));
    orderItemRepository = module.get(getRepositoryToken(OrderItem));
    addressRepository = module.get(getRepositoryToken(Address));
    restaurantRepository = module.get(getRepositoryToken(Restaurant));
    menuItemRepository = module.get(getRepositoryToken(MenuItem));
    shopItemRepository = module.get(getRepositoryToken(ShopItem));
    dataSource = module.get<DataSource>(DataSource);
  });

  it('should create a restaurant order', async () => {
    const userId = 1;
    const dto: CreateOrderDto = {
      customerId: userId,
      source: OrderSource.RESTAURANT,
      restaurantId: 1,
      addressId: 1,
      items: [{ itemId: 1, quantity: 2 }],
    };

    const user = { id: userId, role: 'ADMIN' } as any;

    addressRepository.findOne.mockResolvedValue({ id: 1, userId } as any);
    const order = { id: 'ORD-1', customerId: userId } as any;

    const manager = {
      findOne: jest
        .fn()
        .mockResolvedValueOnce({ id: 1 } as any) // restaurant
        .mockResolvedValueOnce({
          id: 1,
          available: true,
          restaurant: { id: 1 },
          price: 5,
          name: 'Test',
          image: 'img.jpg',
        } as any),
      save: jest.fn().mockResolvedValue(order),
    } as any;

    orderRepository.findOne.mockResolvedValue(order);
    orderItemRepository.create.mockReturnValue({} as any);
    orderItemRepository.save = jest.fn().mockResolvedValue({} as any);
    dataSource.transaction.mockImplementation(async (cb) => cb(manager));

    const result = await service.create(user, dto);
    expect(result).toEqual(order);
  });
});
