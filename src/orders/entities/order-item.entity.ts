import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Order } from './order.entity';

@Entity('order_items')
export class OrderItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 50 })
  orderId!: string;

  @Column({ type: 'varchar', length: 50 })
  itemId!: string;

  @Column({ type: 'varchar', length: 150 })
  name!: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  price!: number;

  @Column({ type: 'int' })
  quantity!: number;

  @Column({ type: 'varchar', length: 500 })
  image!: string;

  /* ── Relations ──────────────────────────────────────────── */

  @ManyToOne(() => Order, (order) => order.items, { onDelete: 'CASCADE' })
  @JoinColumn({})
  order!: Order;
}
