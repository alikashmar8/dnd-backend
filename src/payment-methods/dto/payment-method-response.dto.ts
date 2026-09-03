import { Exclude, Expose, Transform } from 'class-transformer';

@Exclude()
export class PaymentMethodResponseDto {
  @Expose()
  guid!: string;

  @Expose()
  name!: string;

  @Expose()
  nameAr!: string | null;

  @Expose()
  @Transform(({ value }) => Number(value), { toPlainOnly: true })
  fixedFees!: number;

  @Expose()
  @Transform(({ value }) => Number(value), { toPlainOnly: true })
  percentageFees!: number;

  @Expose()
  isEnabled!: boolean;
}
