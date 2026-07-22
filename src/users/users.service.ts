import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from './entities/user.entity';
import { CreateUserDto, UpdateUserAdminDto } from './users.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async findAll(query: {
    role?: string;
    search?: string;
    skip?: number;
    take?: number;
  }): Promise<{ items: User[]; total: number; skip: number; take: number }> {
    const skip = query.skip ?? 0;
    const take = query.take ?? 20;

    const qb = this.userRepository.createQueryBuilder('user');

    if (query.role) {
      qb.andWhere('user.role = :role', { role: query.role });
    }

    if (query.search) {
      const search = `%${query.search.trim().toLowerCase()}%`;
      qb.andWhere(
        '(LOWER(user.name) LIKE :search OR LOWER(user.phone) LIKE :search OR LOWER(user.email) LIKE :search)',
        { search },
      );
    }

    const [items, total] = await qb
      .skip(skip)
      .take(take)
      .orderBy('user.id', 'ASC')
      .getManyAndCount();

    return { items, total, skip, take };
  }

  async getProfile(userId: number) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new Error('User not found');
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone,
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  async updateProfile(userId: number, updateData: Partial<User>) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new Error('User not found');
    }

    Object.assign(user, updateData);
    await this.userRepository.save(user);

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone,
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  async adminCreate(dto: CreateUserDto) {
    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const user = this.userRepository.create({
      name: dto.name,
      phone: dto.phone,
      email: dto.email || undefined,
      passwordHash: hashedPassword,
      role: dto.role,
    });

    await this.userRepository.save(user);

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone,
      role: user.role,
      createdAt: user.createdAt,
    };
  }

  async adminUpdate(id: number, dto: UpdateUserAdminDto) {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    if (dto.password) {
      dto.password = await bcrypt.hash(dto.password, 10);
    }

    Object.assign(user, dto);
    await this.userRepository.save(user);

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone,
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  async findById(id: number) {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async adminRemove(id: number): Promise<void> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    await this.userRepository.remove(user);
  }
}
