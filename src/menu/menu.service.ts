import { Injectable, NotFoundException } from '@nestjs/common';
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
        ':dietary = ANY(string_to_array(menuItem.dietaryTags, \",\"))',
        { dietary: query.dietary },
      );
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

  async findCategories(currentUser: User) {
    const categories = await this.menuCategoryRepository.find({
      relations: { menuItems: true },
      order: { name: 'ASC' },
    });

    if (currentUser.role === UserRole.ADMIN) {
      return categories;
    }

    return categories
      .map((category) => ({
        ...category,
        menuItems: category.menuItems.filter(
          (item) => item.available && item.restaurant?.isActive !== false,
        ),
      }))
      .filter((category) => category.menuItems.length > 0);
  }

  async createCategory(dto: CreateMenuCategoryDto): Promise<MenuCategory> {
    const category = this.menuCategoryRepository.create(dto);
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
    Object.assign(category, dto);
    return this.menuCategoryRepository.save(category);
  }

  async deleteCategory(id: number): Promise<void> {
    const category = await this.menuCategoryRepository.findOne({
      where: { id },
    });
    if (!category) throw new NotFoundException('Menu category not found');
    await this.menuCategoryRepository.remove(category);
  }
}
