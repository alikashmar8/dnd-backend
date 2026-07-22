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
import { User } from '../../users/entities/user.entity';
import { ChatMessage } from './chat-message.entity';

@Entity('chat_threads')
export class Chat {
  @PrimaryGeneratedColumn('increment')
  id!: number;

  @Column({ type: 'int' })
  user1Id!: number;

  @Column({ type: 'int' })
  user2Id!: number;

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
