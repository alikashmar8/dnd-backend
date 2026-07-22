import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

import { Address } from '../../addresses/entities/address.entity';
import { OrderStatus } from '../../enums/order-status.enum';
import { Restaurant } from '../../restaurants/entities/restaurant.entity';
import { User } from '../../users/entities/user.entity';
import { OrderItem } from './order-item.entity';

export enum OrderSource {
  RESTAURANT = 'restaurant',
  SHOP = 'shop',
}

@Entity('orders')
export class Order {
  @PrimaryColumn({ type: 'varchar', length: 50 })
  id!: string;

  @Column({ type: 'int' })
  customerId!: number;

  @Column({ type: 'int', nullable: true })
  createdById!: number | null;

  @Column({ type: 'enum', enum: OrderSource })
  source!: OrderSource;

  @Column({ type: 'int', nullable: true })
  restaurantId!: number | null;

  @Column({
    type: 'enum',
    enum: OrderStatus,
    default: OrderStatus.PENDING,
  })
  status!: OrderStatus;

  @Column({
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
  })
  placedAt!: Date;

  @Column({ type: 'int' })
  addressId!: number;

  @Column({ type: 'int' })
  etaMinutes!: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  subtotal!: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  tax!: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  deliveryFee!: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  total!: number;

  @Column({ type: 'int', nullable: true })
  driverId!: number | null;

  @CreateDateColumn({})
  createdAt!: Date;

  @UpdateDateColumn({})
  updatedAt!: Date;

  /* ── Relations ──────────────────────────────────────────── */

  @ManyToOne(() => User, (user) => user.orders, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'customerId', referencedColumnName: 'id' })
  customer!: User;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'createdById', referencedColumnName: 'id' })
  createdBy!: User | null;

  @ManyToOne(() => User, (user) => user.deliveryOrders, { nullable: true })
  @JoinColumn({ name: 'driverId', referencedColumnName: 'id' })
  driver!: User | null;

  @ManyToOne(() => Restaurant, (restaurant) => restaurant.orders, {
    nullable: true,
  })
  @JoinColumn({})
  restaurant!: Restaurant | null;

  @ManyToOne(() => Address, { onDelete: 'SET NULL' })
  @JoinColumn({})
  address!: Address;

  @OneToMany(() => OrderItem, (item) => item.order)
  items!: OrderItem[];
}
