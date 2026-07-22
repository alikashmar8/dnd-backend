import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Restaurant } from './entities/restaurant.entity';
import { Address } from '../addresses/entities/address.entity';
import { GetRestaurantsQueryDto } from './dto/get-restaurants-query.dto.js';
import { CreateRestaurantDto } from './dto/create-restaurant.dto';
import { UpdateRestaurantDto } from './dto/update-restaurant.dto';

@Injectable()
export class RestaurantsService {
  constructor(
    @InjectRepository(Restaurant)
    private readonly restaurantRepository: Repository<Restaurant>,
    @InjectRepository(Address)
    private readonly addressRepository: Repository<Address>,
  ) {}

  async findAll(query: GetRestaurantsQueryDto): Promise<{
    items: Restaurant[];
    total: number;
    skip: number;
    take: number;
  }> {
    const skip = query.skip ?? 0;
    const take = query.take ?? 20;

    const qb = this.restaurantRepository
      .createQueryBuilder('restaurant')
      .leftJoinAndSelect('restaurant.address', 'address')
      .leftJoinAndSelect('restaurant.menuItems', 'menuItems');

    if (query.type) {
      qb.andWhere('restaurant.mealType = :mealType', { mealType: query.type });
    }

    if (query.search) {
      const search = `%${query.search.trim().toLowerCase()}%`;
      qb.andWhere(
        '(LOWER(restaurant.name) LIKE :search OR LOWER(restaurant.tags) LIKE :search)',
        { search },
      );
    }

    if (query.priceLevel) {
      qb.andWhere('restaurant.priceLevel = :priceLevel', {
        priceLevel: query.priceLevel,
      });
    }

    if (query.rating) {
      const minRating = Number(query.rating.replace('+', ''));
      qb.andWhere('restaurant.rating >= :minRating', { minRating });
    }

    if (query.tags) {
      qb.andWhere('restaurant.tags LIKE :tags', {
        tags: `%${query.tags}%`,
      });
    }

    qb.orderBy('restaurant.createdAt', 'DESC').skip(skip).take(take);

    const [items, total] = await qb.getManyAndCount();
    return { items, total, skip, take };
  }

  async findOne(id: number): Promise<Restaurant> {
    const restaurant = await this.restaurantRepository.findOne({
      where: { id },
      relations: {
        address: true,
        menuItems: true,
      },
    });

    if (!restaurant) {
      throw new NotFoundException('Restaurant not found');
    }

    return restaurant;
  }

  async create(dto: CreateRestaurantDto): Promise<Restaurant> {
    const address = this.addressRepository.create(dto.address);
    await this.addressRepository.save(address);

    const restaurant = this.restaurantRepository.create({
      ...dto,
      address,
    });
    return this.restaurantRepository.save(restaurant);
  }

  async update(id: number, dto: UpdateRestaurantDto): Promise<Restaurant> {
    const restaurant = await this.restaurantRepository.findOne({
      where: { id },
      relations: { address: true },
    });
    if (!restaurant) throw new NotFoundException('Restaurant not found');

    if (dto.address && restaurant.address) {
      Object.assign(restaurant.address, dto.address);
      await this.addressRepository.save(restaurant.address);
    }

    const { address: _addr, ...restDto } = dto;
    Object.assign(restaurant, restDto);
    return this.restaurantRepository.save(restaurant);
  }

  async remove(id: number): Promise<void> {
    const restaurant = await this.restaurantRepository.findOne({
      where: { id },
    });
    if (!restaurant) throw new NotFoundException('Restaurant not found');
    await this.restaurantRepository.remove(restaurant);
  }
}
