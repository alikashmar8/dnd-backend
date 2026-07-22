import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Chat } from './chat.entity';
import { User } from '../../users/entities/user.entity';

@Entity('chat_messages')
export class ChatMessage {
  @PrimaryGeneratedColumn('increment')
  id!: number;

  @Column({ type: 'int' })
  chatId!: number;

  @Column({ type: 'int' })
  senderId!: number;

  @Column({ type: 'text' })
  text!: string;

  @Column({ type: 'boolean', default: false })
  isRead!: boolean;

  @CreateDateColumn({})
  createdAt!: Date;

  /* ── Relations ──────────────────────────────────────────── */

  @ManyToOne(() => Chat, (chat) => chat.messages, {
    onDelete: 'CASCADE',
  })
  @JoinColumn()
  chat!: Chat;

  @ManyToOne(() => User, (user) => user.chatMessages, { onDelete: 'CASCADE' })
  @JoinColumn({})
  sender!: User;
}
