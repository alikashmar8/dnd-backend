import { Matches } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

/** Query for the order-reports endpoint. Dates are calendar days expressed as
 * `YYYY-MM-DD` (interpreted as UTC days by the service). Pagination governs the
 * server-side "top items sold" list (`take` is capped at 100 by PaginationDto). */
export class ReportsQueryDto extends PaginationDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'startDate must be a date in YYYY-MM-DD format',
  })
  startDate!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'endDate must be a date in YYYY-MM-DD format',
  })
  endDate!: string;
}
