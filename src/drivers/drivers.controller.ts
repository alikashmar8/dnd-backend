import {
  Body,
  Controller,
  Get,
  Patch,
  UseGuards
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthGuard } from '../common/guards/auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole } from '../enums/user-role.enum';
import { UpdateLocationDto } from '../tracking/dto/update-location.dto';
import { TrackingService } from '../tracking/tracking.service';
import { User } from '../users/entities/user.entity';
import { DriversService } from './drivers.service';

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
