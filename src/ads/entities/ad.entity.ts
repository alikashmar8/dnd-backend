import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('ads')
export class Ad {
  @PrimaryGeneratedColumn('increment')
  id!: number;

  @Column({ type: 'varchar', length: 200 })
  title!: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  titleAr?: string | null;

  @Column({ type: 'varchar', length: 500 })
  subtitle!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  subtitleAr?: string | null;

  @Column({ type: 'varchar', length: 1000 })
  image!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  linkUrl!: string | null;

  @Column({ type: 'int', default: 0 })
  sortOrder!: number;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
