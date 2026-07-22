import { Injectable, NotFoundException } from '@nestjs/common';
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

  async findCategories() {
    return this.shopCategoryRepository.find({
      order: { name: 'ASC' },
    });
  }

  async createCategory(dto: CreateShopCategoryDto): Promise<ShopCategory> {
    const category = this.shopCategoryRepository.create(dto);
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
    Object.assign(category, dto);
    return this.shopCategoryRepository.save(category);
  }

  async deleteCategory(id: number): Promise<void> {
    const category = await this.shopCategoryRepository.findOne({
      where: { id },
    });
    if (!category) throw new NotFoundException('Shop category not found');
    await this.shopCategoryRepository.remove(category);
  }
}
