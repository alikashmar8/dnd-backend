import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ShopCategory } from './shop-category.entity';

@Entity('shop_items')
export class ShopItem {
  @PrimaryGeneratedColumn('increment')
  id!: number;

  @Column({ type: 'int' })
  categoryId!: number;

  @Column({ type: 'varchar', length: 150 })
  name!: string;

  @Column({ type: 'varchar', length: 50 })
  unit!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  price!: number;

  @Column({ type: 'varchar', length: 500 })
  image!: string;

  @Column({ type: 'decimal', precision: 2, scale: 1, default: 5.0 })
  rating!: number;

  @Column({ type: 'int', default: 0 })
  stockQuantity!: number;

  @Column({ type: 'boolean', default: true })
  available!: boolean;

  @Column({ type: 'simple-array', default: '' })
  dietaryTags!: string[];

  @CreateDateColumn({})
  createdAt!: Date;

  @UpdateDateColumn({})
  updatedAt!: Date;

  /* ── Relations ──────────────────────────────────────────── */

  @ManyToOne(() => ShopCategory, (category) => category.shopItems, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({})
  category!: ShopCategory;
}
