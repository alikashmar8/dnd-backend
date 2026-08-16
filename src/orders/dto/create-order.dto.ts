import {
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class OrderItemDto {
  @IsInt()
  @IsNotEmpty()
  itemId!: number;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @IsIn(['menu', 'shop'])
  itemType?: 'menu' | 'shop';
}

export class CreateOrderDto {
  @IsInt()
  @IsNotEmpty()
  customerId!: number;

  @IsInt()
  addressId!: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items!: OrderItemDto[];
}
