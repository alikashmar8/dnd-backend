import { IsEnum, IsInt } from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentMethod } from '../../enums/payment-method.enum';

export class CheckoutDto {
  @Type(() => Number)
  @IsInt()
  addressId!: number;

  @IsEnum(PaymentMethod)
  payment_method!: PaymentMethod;
}
