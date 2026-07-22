import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AddressesService } from './addresses.service';
import { AuthGuard } from '../common/guards/auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';
import { PaginationDto } from '../common/dto/pagination.dto';

@Controller('addresses')
@UseGuards(AuthGuard)
export class AddressesController {
  constructor(private readonly addressesService: AddressesService) {}

  @Get()
  async findAll(
    @CurrentUser() currentUser: User,
    @Query() pagination: PaginationDto & { userId?: number },
  ) {
    return await this.addressesService.findAll(
      currentUser,
      pagination,
      pagination.userId,
    );
  }

  @Get(':id')
  async findOne(
    @CurrentUser() currentUser: User,
    @Param('id', ParseIntPipe) id: number,
    @Query('userId') userId?: number,
  ) {
    return await this.addressesService.findOne(currentUser, id, userId);
  }

  @Post()
  async create(
    @CurrentUser('id') currentUserId: number,
    @Body() createAddressDto: CreateAddressDto,
  ) {
    return await this.addressesService.create(currentUserId, createAddressDto);
  }

  @Put(':id')
  async update(
    @CurrentUser('id') currentUserId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() updateAddressDto: UpdateAddressDto,
  ) {
    return await this.addressesService.update(
      currentUserId,
      id,
      updateAddressDto,
    );
  }

  @Delete(':id')
  async remove(
    @CurrentUser('id') currentUserId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.addressesService.remove(currentUserId, id);
    return { message: 'Address removed successfully' };
  }
}
