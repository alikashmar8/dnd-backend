import {
  Controller,
  Get,
  ForbiddenException,
  NotFoundException,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../common/guards/auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { TrackingService } from '../tracking/tracking.service';
import { User } from '../users/entities/user.entity';

@Controller('drivers')
@UseGuards(AuthGuard)
export class DriverLocationController {
  constructor(private readonly trackingService: TrackingService) {}

  @Get(':id/location')
  async getDriverLocation(
    @CurrentUser() currentUser: User,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const allowed = await this.trackingService.canViewDriverLocation(
      currentUser,
      id,
    );
    if (!allowed) {
      throw new ForbiddenException('Not allowed to view this driver location');
    }

    const location = await this.trackingService.getLocation(id);

    if (!location) {
      throw new NotFoundException('Driver location not available');
    }

    return location;
  }
}
