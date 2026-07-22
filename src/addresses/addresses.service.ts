import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Address } from './entities/address.entity';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';
import { UserRole } from '../enums/user-role.enum';
import { User } from '../users/entities/user.entity';

@Injectable()
export class AddressesService {
  constructor(
    @InjectRepository(Address)
    private readonly addressRepository: Repository<Address>,
  ) {}

  async findAll(
    currentUser: User,
    pagination: { skip?: number; take?: number },
    userId?: number,
  ): Promise<{ items: Address[]; total: number; skip: number; take: number }> {
    const skip = pagination.skip ?? 0;
    const take = pagination.take ?? 20;

    const where: any = {};

    if (userId && currentUser.role === UserRole.ADMIN) {
      where.userId = userId;
    } else {
      where.userId = currentUser.id;
    }

    const [items, total] = await this.addressRepository.findAndCount({
      where,
      skip,
      take,
      order: { updatedAt: 'DESC' },
    });

    return { items, total, skip, take };
  }

  async findOne(
    currentUser: User,
    id: number,
    userId?: number,
  ): Promise<Address> {
    const where: any = { id };
    if (userId && currentUser.role === UserRole.ADMIN) {
      where.userId = userId;
    } else {
      where.userId = currentUser.id;
    }

    const address = await this.addressRepository.findOne({ where });

    if (!address) {
      throw new NotFoundException('Address not found');
    }

    return address;
  }

  async create(
    currentUserId: number,
    createAddressDto: CreateAddressDto,
  ): Promise<Address> {
    const address = this.addressRepository.create({
      userId: currentUserId,
      ...createAddressDto,
    });

    if (createAddressDto.isPreferred) {
      await this.addressRepository.update(
        { userId: currentUserId },
        { isPreferred: false },
      );
    }

    return this.addressRepository.save(address);
  }

  async update(
    currentUserId: number,
    id: number,
    updateAddressDto: UpdateAddressDto,
  ): Promise<Address> {
    const address = await this.addressRepository.findOne({
      where: { id, userId: currentUserId },
    });

    if (!address) {
      throw new NotFoundException('Address not found');
    }

    Object.assign(address, updateAddressDto);

    if (updateAddressDto.isPreferred) {
      await this.addressRepository.update(
        { userId: currentUserId },
        { isPreferred: false },
      );
    }

    return this.addressRepository.save(address);
  }

  async remove(currentUserId: number, id: number): Promise<void> {
    const address = await this.addressRepository.findOne({
      where: { id, userId: currentUserId },
    });

    if (!address) {
      throw new NotFoundException('Address not found');
    }

    await this.addressRepository.softDelete({ id, userId: currentUserId });
  }
}
