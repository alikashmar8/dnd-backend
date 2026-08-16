/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/require-await */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ShopItemsService } from './shop-items.service';
import { ShopItem } from './entities/shop-item.entity';
import { ShopCategory } from './entities/shop-category.entity';
import { UserRole } from '../enums/user-role.enum';

const mockRepository = () => ({
  findOne: jest.fn(),
  find: jest.fn(),
  exists: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  remove: jest.fn(),
  createQueryBuilder: jest.fn(),
});

function buildQueryBuilderMock(records: Partial<ShopItem>[], total: number) {
  const conditions: string[] = [];
  const params: Record<string, unknown> = {};

  const qb: any = {
    leftJoinAndSelect: jest.fn(() => qb),
    andWhere: jest.fn((sql: string, p?: Record<string, unknown>) => {
      conditions.push(sql);
      Object.assign(params, p ?? {});
      return qb;
    }),
    orderBy: jest.fn(() => qb),
    addOrderBy: jest.fn(() => qb),
    skip: jest.fn(() => qb),
    take: jest.fn(() => qb),
    getManyAndCount: jest.fn(async () => [records, total]),
  };

  return { qb, conditions, params };
}

describe('ShopItemsService', () => {
  let service: ShopItemsService;
  let shopCategoryRepository: jest.Mocked<Repository<ShopCategory>>;

  const customer = { id: 1, role: UserRole.CUSTOMER } as any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShopItemsService,
        { provide: getRepositoryToken(ShopItem), useFactory: mockRepository },
        {
          provide: getRepositoryToken(ShopCategory),
          useFactory: mockRepository,
        },
      ],
    }).compile();

    service = module.get<ShopItemsService>(ShopItemsService);
    shopCategoryRepository = module.get(getRepositoryToken(ShopCategory));
  });

  describe('findAll', () => {
    it('combines availability, price range, rating and category filters', async () => {
      shopCategoryRepository.find.mockResolvedValue([
        { id: 1, parentId: null },
        { id: 2, parentId: 1 },
      ] as any);

      const { qb, conditions, params } = buildQueryBuilderMock([], 0);
      (service as any).shopItemRepository.createQueryBuilder.mockReturnValue(
        qb,
      );

      await service.findAll(customer, {
        categoryId: 1,
        minPrice: 5,
        maxPrice: 15,
        minRating: 4,
        availability: 'Low Stock',
      } as any);

      expect(conditions).toContain('item.categoryId IN (:...categoryIds)');
      expect(conditions).toContain('item.price >= :minPrice');
      expect(conditions).toContain('item.price <= :maxPrice');
      expect(conditions).toContain('item.rating >= :minRating');
      expect(conditions).toContain(
        'item.stockQuantity > 0 AND item.stockQuantity <= 5',
      );
      expect(params.categoryIds).toEqual([1, 2]);
    });

    it('enforces availability for customers only', async () => {
      const customerQb = buildQueryBuilderMock([], 0);
      (service as any).shopItemRepository.createQueryBuilder.mockReturnValue(
        customerQb.qb,
      );
      await service.findAll(customer, {});
      expect(customerQb.conditions).toContain('item.available = true');

      const adminQb = buildQueryBuilderMock([], 0);
      (service as any).shopItemRepository.createQueryBuilder.mockReturnValue(
        adminQb.qb,
      );
      await service.findAll({ role: UserRole.SUPERADMIN } as any, {});
      expect(adminQb.conditions).not.toContain('item.available = true');
    });

    it('sorts by rating when sort=popular', async () => {
      const { qb } = buildQueryBuilderMock([], 0);
      (service as any).shopItemRepository.createQueryBuilder.mockReturnValue(
        qb,
      );

      await service.findAll(customer, { sort: 'popular' } as any);
      expect(qb.orderBy).toHaveBeenCalledWith('item.rating', 'DESC');
    });

    it('filters featured new and popular items', async () => {
      const { qb, conditions } = buildQueryBuilderMock([], 0);
      (service as any).shopItemRepository.createQueryBuilder.mockReturnValue(
        qb,
      );

      await service.findAll(customer, {
        is_new_item: true,
        is_popular_item: true,
      } as any);

      expect(conditions).toContain('item.isNewItem = true');
      expect(conditions).toContain('item.isPopularItem = true');
    });

    it('ignores featured flags when false or omitted', async () => {
      const { qb, conditions } = buildQueryBuilderMock([], 0);
      (service as any).shopItemRepository.createQueryBuilder.mockReturnValue(
        qb,
      );

      await service.findAll(customer, {
        is_new_item: false,
        is_popular_item: false,
      } as any);

      expect(conditions).not.toContain('item.isNewItem = true');
      expect(conditions).not.toContain('item.isPopularItem = true');
    });
  });

  describe('findCategories', () => {
    it('returns the full tree for superadmin', async () => {
      shopCategoryRepository.find.mockResolvedValue([
        { id: 1, name: 'Dairy', parentId: null },
        { id: 2, name: 'Milk', parentId: 1 },
      ] as any);
      const countRows = [{ categoryId: '2', count: '3' }];
      (service as any).shopItemRepository.createQueryBuilder.mockImplementation(
        () => ({
          select: () => ({
            addSelect: () => ({
              groupBy: () => ({ getRawMany: async () => countRows }),
            }),
          }),
        }),
      );

      const result = await service.findCategories({
        role: UserRole.SUPERADMIN,
      } as any);

      expect(result).toHaveLength(1);
      expect(result[0].children).toHaveLength(1);
      expect(result[0].itemCount).toBe(0);
      expect(result[0].children![0].itemCount).toBe(3);
    });

    it('filters the tree to categories with visible (available) items for customers', async () => {
      shopCategoryRepository.find.mockResolvedValue([
        { id: 1, name: 'Dairy', parentId: null },
        { id: 2, name: 'Milk', parentId: 1 },
        { id: 3, name: 'Hidden', parentId: null },
      ] as any);
      const countRows = [
        { categoryId: '1', count: '1' },
        { categoryId: '2', count: '2' },
        { categoryId: '3', count: '5' },
      ];

      const visibleRows = [{ categoryId: '2' }];
      let queryMode: 'count' | 'visible' = 'count';
      (service as any).shopItemRepository.createQueryBuilder.mockImplementation(
        () => ({
          select: () => ({
            addSelect: () => ({
              groupBy: () => ({
                getRawMany: async () =>
                  queryMode === 'count' ? countRows : visibleRows,
              }),
            }),
            where: () => ({
              getRawMany: async () => {
                queryMode = 'visible';
                return visibleRows;
              },
            }),
          }),
        }),
      );

      const result = await service.findCategories(customer);

      // Category 3 has items but none visible -> pruned; root kept for visible child.
      expect(result.map((c) => c.name)).toEqual(['Dairy']);
      expect(result[0].children!.map((c) => c.name)).toEqual(['Milk']);
    });
  });
});
