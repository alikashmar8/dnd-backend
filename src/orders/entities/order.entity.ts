import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

import { Address } from '../../addresses/entities/address.entity';
import { OrderStatus } from '../../enums/order-status.enum';
import { User } from '../../users/entities/user.entity';
import { OrderItem } from './order-item.entity';

@Entity('orders')
@Index('idx_orders_kitchen_queue', ['status', 'kitchenUserId'], {
  where: `"status" IN ('confirmed', 'preparing')`,
})
@Index('idx_orders_warehouse_queue', ['status', 'warehouseUserId'], {
  where: `"status" IN ('confirmed', 'preparing')`,
})
@Index('idx_orders_driver_queue', ['status', 'driverId'], {
  where: `"status" IN ('waiting_for_pickup', 'in_route')`,
})
export class Order {
  @PrimaryColumn({ type: 'varchar', length: 50 })
  id!: string;

  @Column({ type: 'int' })
  customerId!: number;

  @Column({ type: 'int', nullable: true })
  createdById!: number | null;

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

  @Column({ type: 'int', nullable: true })
  kitchenUserId!: number | null;

  @Column({ type: 'int', nullable: true })
  warehouseUserId!: number | null;

  @Column({ type: 'timestamp', nullable: true })
  driverAssignedAt!: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  kitchenAssignedAt!: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  kitchenPreparedAt!: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  warehouseAssignedAt!: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  warehousePreparedAt!: Date | null;

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

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'kitchenUserId', referencedColumnName: 'id' })
  kitchenUser!: User | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'warehouseUserId', referencedColumnName: 'id' })
  warehouseUser!: User | null;

  @ManyToOne(() => Address, { onDelete: 'SET NULL' })
  @JoinColumn({})
  address!: Address;

  @OneToMany(() => OrderItem, (item) => item.order)
  items!: OrderItem[];
}
