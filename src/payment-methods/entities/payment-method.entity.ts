import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Generated,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('payment_methods')
@Check(
  'CHK_payment_methods_fixed_fees_non_negative',
  '"fixedFees" >= 0',
)
@Check(
  'CHK_payment_methods_percentage_fees_non_negative',
  '"percentageFees" >= 0',
)
export class PaymentMethod {
  @PrimaryGeneratedColumn('increment')
  id!: number;

  @Column({ type: 'uuid', unique: true })
  @Generated('uuid')
  guid!: string;

  @Column({ type: 'varchar', length: 200 })
  name!: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  nameAr!: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  fixedFees!: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  percentageFees!: string;

  @Column({ type: 'boolean', default: true })
  isEnabled!: boolean;

  @CreateDateColumn({ name: 'createdOn' })
  createdOn!: Date;
}
