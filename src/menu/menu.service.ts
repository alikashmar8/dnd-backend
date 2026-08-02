import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MenuItem } from './entities/menu-item.entity.js';
import { MenuCategory } from './entities/menu-category.entity.js';
import { Restaurant } from '../restaurants/entities/restaurant.entity.js';
import { GetMenuItemsQueryDto } from './dto/get-menu-items-query.dto.js';
import { CreateMenuItemDto } from './dto/create-menu-item.dto';
import { UpdateMenuItemDto } from './dto/update-menu-item.dto.js';
import { CreateMenuCategoryDto } from './dto/create-menu-category.dto';
import { UpdateMenuCategoryDto } from './dto/update-menu-category.dto';
import { User } from '../users/entities/user.entity.js';
import { UserRole } from '../enums/user-role.enum.js';

@Injectable()
export class MenuService {
  constructor(
    @InjectRepository(MenuItem)
    private readonly menuItemRepository: Repository<MenuItem>,
    @InjectRepository(MenuCategory)
    private readonly menuCategoryRepository: Repository<MenuCategory>,
    @InjectRepository(Restaurant)
    private readonly restaurantRepository: Repository<Restaurant>,
  ) {}

  async findItems(currentUser: User, query: GetMenuItemsQueryDto) {
    const skip = query.skip ?? 0;
    const take = query.take ?? 20;

    const qb = this.menuItemRepository
      .createQueryBuilder('menuItem')
      .leftJoinAndSelect('menuItem.category', 'category')
      .leftJoinAndSelect('menuItem.restaurant', 'restaurant');

    if (currentUser.role !== UserRole.ADMIN) {
      qb.andWhere('menuItem.available = true');
      qb.andWhere('restaurant.isActive = true');
    }

    if (query.type) {
      qb.andWhere('restaurant.mealType = :mealType', { mealType: query.type });
    }

    if (query.restaurantId) {
      qb.andWhere('menuItem.restaurantId = :restaurantId', {
        restaurantId: query.restaurantId,
      });
    }

    if (query.search) {
      const search = `%${query.search.trim().toLowerCase()}%`;
      qb.andWhere(
        '(LOWER(menuItem.name) LIKE :search OR LOWER(menuItem.description) LIKE :search OR LOWER(restaurant.name) LIKE :search)',
        { search },
      );
    }

    if (query.price) {
      if (query.price === '<25') {
        qb.andWhere('menuItem.price < 25');
      } else if (query.price === '25-45') {
        qb.andWhere('menuItem.price BETWEEN 25 AND 45');
      } else if (query.price === '>45') {
        qb.andWhere('menuItem.price > 45');
      }
    }

    if (query.rating) {
      const minRating = Number(query.rating.replace('+', ''));
      qb.andWhere('menuItem.rating >= :minRating', { minRating });
    }

    if (query.prepTime) {
      qb.andWhere('menuItem.prepTimeMinutes <= :prepTime', {
        prepTime: Number(query.prepTime),
      });
    }

    if (query.dietary) {
      qb.andWhere(
        ':dietary = ANY(string_to_array(menuItem.dietaryTags, ","))',
        { dietary: query.dietary },
      );
    }

    if (query.categoryId) {
      const categoryIds = await this.collectCategoryAndDescendants(
        query.categoryId,
      );
      qb.andWhere('menuItem.categoryId IN (:...categoryIds)', {
        categoryIds,
      });
    }

    const [items, total] = await qb
      .skip(skip)
      .take(take)
      .orderBy('menuItem.createdAt', 'DESC')
      .getManyAndCount();

    return { items, total, skip, take };
  }

  async findItem(currentUser: User, id: number) {
    const item = await this.menuItemRepository.findOne({
      where: { id },
      relations: {
        category: true,
        restaurant: true,
      },
    });

    if (!item) {
      throw new NotFoundException('Menu item not found');
    }

    if (
      currentUser.role !== UserRole.ADMIN &&
      (!item.available || item.restaurant?.isActive === false)
    ) {
      throw new NotFoundException('Menu item not available');
    }

    return item;
  }

  async createItem(dto: CreateMenuItemDto): Promise<MenuItem> {
    const category = await this.menuCategoryRepository.findOne({
      where: { id: dto.categoryId },
    });
    if (!category) throw new NotFoundException('Menu category not found');

    const item = this.menuItemRepository.create(dto);
    return this.menuItemRepository.save(item);
  }

  async updateItem(id: number, data: UpdateMenuItemDto): Promise<MenuItem> {
    const item = await this.menuItemRepository.findOne({ where: { id } });
    if (!item) throw new NotFoundException('Menu item not found');
    Object.assign(item, data);
    return this.menuItemRepository.save(item);
  }

  async deleteItem(id: number): Promise<void> {
    const item = await this.menuItemRepository.findOne({ where: { id } });
    if (!item) throw new NotFoundException('Menu item not found');
    await this.menuItemRepository.remove(item);
  }

  async findCategories(currentUser: User): Promise<MenuCategory[]> {
    const categories = await this.menuCategoryRepository.find({
      select: {
        id: true,
        name: true,
        nameAr: true,
        sortOrder: true,
        image: true,
        parentId: true,
      },
    });

    const countRows = await this.menuItemRepository
      .createQueryBuilder('item')
      .select('item.categoryId', 'categoryId')
      .addSelect('COUNT(*)', 'count')
      .groupBy('item.categoryId')
      .getRawMany<{ categoryId: string | number; count: string | number }>();

    const countByCategory = new Map<number, number>();
    for (const row of countRows) {
      countByCategory.set(Number(row.categoryId), Number(row.count));
    }

    const tree = this.buildCategoryTree(categories);
    this.attachItemCounts(tree, countByCategory);

    if (currentUser.role === UserRole.ADMIN) {
      return tree;
    }

    const visibleCategoryIds = await this.findVisibleCategoryIds();
    return this.filterVisibleCategories(tree, visibleCategoryIds);
  }

  async createCategory(dto: CreateMenuCategoryDto): Promise<MenuCategory> {
    if (dto.parentId) {
      await this.assertCategoryExists(dto.parentId);
    }

    const category = this.menuCategoryRepository.create({
      ...dto,
      parentId: dto.parentId ?? null,
    });
    return this.menuCategoryRepository.save(category);
  }

  async updateCategory(
    id: number,
    dto: UpdateMenuCategoryDto,
  ): Promise<MenuCategory> {
    const category = await this.menuCategoryRepository.findOne({
      where: { id },
    });
    if (!category) throw new NotFoundException('Menu category not found');

    if (dto.parentId !== undefined && dto.parentId !== null) {
      await this.assertCategoryExists(dto.parentId);
      await this.assertNoCycle(id, dto.parentId);
    }

    Object.assign(category, dto);
    return this.menuCategoryRepository.save(category);
  }

  async deleteCategory(id: number): Promise<void> {
    const category = await this.menuCategoryRepository.findOne({
      where: { id },
      relations: { children: true },
    });
    if (!category) throw new NotFoundException('Menu category not found');

    if (category.children && category.children.length > 0) {
      throw new BadRequestException(
        'Cannot delete a category that has subcategories. Delete or move its subcategories first.',
      );
    }

    await this.menuCategoryRepository.remove(category);
  }

  private async assertCategoryExists(id: number): Promise<void> {
    const exists = await this.menuCategoryRepository.exists({
      where: { id },
    });
    if (!exists) throw new NotFoundException('Menu category not found');
  }

  private async assertNoCycle(id: number, parentId: number): Promise<void> {
    if (id === parentId) {
      throw new BadRequestException('A category cannot be its own parent');
    }

    let currentParentId: number | null = parentId;
    const seen = new Set<number>();

    while (currentParentId !== null && currentParentId !== undefined) {
      if (currentParentId === id) {
        throw new BadRequestException(
          'Cannot move a category under one of its own subcategories',
        );
      }
      if (seen.has(currentParentId)) {
        break;
      }
      seen.add(currentParentId);

      const parent = await this.menuCategoryRepository.findOne({
        where: { id: currentParentId },
        select: { id: true, parentId: true },
      });
      if (!parent) break;
      currentParentId = parent.parentId ?? null;
    }
  }

  private async collectCategoryAndDescendants(id: number): Promise<number[]> {
    const categories = await this.menuCategoryRepository.find({
      select: { id: true, parentId: true },
    });

    const ids = new Set<number>([id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const category of categories) {
        if (
          category.parentId !== null &&
          category.parentId !== undefined &&
          ids.has(category.parentId) &&
          !ids.has(category.id)
        ) {
          ids.add(category.id);
          changed = true;
        }
      }
    }

    return [...ids];
  }

  private buildCategoryTree(categories: MenuCategory[]): MenuCategory[] {
    const nodes = new Map<number, MenuCategory>();
    const roots: MenuCategory[] = [];

    for (const category of categories) {
      nodes.set(category.id, { ...category, children: [] });
    }

    for (const node of nodes.values()) {
      if (node.parentId && nodes.has(node.parentId)) {
        nodes.get(node.parentId)!.children!.push(node);
      } else {
        roots.push(node);
      }
    }

    this.sortCategoryTree(roots);
    return roots;
  }

  private sortCategoryTree(nodes: MenuCategory[]): void {
    nodes.sort(
      (a, b) =>
        a.sortOrder - b.sortOrder || (a.name ?? '').localeCompare(b.name ?? ''),
    );
    for (const node of nodes) {
      if (node.children?.length) {
        this.sortCategoryTree(node.children);
      }
    }
  }

  private async findVisibleCategoryIds(): Promise<Set<number>> {
    const rows = await this.menuItemRepository
      .createQueryBuilder('item')
      .leftJoin('item.restaurant', 'restaurant')
      .select('item.categoryId', 'categoryId')
      .where('item.available = :available', { available: true })
      .andWhere('(restaurant.id IS NULL OR restaurant.isActive = :isActive)', {
        isActive: true,
      })
      .getRawMany<{ categoryId: string | number }>();

    return new Set(rows.map((row) => Number(row.categoryId)));
  }

  private filterVisibleCategories(
    nodes: MenuCategory[],
    visibleCategoryIds: Set<number>,
  ): MenuCategory[] {
    const result: MenuCategory[] = [];
    for (const node of nodes) {
      const visibleChildren = node.children?.length
        ? this.filterVisibleCategories(node.children, visibleCategoryIds)
        : [];
      const selfVisible = visibleCategoryIds.has(node.id);
      if (selfVisible || visibleChildren.length > 0) {
        result.push({ ...node, children: visibleChildren });
      }
    }
    return result;
  }

  private attachItemCounts(
    nodes: MenuCategory[],
    countByCategory: Map<number, number>,
  ): void {
    for (const node of nodes) {
      node.itemCount = countByCategory.get(node.id) ?? 0;
      if (node.children?.length) {
        this.attachItemCounts(node.children, countByCategory);
      }
    }
  }
}
