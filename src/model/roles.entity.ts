import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
  UpdateDateColumn,
} from 'typeorm';
import { Permission } from '../types';
import { ApiProperty } from '@nestjs/swagger';

@Entity()
export class Role {
  @PrimaryGeneratedColumn('uuid')
  @ApiProperty()
  @Index()
  id: string;

  @Column()
  @ApiProperty()
  title: string;

  @Column({ type: 'uuid', nullable: true })
  @ApiProperty()
  @Index()
  item?: string;

  @Column({ type: 'uuid', nullable: true })
  @ApiProperty()
  @Index()
  render?: string;

  @Column({ type: 'uuid' })
  @ApiProperty()
  @Index()
  owner: string;

  @Column({ type: 'uuid' })
  @ApiProperty()
  @Index()
  user_id: string;

  @Column()
  @ApiProperty()
  @Index()
  permission: Permission;

  @CreateDateColumn()
  @ApiProperty()
  @Index()
  created: Date;

  @UpdateDateColumn()
  @ApiProperty()
  @Index()
  updated: Date;
}
