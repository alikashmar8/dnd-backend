import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { MenuCategory } from './menu-category.entity';
import { Restaurant } from '../../restaurants/entities/restaurant.entity';

@Entity('menu_items')
export class MenuItem {
  @PrimaryGeneratedColumn('increment')
  id!: number;

  @Column({ type: 'int' })
  categoryId!: number;

  @Column({ type: 'varchar', length: 150 })
  name!: string;

  @Column({ type: 'varchar', length: 150, nullable: true })
  nameAr?: string | null;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'text', nullable: true })
  descriptionAr?: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  price!: number;

  @Column({ type: 'varchar', length: 500 })
  image!: string;

  @Column({ type: 'decimal', precision: 2, scale: 1, default: 5.0 })
  rating!: number;

  @Column({ type: 'int' })
  prepTimeMinutes!: number;

  @Column({ type: 'simple-array', default: '' })
  dietaryTags!: string[];

  @Column({ type: 'simple-array', nullable: true })
  dietaryTagsAr?: string[] | null;

  @Column({ type: 'boolean', default: true })
  available!: boolean;

  @Column({ type: 'int', nullable: true })
  restaurantId!: number | null;

  @CreateDateColumn({})
  createdAt!: Date;

  @UpdateDateColumn({})
  updatedAt!: Date;

  /* ── Relations ──────────────────────────────────────────── */

  @ManyToOne(() => MenuCategory, (category) => category.menuItems, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({})
  category!: MenuCategory;

  @ManyToOne(() => Restaurant, (restaurant) => restaurant.menuItems, {
    onDelete: 'SET NULL',
  })
  @JoinColumn({})
  restaurant!: Restaurant | null;
}
