/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AnalyticsService } from './analytics.service';
import { Order } from '../orders/entities/order.entity';
import { OrderItem } from '../orders/entities/order-item.entity';
import { User } from '../users/entities/user.entity';
import { Restaurant } from '../restaurants/entities/restaurant.entity';
import { MenuItem } from '../menu/entities/menu-item.entity';
import { ShopItem } from '../shop-items/entities/shop-item.entity';
import { ReportsQueryDto } from './dto/reports-query.dto';

const SUMMARY_ROW = {
  completedOrders: '3',
  totalRevenue: '150.75',
  averageOrderValue: '50.25',
  uniqueCustomers: '2',
};
const ITEMS_ROW = { totalItemsSold: '9' };
const SERIES_ROWS = [
  { date: '2026-07-01', orderCount: '2', revenue: '100.00' },
  { date: '2026-07-02', orderCount: '1', revenue: '50.75' },
];
const TOP_ITEM_ROWS = [
  {
    itemId: '1',
    itemType: 'menu',
    itemName: 'Burger',
    itemNameAr: null,
    quantitySold: '5',
    revenue: '60.00',
  },
  {
    itemId: '9',
    itemType: 'shop',
    itemName: 'Soda',
    itemNameAr: 'صودا',
    quantitySold: '4',
    revenue: '12.00',
  },
];
const TOTAL_ROW = { total: '2' };

function makeQb(handlers: Record<string, jest.Mock> = {}) {
  const qb = {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    offset: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    setParameters: jest.fn().mockReturnThis(),
    getRawOne: jest.fn().mockResolvedValue(undefined),
    getRawMany: jest.fn().mockResolvedValue([]),
    getQuery: jest
      .fn()
      .mockReturnValue('SELECT itemId FROM order_items GROUP BY itemId'),
    getParameters: jest.fn().mockReturnValue({}),
    ...handlers,
  };
  return qb;
}

type MockQb = ReturnType<typeof makeQb>;

describe('AnalyticsService.getOrderReports', () => {
  let service: AnalyticsService;
  let orderRepository: any;
  let orderItemRepository: any;

  // Created query builders, recorded in call order:
  // orderRepository: 0=summary (getRawOne)  1=series (getRawMany)
  let orderQbs: MockQb[] = [];
  // orderItemRepository: 0=count sub (getQuery)  1=items-sold (getRawOne)
  //   2=top-items (getRawMany)  3=count outer (getRawOne)
  let orderItemQbs: MockQb[] = [];
  // Queues feeding the createQueryBuilder mocks.
  let orderQbQueue: MockQb[] = [];
  let orderItemQbQueue: MockQb[] = [];

  const defaultQuery = () => {
    const q = new ReportsQueryDto();
    q.startDate = '2026-07-01';
    q.endDate = '2026-07-03';
    q.take = 20;
    q.skip = 0;
    return q;
  };

  const queueDefaultResponses = () => {
    orderQbQueue = [
      makeQb({ getRawOne: jest.fn().mockResolvedValue(SUMMARY_ROW) }),
      makeQb({ getRawMany: jest.fn().mockResolvedValue(SERIES_ROWS) }),
    ];
    orderItemQbQueue = [
      makeQb(),
      makeQb({ getRawOne: jest.fn().mockResolvedValue(ITEMS_ROW) }),
      makeQb({ getRawMany: jest.fn().mockResolvedValue(TOP_ITEM_ROWS) }),
      makeQb({ getRawOne: jest.fn().mockResolvedValue(TOTAL_ROW) }),
    ];
  };

  beforeEach(async () => {
    orderQbs = [];
    orderItemQbs = [];
    orderQbQueue = [];
    orderItemQbQueue = [];

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        {
          provide: getRepositoryToken(Order),
          useValue: { createQueryBuilder: jest.fn() },
        },
        {
          provide: getRepositoryToken(OrderItem),
          useValue: {
            createQueryBuilder: jest.fn(),
            manager: { createQueryBuilder: jest.fn() },
          },
        },
        { provide: getRepositoryToken(User), useValue: {} },
        { provide: getRepositoryToken(Restaurant), useValue: {} },
        { provide: getRepositoryToken(MenuItem), useValue: {} },
        { provide: getRepositoryToken(ShopItem), useValue: {} },
      ],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
    orderRepository = module.get(getRepositoryToken(Order));
    orderItemRepository = module.get(getRepositoryToken(OrderItem));

    orderRepository.createQueryBuilder.mockImplementation(() => {
      const qb = orderQbQueue.shift() ?? makeQb();
      orderQbs.push(qb);
      return qb;
    });
    orderItemRepository.createQueryBuilder.mockImplementation(() => {
      const qb = orderItemQbQueue.shift() ?? makeQb();
      orderItemQbs.push(qb);
      return qb;
    });
    orderItemRepository.manager.createQueryBuilder.mockImplementation(() => {
      const qb = orderItemQbQueue.shift() ?? makeQb();
      orderItemQbs.push(qb);
      return qb;
    });
  });

  it('should aggregate the summary entirely in the database (no getMany/find)', async () => {
    queueDefaultResponses();
    const result = await service.getOrderReports(defaultQuery());

    expect(result.summary).toEqual({
      completedOrders: 3,
      totalRevenue: 150.75,
      averageOrderValue: 50.25,
      totalItemsSold: 9,
      uniqueCustomers: 2,
      averageItemsPerOrder: 3,
    });
    expect(result.dateRange.from).toBe('2026-07-01T00:00:00.000Z');
    expect(result.dateRange.to).toBe('2026-07-04T00:00:00.000Z');

    // Aggregation happens via raw rows only — no entities are ever loaded.
    const rawOneCalls = [...orderQbs, ...orderItemQbs].reduce(
      (sum, qb) => sum + qb.getRawOne.mock.calls.length,
      0,
    );
    const rawManyCalls = [...orderQbs, ...orderItemQbs].reduce(
      (sum, qb) => sum + qb.getRawMany.mock.calls.length,
      0,
    );
    expect(rawOneCalls).toBe(3);
    expect(rawManyCalls).toBe(2);
    expect(orderRepository.find).toBeUndefined();
    expect(orderItemRepository.find).toBeUndefined();
  });

  it('should filter to completed statuses only (delivered + completed)', async () => {
    queueDefaultResponses();
    await service.getOrderReports(defaultQuery());

    const summaryQb = orderQbs[0];
    const whereCall = summaryQb.where.mock.calls.find(
      ([condition]: [string]) => condition === 'order.status IN (:...statuses)',
    );
    expect(whereCall).toBeDefined();
    const params = whereCall![1];
    expect(params.statuses).toEqual(['delivered', 'completed']);
    expect(params.statuses).not.toContain('cancelled');
    expect(params.statuses).not.toContain('pending');
    expect(params.statuses).not.toContain('confirmed');
  });

  it('should apply an exclusive upper-bound UTC date window in SQL', async () => {
    queueDefaultResponses();
    await service.getOrderReports(defaultQuery());

    const summaryQb = orderQbs[0];
    expect(summaryQb.andWhere).toHaveBeenCalledWith(
      'order.createdAt >= :from',
      { from: new Date('2026-07-01T00:00:00.000Z') },
    );
    expect(summaryQb.andWhere).toHaveBeenCalledWith('order.createdAt < :to', {
      to: new Date('2026-07-04T00:00:00.000Z'),
    });
  });

  it('should pass raw-select aliases via the quoted two-argument form', async () => {
    // Regression guard: inline `... as camelAlias` strings are emitted unquoted
    // and Postgres case-folds them, so raw rows would come back with lowercase
    // keys (completedorders) and every mapped field would read as undefined.
    queueDefaultResponses();
    await service.getOrderReports(defaultQuery());

    const [summaryQb, seriesQb] = orderQbs;
    const itemsSoldQb = orderItemQbs[1];

    expect(summaryQb.select).toHaveBeenCalledWith(
      'COUNT(*)',
      'completedOrders',
    );
    expect(summaryQb.addSelect).toHaveBeenCalledWith(
      'COALESCE(SUM(order.total), 0)',
      'totalRevenue',
    );
    expect(summaryQb.addSelect).toHaveBeenCalledWith(
      'COALESCE(AVG(order.total), 0)',
      'averageOrderValue',
    );
    expect(summaryQb.addSelect).toHaveBeenCalledWith(
      'COUNT(DISTINCT order.customerId)',
      'uniqueCustomers',
    );

    expect(itemsSoldQb.select).toHaveBeenCalledWith(
      'COALESCE(SUM(orderItem.quantity), 0)',
      'totalItemsSold',
    );

    // TO_CHAR keeps the bucket a plain YYYY-MM-DD string — DATE() is parsed by
    // the pg driver into a timezone-shifted JS Date.
    const dayExpr = "TO_CHAR(order.createdAt, 'YYYY-MM-DD')";
    expect(seriesQb.select).toHaveBeenCalledWith(dayExpr, 'date');
    expect(seriesQb.addSelect).toHaveBeenCalledWith('COUNT(*)', 'orderCount');
    expect(seriesQb.addSelect).toHaveBeenCalledWith(
      'SUM(order.total)',
      'revenue',
    );
    expect(seriesQb.groupBy).toHaveBeenCalledWith(dayExpr);
    expect(seriesQb.orderBy).toHaveBeenCalledWith(dayExpr, 'ASC');
  });

  it('should aggregate top items with SUM + GROUP BY + LIMIT/OFFSET, ordered by quantity', async () => {
    queueDefaultResponses();
    const result = await service.getOrderReports(defaultQuery());

    const topItemsQb = orderItemQbs[2];
    // Two-argument select()/addSelect() calls — TypeORM quotes these aliases,
    // which keeps Postgres from case-folding raw-row keys to lowercase.
    const selections: string[][] = [
      ...topItemsQb.select.mock.calls,
      ...topItemsQb.addSelect.mock.calls,
    ].map((call: unknown[]) => [call[0] as string, call[1] as string]);
    expect(selections).toEqual(
      expect.arrayContaining([
        ['orderItem.itemId', 'itemId'],
        ['orderItem.itemType', 'itemType'],
        ['orderItem.name', 'itemName'],
        ['orderItem.nameAr', 'itemNameAr'],
        ['SUM(orderItem.quantity)', 'quantitySold'],
        ['SUM(orderItem.price * orderItem.quantity)', 'revenue'],
      ]),
    );
    expect(topItemsQb.groupBy).toHaveBeenCalledWith(
      'orderItem.itemId, orderItem.itemType, orderItem.name, orderItem.nameAr',
    );
    expect(topItemsQb.orderBy).toHaveBeenCalledWith(
      'SUM(orderItem.quantity)',
      'DESC',
    );
    expect(topItemsQb.limit).toHaveBeenCalledWith(20);
    expect(topItemsQb.offset).toHaveBeenCalledWith(0);

    expect(result.topItems).toEqual({
      items: [
        {
          itemId: '1',
          itemType: 'menu',
          itemName: 'Burger',
          itemNameAr: null,
          quantitySold: 5,
          revenue: 60,
        },
        {
          itemId: '9',
          itemType: 'shop',
          itemName: 'Soda',
          itemNameAr: 'صودا',
          quantitySold: 4,
          revenue: 12,
        },
      ],
      total: 2,
      skip: 0,
      take: 20,
    });
  });

  it('should paginate top items via take/skip', async () => {
    queueDefaultResponses();
    const query = defaultQuery();
    query.take = 25;
    query.skip = 50;
    await service.getOrderReports(query);

    expect(orderItemQbs[2].limit).toHaveBeenCalledWith(25);
    expect(orderItemQbs[2].offset).toHaveBeenCalledWith(50);
  });

  it('should count distinct item groups for top-items pagination metadata', async () => {
    queueDefaultResponses();
    // Realistic sub-SQL so the embedded-query assertions below are meaningful.
    orderItemQbQueue[0] = makeQb({
      getQuery: jest
        .fn()
        .mockReturnValue(
          'SELECT "orderItem"."itemId" FROM "order_items" "orderItem" ' +
            'INNER JOIN "orders" "order" ON "order"."id"="orderItem"."orderId" ' +
            'WHERE order.status IN (:...statuses) ' +
            'GROUP BY "orderItem"."itemId", "orderItem"."name", itemId',
        ),
    });
    const result = await service.getOrderReports(defaultQuery());

    expect(result.topItems.total).toBe(2);
    // The grouped subquery feeds a COUNT(*), not a LIMIT-less dump.
    expect(orderItemQbs[0].groupBy).toHaveBeenCalledWith(
      'orderItem.itemId, orderItem.itemType, orderItem.name, orderItem.nameAr',
    );
    const outerFromCall = orderItemQbs[3].from.mock.calls[0] as unknown[];
    const subSql = outerFromCall[0] as string;
    expect(outerFromCall[1]).toBe('sub');
    expect(subSql).toContain('GROUP BY');
    // The embedded sub-select must carry the completed-status filter itself.
    expect(subSql).toContain('INNER JOIN');
    expect(subSql).toContain('order.status IN (:...statuses)');
    // The counter is built from an alias-less manager builder — a repository
    // builder would emit its own table beside "sub" and cross-join it,
    // multiplying COUNT(*) by every order_items row.
    expect(orderItemRepository.manager.createQueryBuilder).toHaveBeenCalled();
  });

  it('should return an empty-shaped response when no orders exist', async () => {
    orderQbQueue = [
      makeQb({ getRawOne: jest.fn().mockResolvedValue(undefined) }),
      makeQb({ getRawMany: jest.fn().mockResolvedValue([]) }),
    ];
    orderItemQbQueue = [
      makeQb(),
      makeQb({ getRawOne: jest.fn().mockResolvedValue(undefined) }),
      makeQb({ getRawMany: jest.fn().mockResolvedValue([]) }),
      makeQb({ getRawOne: jest.fn().mockResolvedValue(undefined) }),
    ];

    const result = await service.getOrderReports(defaultQuery());

    expect(result.summary).toEqual({
      completedOrders: 0,
      totalRevenue: 0,
      averageOrderValue: 0,
      totalItemsSold: 0,
      uniqueCustomers: 0,
      averageItemsPerOrder: 0,
    });
    expect(result.series).toEqual([]);
    expect(result.topItems).toEqual({
      items: [],
      total: 0,
      skip: 0,
      take: 20,
    });
  });

  it('should reject startDate after endDate', async () => {
    const query = defaultQuery();
    query.startDate = '2026-07-03';
    query.endDate = '2026-07-01';
    await expect(service.getOrderReports(query)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('should reject invalid calendar dates', async () => {
    const query = defaultQuery();
    query.startDate = '2026-13-99';
    await expect(service.getOrderReports(query)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('should reject ranges longer than the maximum window', async () => {
    const query = defaultQuery();
    query.startDate = '2026-01-01';
    query.endDate = '2027-12-31';
    await expect(service.getOrderReports(query)).rejects.toThrow(
      BadRequestException,
    );
  });
});
