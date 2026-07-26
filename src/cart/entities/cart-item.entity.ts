import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Cart } from './cart.entity';
import { MenuItem } from '../../menu/entities/menu-item.entity';
import { ShopItem } from '../../shop-items/entities/shop-item.entity';

@Entity('cart_items')
export class CartItem {
  @PrimaryGeneratedColumn('increment')
  id!: number;

  @Index()
  @Column({ type: 'int' })
  cartId!: number;

  @Column({ type: 'int' })
  @Index()
  itemId!: number;

  @Column({ type: 'varchar', length: 10 })
  itemType!: 'menu' | 'shop';

  @Column({ type: 'int' })
  quantity!: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  price!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @ManyToOne(() => Cart, (cart) => cart.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'cartId' })
  cart!: Cart;

  // Virtual relations for conditional loading via QueryBuilder (no @JoinColumn to avoid duplicate FKs)
  @ManyToOne(() => MenuItem, { nullable: true })
  menuItem!: MenuItem | null;

  @ManyToOne(() => ShopItem, { nullable: true })
  shopItem!: ShopItem | null;
}
