import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { DriversService } from './drivers.service';
import { AuthGuard } from '../common/guards/auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../enums/user-role.enum';
import { User } from '../users/entities/user.entity';
import { UpdateLocationDto } from '../tracking/dto/update-location.dto';
import { TrackingService } from '../tracking/tracking.service';

@Controller('driver')
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.DRIVER)
export class DriversController {
  constructor(
    private readonly driversService: DriversService,
    private readonly trackingService: TrackingService,
  ) {}

  @Get('orders')
  async getAssignedOrders(@CurrentUser() driver: User) {
    return await this.driversService.getAssignedOrders(driver.id);
  }

  @Patch('location')
  async updateLocation(
    @CurrentUser() driver: User,
    @Body() dto: UpdateLocationDto,
  ) {
    await this.trackingService.updateLocation(
      driver.id,
      dto.latitude,
      dto.longitude,
    );

    return { success: true };
  }
}
