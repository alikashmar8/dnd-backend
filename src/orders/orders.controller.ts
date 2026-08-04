import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { AuthGuard } from '../common/guards/auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../enums/user-role.enum';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { OrdersQueryDto } from './dto/orders-query.dto';
import { AssignStaffDto } from './dto/assign-staff.dto';
import { AssignDriverDto } from './dto/assign-driver.dto';
import { MarkPreparedDto } from './dto/mark-prepared.dto';
import { User } from '../users/entities/user.entity';

@Controller('orders')
@UseGuards(AuthGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  async findAll(
    @CurrentUser() currentUser: User,
    @Query() query: OrdersQueryDto,
  ) {
    return await this.ordersService.findAllForUser(currentUser, query);
  }

  @Get(':id')
  async findOne(@CurrentUser() currentUser: User, @Param('id') id: string) {
    return await this.ordersService.findOneForUser(currentUser, id);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPERADMIN)
  @Post()
  async create(
    @CurrentUser() currentUser: User,
    @Body() createOrderDto: CreateOrderDto,
  ) {
    return await this.ordersService.create(currentUser, createOrderDto);
  }

  @Patch(':id/status')
  async updateOrderStatus(
    @CurrentUser() currentUser: User,
    @Param('id') id: string,
    @Body() updateOrderStatusDto: UpdateOrderStatusDto,
  ) {
    return await this.ordersService.updateOrderStatus(
      currentUser,
      id,
      updateOrderStatusDto.status,
    );
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPERADMIN, UserRole.DRIVER_HEAD)
  @Patch(':id/assign-driver')
  async assignDriver(@Param('id') id: string, @Body() dto: AssignDriverDto) {
    return await this.ordersService.assignDriver(id, dto.driverId);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPERADMIN, UserRole.KITCHEN_HEAD)
  @Patch(':id/assign-kitchen')
  async assignKitchenStaff(
    @Param('id') id: string,
    @Body() dto: AssignStaffDto,
  ) {
    return await this.ordersService.assignKitchenStaff(id, dto.staffId);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPERADMIN, UserRole.WAREHOUSE_HEAD)
  @Patch(':id/assign-warehouse')
  async assignWarehouseStaff(
    @Param('id') id: string,
    @Body() dto: AssignStaffDto,
  ) {
    return await this.ordersService.assignWarehouseStaff(id, dto.staffId);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.KITCHEN_STAFF, UserRole.WAREHOUSE_STAFF, UserRole.SUPERADMIN)
  @Patch(':id/mark-prepared')
  async markPrepared(
    @CurrentUser() currentUser: User,
    @Param('id') id: string,
    @Body() dto: MarkPreparedDto,
  ) {
    return await this.ordersService.markPrepared(currentUser, id, dto.role);
  }
}
