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
import { ShopItem } from './shop-item.entity';

@Entity('shop_categories')
export class ShopCategory {
  @PrimaryGeneratedColumn('increment')
  id!: number;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  nameAr?: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  image!: string | null;

  @Column({ type: 'int', default: 0 })
  sortOrder!: number;

  @Column({ type: 'int', nullable: true })
  parentId!: number | null;

  @CreateDateColumn({})
  createdAt!: Date;

  @UpdateDateColumn({})
  updatedAt!: Date;

  /* ── Relations ──────────────────────────────────────────── */

  @OneToMany(() => ShopItem, (item) => item.category)
  shopItems!: ShopItem[];

  @ManyToOne(() => ShopCategory, (category) => category.children, {
    nullable: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'parentId' })
  parent?: ShopCategory | null;

  @OneToMany(() => ShopCategory, (category) => category.parent)
  children?: ShopCategory[];

  /* ── Computed (not persisted) ───────────────────────────── */
  itemCount?: number;
}
