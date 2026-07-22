import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Address } from '../../addresses/entities/address.entity';
import { Order } from '../../orders/entities/order.entity';
import { MenuItem } from '../../menu/entities/menu-item.entity';
import { MealType } from '../../enums/meal-type.enum';

@Entity('restaurants')
export class Restaurant {
  @PrimaryGeneratedColumn('increment')
  id!: number;

  @Column({ type: 'varchar', length: 150 })
  name!: string;

  @Column({ type: 'enum', enum: MealType })
  mealType!: MealType;

  @Column({ type: 'varchar', length: 500 })
  logoImage!: string;

  @Column({ type: 'decimal', precision: 2, scale: 1, default: 5.0 })
  rating!: number;

  @Column({ type: 'int' })
  deliveryMinutes!: number;

  @Column({ type: 'varchar', length: 3 })
  priceLevel!: string;

  @Column({ type: 'simple-array', default: '' })
  tags!: string[];

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({})
  createdAt!: Date;

  @UpdateDateColumn({})
  updatedAt!: Date;

  /* ── Relations ──────────────────────────────────────────── */

  @ManyToOne(() => Address, { onDelete: 'CASCADE' })
  @JoinColumn({})
  address!: Address;

  @OneToMany(() => Order, (order) => order.restaurant)
  orders!: Order[];

  @OneToMany(() => MenuItem, (item) => item.restaurant)
  menuItems!: MenuItem[];
}
