import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('notifications')
@Index(['userId', 'createdAt'])
export class AppNotification {
  @PrimaryGeneratedColumn('increment')
  id!: number;

  @Column({ type: 'int' })
  userId!: number;

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Column({ type: 'varchar', length: 1000 })
  body!: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  type!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  data!: Record<string, unknown> | null;

  @Column({ type: 'boolean', default: false })
  isRead!: boolean;

  @CreateDateColumn()
  createdAt!: Date;
}
