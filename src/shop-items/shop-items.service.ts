import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { ShopItem } from './entities/shop-item.entity';
import { ShopCategory } from './entities/shop-category.entity';
import { GetShopItemsQueryDto } from './dto/get-shop-items-query.dto';
import { UpdateShopItemDto } from './dto/update-shop-item.dto';
import { CreateShopItemDto } from './dto/create-shop-item.dto';
import { CreateShopCategoryDto } from './dto/create-shop-category.dto';
import { UpdateShopCategoryDto } from './dto/update-shop-category.dto';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../enums/user-role.enum';

@Injectable()
export class ShopItemsService {
  constructor(
    @InjectRepository(ShopItem)
    private readonly shopItemRepository: Repository<ShopItem>,
    @InjectRepository(ShopCategory)
    private readonly shopCategoryRepository: Repository<ShopCategory>,
  ) {}

  async findAll(
    currentUser: User,
    query: GetShopItemsQueryDto,
  ): Promise<{
    items: ShopItem[];
    total: number;
    skip: number;
    take: number;
  }> {
    const qb = this.shopItemRepository
      .createQueryBuilder('item')
      .leftJoinAndSelect('item.category', 'category');

    if (currentUser.role !== UserRole.ADMIN) {
      qb.andWhere('item.available = true');
    }

    if (query.category) {
      qb.andWhere('LOWER(category.name) = LOWER(:category)', {
        category: query.category,
      });
    }

    if (query.categoryId) {
      const categoryIds = await this.collectCategoryAndDescendants(
        query.categoryId,
      );
      qb.andWhere('item.categoryId IN (:...categoryIds)', {
        categoryIds,
      });
    }

    if (query.search) {
      qb.andWhere(
        '(LOWER(item.name) LIKE LOWER(:search) OR LOWER(item.description) LIKE LOWER(:search))',
        { search: `%${query.search}%` },
      );
    }

    if (query.price) {
      if (query.price === '<10') {
        qb.andWhere('item.price < 10');
      } else if (query.price === '10-20') {
        qb.andWhere('item.price BETWEEN 10 AND 20');
      } else if (query.price === '>20') {
        qb.andWhere('item.price > 20');
      }
    }

    if (query.availability) {
      if (query.availability === 'In Stock') {
        qb.andWhere('item.stockQuantity > 0');
      } else if (query.availability === 'Low Stock') {
        qb.andWhere('item.stockQuantity > 0 AND item.stockQuantity <= 5');
      } else if (query.availability === 'Out of Stock') {
        qb.andWhere('item.stockQuantity = 0');
      }
    }

    if (query.dietary) {
      qb.andWhere('LOWER(item.dietaryTags) LIKE LOWER(:dietary)', {
        dietary: `%${query.dietary}%`,
      });
    }

    const skip = query.skip ?? 0;
    const take = query.take ?? 20;
    const [items, total] = await qb
      .orderBy('item.createdAt', 'DESC')
      .skip(skip)
      .take(take)
      .getManyAndCount();

    return { items, total, skip, take };
  }

  async findOne(currentUser: User, id: number): Promise<ShopItem> {
    const where: FindOptionsWhere<ShopItem> = { id };
    if (currentUser.role !== UserRole.ADMIN) {
      where.available = true;
    }

    const item = await this.shopItemRepository.findOne({
      where,
      relations: {
        category: true,
      },
    });

    if (!item) {
      throw new NotFoundException('Shop item not found or unavailable');
    }

    return item;
  }

  async createItem(dto: CreateShopItemDto): Promise<ShopItem> {
    const category = await this.shopCategoryRepository.findOne({
      where: { id: dto.categoryId },
    });
    if (!category) throw new NotFoundException('Shop category not found');

    const item = this.shopItemRepository.create(dto);
    return this.shopItemRepository.save(item);
  }

  async updateItem(id: number, data: UpdateShopItemDto): Promise<ShopItem> {
    const item = await this.shopItemRepository.findOne({ where: { id } });
    if (!item) throw new NotFoundException('Shop item not found');
    Object.assign(item, data);
    return this.shopItemRepository.save(item);
  }

  async deleteItem(id: number): Promise<void> {
    const item = await this.shopItemRepository.findOne({ where: { id } });
    if (!item) throw new NotFoundException('Shop item not found');
    await this.shopItemRepository.remove(item);
  }

  async findCategories(): Promise<ShopCategory[]> {
    const categories = await this.shopCategoryRepository.find({
      select: {
        id: true,
        name: true,
        nameAr: true,
        sortOrder: true,
        image: true,
        parentId: true,
      },
    });

    const countRows = await this.shopItemRepository
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
    return tree;
  }

  async createCategory(dto: CreateShopCategoryDto): Promise<ShopCategory> {
    if (dto.parentId) {
      await this.assertCategoryExists(dto.parentId);
    }

    const category = this.shopCategoryRepository.create({
      ...dto,
      parentId: dto.parentId ?? null,
    });
    return this.shopCategoryRepository.save(category);
  }

  async updateCategory(
    id: number,
    dto: UpdateShopCategoryDto,
  ): Promise<ShopCategory> {
    const category = await this.shopCategoryRepository.findOne({
      where: { id },
    });
    if (!category) throw new NotFoundException('Shop category not found');

    if (dto.parentId !== undefined && dto.parentId !== null) {
      await this.assertCategoryExists(dto.parentId);
      await this.assertNoCycle(id, dto.parentId);
    }

    Object.assign(category, dto);
    return this.shopCategoryRepository.save(category);
  }

  async deleteCategory(id: number): Promise<void> {
    const category = await this.shopCategoryRepository.findOne({
      where: { id },
      relations: { children: true },
    });
    if (!category) throw new NotFoundException('Shop category not found');

    if (category.children && category.children.length > 0) {
      throw new BadRequestException(
        'Cannot delete a category that has subcategories. Delete or move its subcategories first.',
      );
    }

    await this.shopCategoryRepository.remove(category);
  }

  private async assertCategoryExists(id: number): Promise<void> {
    const exists = await this.shopCategoryRepository.exists({
      where: { id },
    });
    if (!exists) throw new NotFoundException('Shop category not found');
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

      const parent = await this.shopCategoryRepository.findOne({
        where: { id: currentParentId },
        select: { id: true, parentId: true },
      });
      if (!parent) break;
      currentParentId = parent.parentId ?? null;
    }
  }

  private async collectCategoryAndDescendants(id: number): Promise<number[]> {
    const categories = await this.shopCategoryRepository.find({
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

  private buildCategoryTree(categories: ShopCategory[]): ShopCategory[] {
    const nodes = new Map<number, ShopCategory>();
    const roots: ShopCategory[] = [];

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

  private sortCategoryTree(nodes: ShopCategory[]): void {
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

  private attachItemCounts(
    nodes: ShopCategory[],
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
