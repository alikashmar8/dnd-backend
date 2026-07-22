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
  productId!: number;

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

  @ManyToOne(() => ShopItem, { eager: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'productId' })
  product!: ShopItem;
}
