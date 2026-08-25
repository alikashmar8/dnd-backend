import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthGuard } from '../common/guards/auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole } from '../enums/user-role.enum';
import { AnalyticsService } from './analytics.service';
import { DateRangeDto } from './dto/date-range.dto';
import { ReportsQueryDto } from './dto/reports-query.dto';

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('overview')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.SUPERADMIN)
  async getOverview(@Query() dateRange: DateRangeDto) {
    return this.analyticsService.getOverview(dateRange);
  }

  @Get('reports/orders')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.SUPERADMIN)
  async getOrderReports(@Query() query: ReportsQueryDto) {
    return this.analyticsService.getOrderReports(query);
  }
}
