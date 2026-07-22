import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum DeviceTokenStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  REVOKED = 'revoked',
}

@Entity('device_tokens')
export class DeviceToken {
  @PrimaryGeneratedColumn('increment')
  id!: number;

  @Column({ type: 'int' })
  userId!: number;

  @Column({ type: 'varchar', length: 255, unique: true })
  accessToken!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  fcmToken!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  deviceType!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  deviceInfo!: string | null;

  @Column({
    type: 'enum',
    enum: DeviceTokenStatus,
    default: DeviceTokenStatus.ACTIVE,
  })
  status!: DeviceTokenStatus;

  @Column({ type: 'timestamp', nullable: true })
  lastUsedAt!: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  expiresAt!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  /* ── Relations ──────────────────────────────────────────── */

  @ManyToOne(() => User, (user) => user.deviceTokens, { onDelete: 'CASCADE' })
  @JoinColumn()
  user!: User;
}
