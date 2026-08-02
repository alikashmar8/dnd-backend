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
import { MenuItem } from './menu-item.entity';

@Entity('menu_categories')
export class MenuCategory {
  @PrimaryGeneratedColumn('increment')
  id!: number;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  nameAr?: string | null;

  @Column({ type: 'int', default: 0 })
  sortOrder!: number;

  @Column({ type: 'varchar', length: 500, nullable: true })
  image!: string | null;

  @Column({ type: 'int', nullable: true })
  parentId!: number | null;

  @CreateDateColumn({})
  createdAt!: Date;

  @UpdateDateColumn({})
  updatedAt!: Date;

  /* ── Relations ──────────────────────────────────────────── */

  @OneToMany(() => MenuItem, (item) => item.category)
  menuItems!: MenuItem[];

  @ManyToOne(() => MenuCategory, (category) => category.children, {
    nullable: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'parentId' })
  parent?: MenuCategory | null;

  @OneToMany(() => MenuCategory, (category) => category.parent)
  children?: MenuCategory[];

  /* ── Computed (not persisted) ───────────────────────────── */
  itemCount?: number;
}
