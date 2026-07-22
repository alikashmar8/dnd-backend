import {
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { OrderSource } from '../entities/order.entity';

class OrderItemDto {
  @IsInt()
  @IsNotEmpty()
  itemId!: number;

  @IsInt()
  @Min(1)
  quantity!: number;
}

export class CreateOrderDto {
  @IsInt()
  @IsNotEmpty()
  customerId!: number;

  @IsEnum(OrderSource)
  source!: OrderSource;

  @IsOptional()
  @IsInt()
  restaurantId?: number;

  @IsInt()
  addressId!: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items!: OrderItemDto[];
}
