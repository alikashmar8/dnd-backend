import { IsEnum, IsOptional, IsNumber, IsString } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { OrderStatus } from '../../enums/order-status.enum';
import { Transform } from 'class-transformer';

export class OrdersQueryDto extends PaginationDto {
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => Number(value))
  customerId?: number;

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => Number(value))
  driverId?: number;
}
