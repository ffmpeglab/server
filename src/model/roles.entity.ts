import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { Permission } from '../types';

@Entity()
export class Role {
  @PrimaryGeneratedColumn('uuid')
  @Index()
  id: string;

  @Column()
  title: string;

  @Column({ type: 'uuid' })
  @Index()
  folder: string;

  @Column({ type: 'uuid' })
  @Index()
  owner: string;

  @Column({ type: 'uuid' })
  @Index()
  user_id: string;

  @Column()
  @Index()
  permission: Permission;

  @CreateDateColumn()
  @Index()
  created: Date;

  @UpdateDateColumn()
  @Index()
  updated: Date;
}
