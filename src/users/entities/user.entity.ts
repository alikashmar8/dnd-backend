import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Exclude } from 'class-transformer';
import { Address } from '../../addresses/entities/address.entity';
import { Order } from '../../orders/entities/order.entity';
import { Chat } from '../../chat/entities/chat.entity';
import { ChatMessage } from '../../chat/entities/chat-message.entity';
import { DeviceToken } from '../../auth/entities/device-token.entity';
import { UserRole } from '../../enums/user-role.enum';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('increment')
  id!: number;

  @Column({ type: 'varchar', length: 255, unique: true, nullable: true })
  email?: string;

  @Exclude()
  @Column({ type: 'varchar', length: 255 })
  passwordHash!: string;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ type: 'varchar', length: 20, unique: true })
  phone!: string;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.CUSTOMER })
  role!: UserRole;

  @CreateDateColumn({})
  createdAt!: Date;

  @UpdateDateColumn({})
  updatedAt!: Date;

  /* ── Relations ──────────────────────────────────────────── */

  @OneToMany(() => Address, (address) => address.user)
  addresses!: Address[];

  @OneToMany(() => Order, (order) => order.customer)
  orders!: Order[];

  @OneToMany(() => Order, (order) => order.createdBy)
  createdOrders!: Order[];

  @OneToMany(() => Order, (order) => order.driver)
  deliveryOrders!: Order[];

  @OneToMany(() => Order, (order) => order.kitchenUser)
  kitchenOrders!: Order[];

  @OneToMany(() => Order, (order) => order.warehouseUser)
  warehouseOrders!: Order[];

  @OneToMany(() => Chat, (chat) => chat.user1)
  chatsAsUser1!: Chat[];

  @OneToMany(() => Chat, (chat) => chat.user2)
  chatsAsUser2!: Chat[];

  @OneToMany(() => ChatMessage, (message) => message.sender)
  chatMessages!: ChatMessage[];

  @OneToMany(() => DeviceToken, (deviceToken) => deviceToken.user)
  deviceTokens!: DeviceToken[];
}
