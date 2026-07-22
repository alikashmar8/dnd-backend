import {
  Controller,
  Get,
  NotFoundException,
  Param,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../common/guards/auth.guard';
import { TrackingService } from '../tracking/tracking.service';

@Controller('drivers')
@UseGuards(AuthGuard)
export class DriverLocationController {
  constructor(private readonly trackingService: TrackingService) {}

  @Get(':id/location')
  async getDriverLocation(@Param('id' /* ParseIntPipe */) id: string) {
    const driverId = parseInt(id, 10);
    const location = await this.trackingService.getLocation(driverId);

    if (!location) {
      throw new NotFoundException('Driver location not available');
    }

    return location;
  }
}
