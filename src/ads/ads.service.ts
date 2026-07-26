import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Ad } from './entities/ad.entity';
import { CreateAdDto } from './dto/create-ad.dto';
import { UpdateAdDto } from './dto/update-ad.dto';

@Injectable()
export class AdsService {
  constructor(
    @InjectRepository(Ad)
    private readonly adRepository: Repository<Ad>,
  ) {}

  async findAll(): Promise<Ad[]> {
    return this.adRepository.find({
      order: { sortOrder: 'ASC', createdAt: 'DESC' },
    });
  }

  async findActive(): Promise<Ad[]> {
    return this.adRepository.find({
      where: { isActive: true },
      order: { sortOrder: 'ASC', createdAt: 'DESC' },
    });
  }

  async findOne(id: number): Promise<Ad> {
    const ad = await this.adRepository.findOne({ where: { id } });
    if (!ad) throw new NotFoundException('Ad not found');
    return ad;
  }

  async create(dto: CreateAdDto): Promise<Ad> {
    const ad = this.adRepository.create(dto);
    return this.adRepository.save(ad);
  }

  async update(id: number, dto: UpdateAdDto): Promise<Ad> {
    const ad = await this.findOne(id);
    Object.assign(ad, dto);
    return this.adRepository.save(ad);
  }

  async remove(id: number): Promise<void> {
    const ad = await this.findOne(id);
    await this.adRepository.remove(ad);
  }
}
