import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { ChatMessage } from './chat-message.entity';

@Entity('chat_threads')
@Index(['user1Id', 'user2Id'])
export class Chat {
  @PrimaryGeneratedColumn('increment')
  id!: number;

  @Index()
  @Column({ type: 'int' })
  user1Id!: number;

  @Index()
  @Column({ type: 'int' })
  user2Id!: number;

  /**
   * `support` threads are per-customer inboxes anchored to the shared Support
   * Team account; any staff member (admin/support) can view and answer them.
   * `direct` threads are ordinary 1:1 conversations between the two users.
   */
  @Column({ type: 'varchar', length: 20, default: 'direct' })
  type!: 'direct' | 'support';

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  /* ── Relations ──────────────────────────────────────────── */

  @ManyToOne(() => User, (user) => user.chatsAsUser1, {
    onDelete: 'CASCADE',
  })
  @JoinColumn()
  user1!: User;

  @ManyToOne(() => User, (user) => user.chatsAsUser2, {
    onDelete: 'CASCADE',
  })
  @JoinColumn()
  user2!: User;

  @OneToMany(() => ChatMessage, (message) => message.chat)
  messages!: ChatMessage[];
}
