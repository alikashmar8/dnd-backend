import { IsEnum, IsNotEmpty } from 'class-validator';
import { OrderStatus } from '../../enums/order-status.enum';

export class UpdateOrderStatusDto {
  @IsEnum(OrderStatus)
  @IsNotEmpty()
  status!: OrderStatus;
}
