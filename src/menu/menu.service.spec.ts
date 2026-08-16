/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/require-await */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MenuService } from './menu.service';
import { MenuItem } from './entities/menu-item.entity';
import { MenuCategory } from './entities/menu-category.entity';
import { Restaurant } from '../restaurants/entities/restaurant.entity';
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

function buildQueryBuilderMock(records: Partial<MenuItem>[], total: number) {
  const conditions: string[] = [];
  const params: Record<string, unknown> = {};
  const orderBy: string[] = [];

  const qb: any = {
    leftJoinAndSelect: jest.fn(() => qb),
    andWhere: jest.fn((sql: string, p?: Record<string, unknown>) => {
      conditions.push(sql);
      Object.assign(params, p ?? {});
      return qb;
    }),
    orderBy: jest.fn((col: string) => {
      orderBy.push(`${col} DESC`);
      return qb;
    }),
    addOrderBy: jest.fn((col: string) => {
      orderBy.push(`${col} DESC`);
      return qb;
    }),
    skip: jest.fn(() => qb),
    take: jest.fn(() => qb),
    getManyAndCount: jest.fn(async () => [records, total]),
  };

  return { qb, conditions, params, orderBy };
}

describe('MenuService.findItems', () => {
  let service: MenuService;
  let menuCategoryRepository: jest.Mocked<Repository<MenuCategory>>;

  const customer = { id: 1, role: UserRole.CUSTOMER } as any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MenuService,
        { provide: getRepositoryToken(MenuItem), useFactory: mockRepository },
        {
          provide: getRepositoryToken(MenuCategory),
          useFactory: mockRepository,
        },
        { provide: getRepositoryToken(Restaurant), useFactory: mockRepository },
      ],
    }).compile();

    service = module.get<MenuService>(MenuService);
    menuCategoryRepository = module.get(getRepositoryToken(MenuCategory));
  });

  it('applies customer visibility rules', async () => {
    const { qb } = buildQueryBuilderMock([], 0);
    (service as any).menuItemRepository.createQueryBuilder.mockReturnValue(qb);

    await service.findItems(customer, {});

    expect(qb.andWhere).toHaveBeenCalledWith('menuItem.available = true');
    expect(qb.andWhere).toHaveBeenCalledWith(
      '(restaurant.id IS NULL OR restaurant.isActive = true)',
    );
  });

  it('does not apply customer visibility rules for superadmin', async () => {
    const { qb } = buildQueryBuilderMock([], 0);
    (service as any).menuItemRepository.createQueryBuilder.mockReturnValue(qb);

    await service.findItems({ role: UserRole.SUPERADMIN } as any, {});

    expect(qb.andWhere).not.toHaveBeenCalledWith('menuItem.available = true');
  });

  it('combines numeric price range and min rating filters', async () => {
    const { qb, conditions, params } = buildQueryBuilderMock([], 0);
    (service as any).menuItemRepository.createQueryBuilder.mockReturnValue(qb);

    await service.findItems(customer, {
      minPrice: 10,
      maxPrice: 20,
      minRating: 4,
    } as any);

    expect(conditions).toContain('menuItem.price >= :minPrice');
    expect(conditions).toContain('menuItem.price <= :maxPrice');
    expect(conditions).toContain('menuItem.rating >= :minRatingNum');
    expect(params).toMatchObject({
      minPrice: 10,
      maxPrice: 20,
      minRatingNum: 4,
    });
  });

  it('sorts by rating when sort=popular and by createdAt otherwise', async () => {
    const popular = buildQueryBuilderMock([], 0);
    (service as any).menuItemRepository.createQueryBuilder.mockReturnValue(
      popular.qb,
    );
    await service.findItems(customer, { sort: 'popular' } as any);
    expect(popular.qb.orderBy).toHaveBeenCalledWith('menuItem.rating', 'DESC');
    expect(popular.qb.addOrderBy).toHaveBeenCalledWith(
      'menuItem.createdAt',
      'DESC',
    );

    const newest = buildQueryBuilderMock([], 0);
    (service as any).menuItemRepository.createQueryBuilder.mockReturnValue(
      newest.qb,
    );
    await service.findItems(customer, {});
    expect(newest.qb.orderBy).toHaveBeenCalledWith(
      'menuItem.createdAt',
      'DESC',
    );
    expect(newest.qb.addOrderBy).not.toHaveBeenCalled();
  });

  it('filters by dietary using a parameterized delimiter (no SQL literal bug)', async () => {
    const { qb, params } = buildQueryBuilderMock([], 0);
    (service as any).menuItemRepository.createQueryBuilder.mockReturnValue(qb);

    await service.findItems(customer, { dietary: 'Vegan' } as any);

    expect(qb.andWhere).toHaveBeenCalledWith(
      ':dietary = ANY(string_to_array(menuItem.dietaryTags, :delimiter))',
      { dietary: 'Vegan', delimiter: ',' },
    );
    expect(params).toMatchObject({ dietary: 'Vegan', delimiter: ',' });
  });

  it('combines meal type with dietary filter', async () => {
    const { qb, params } = buildQueryBuilderMock([], 0);
    (service as any).menuItemRepository.createQueryBuilder.mockReturnValue(qb);

    await service.findItems(customer, {
      type: 'Homemade',
      dietary: 'Vegan',
    } as any);

    expect(qb.andWhere).toHaveBeenCalledWith(
      'restaurant.mealType = :mealType',
      {
        mealType: 'Homemade',
      },
    );
    expect(qb.andWhere).toHaveBeenCalledWith(
      ':dietary = ANY(string_to_array(menuItem.dietaryTags, :delimiter))',
      { dietary: 'Vegan', delimiter: ',' },
    );
    expect(params).toMatchObject({
      mealType: 'Homemade',
      dietary: 'Vegan',
      delimiter: ',',
    });
  });

  it('filters by category and its descendants using the shared util', async () => {
    menuCategoryRepository.find.mockResolvedValue([
      { id: 1, parentId: null },
      { id: 2, parentId: 1 },
      { id: 3, parentId: 2 },
    ] as any);

    const { qb, params } = buildQueryBuilderMock([], 0);
    (service as any).menuItemRepository.createQueryBuilder.mockReturnValue(qb);

    await service.findItems(customer, { categoryId: 1 } as any);

    expect(qb.andWhere).toHaveBeenCalledWith(
      'menuItem.categoryId IN (:...categoryIds)',
      { categoryIds: [1, 2, 3] },
    );
    expect(params.categoryIds).toEqual([1, 2, 3]);
  });

  it('returns pagination metadata', async () => {
    const { qb } = buildQueryBuilderMock([{ id: 1 }], 1);
    (service as any).menuItemRepository.createQueryBuilder.mockReturnValue(qb);

    const result = await service.findItems(customer, { skip: 0, take: 5 });

    expect(result).toEqual({ items: [{ id: 1 }], total: 1, skip: 0, take: 5 });
  });

  it('filters featured daily dishes and healthy items', async () => {
    const { qb, conditions } = buildQueryBuilderMock([], 0);
    (service as any).menuItemRepository.createQueryBuilder.mockReturnValue(qb);

    await service.findItems(customer, {
      is_daily_dish: true,
      is_healthy_item: true,
    } as any);

    expect(conditions).toContain('menuItem.isDailyDish = true');
    expect(conditions).toContain('menuItem.isHealthyItem = true');
  });

  it('ignores featured flags when false or omitted', async () => {
    const { qb, conditions } = buildQueryBuilderMock([], 0);
    (service as any).menuItemRepository.createQueryBuilder.mockReturnValue(qb);

    await service.findItems(customer, {
      is_daily_dish: false,
      is_healthy_item: false,
    } as any);

    expect(conditions).not.toContain('menuItem.isDailyDish = true');
    expect(conditions).not.toContain('menuItem.isHealthyItem = true');
  });
});
