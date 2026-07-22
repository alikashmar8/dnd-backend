import {
  Column,
  CreateDateColumn,
  Entity,
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

  @Column({ type: 'varchar', length: 500, nullable: true })
  image!: string | null;

  @Column({ type: 'int', default: 0 })
  sortOrder!: number;

  @CreateDateColumn({})
  createdAt!: Date;

  @UpdateDateColumn({})
  updatedAt!: Date;

  /* ── Relations ──────────────────────────────────────────── */

  @OneToMany(() => ShopItem, (item) => item.category)
  shopItems!: ShopItem[];
}
