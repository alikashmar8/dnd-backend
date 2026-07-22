import { IsOptional, IsString } from 'class-validator';

export class DateRangeDto {
  @IsString()
  @IsOptional()
  startDate?: string;

  @IsString()
  @IsOptional()
  endDate?: string;
}
