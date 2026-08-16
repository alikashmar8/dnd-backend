/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AnalyticsService } from './analytics.service';
import { Order } from '../orders/entities/order.entity';
import { OrderItem } from '../orders/entities/order-item.entity';
import { User } from '../users/entities/user.entity';
import { Restaurant } from '../restaurants/entities/restaurant.entity';
import { MenuItem } from '../menu/entities/menu-item.entity';
import { ShopItem } from '../shop-items/entities/shop-item.entity';

const mockRepository = () => ({
  createQueryBuilder: jest.fn(),
  count: jest.fn(),
});

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let orderItemRepository: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        { provide: getRepositoryToken(Order), useFactory: mockRepository },
        { provide: getRepositoryToken(OrderItem), useFactory: mockRepository },
        { provide: getRepositoryToken(User), useFactory: mockRepository },
        { provide: getRepositoryToken(Restaurant), useFactory: mockRepository },
        { provide: getRepositoryToken(MenuItem), useFactory: mockRepository },
        { provide: getRepositoryToken(ShopItem), useFactory: mockRepository },
      ],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
    orderItemRepository = module.get(getRepositoryToken(OrderItem));
  });

  it('should aggregate top categories on orderItem.name (not a join alias)', async () => {
    let selectSql = '';
    let groupBySql = '';

    const qb = {
      select: jest.fn().mockImplementation((cols: string[]) => {
        selectSql = cols.join(', ');
        return qb;
      }),
      leftJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockImplementation((group: string) => {
        groupBySql = group;
        return qb;
      }),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([
        {
          itemName: 'Burger',
          itemType: 'menu',
          totalQuantity: '4',
          totalRevenue: '40',
          orderCount: '2',
        },
      ]),
    };

    orderItemRepository.createQueryBuilder.mockReturnValue(qb);

    const result = await service.getTopCategories(undefined, 10);

    // Regression: the select/groupBy must reference the order_item.name column,
    // not the old broken `orderItem.itemName` (no such property on OrderItem).
    expect(selectSql).toContain('orderItem.name as itemName');
    expect(selectSql).not.toContain('orderItem.itemName');
    expect(groupBySql).toContain('orderItem.name');
    expect(groupBySql).not.toContain('orderItem.itemName');
    expect(qb.where).toHaveBeenCalledWith(
      'order.status != :cancelled',
      expect.objectContaining({ cancelled: 'cancelled' }),
    );

    expect(result).toEqual([
      expect.objectContaining({
        itemName: 'Burger',
        totalQuantity: 4,
        totalRevenue: 40,
        orderCount: 2,
      }),
    ]);
  });
});
