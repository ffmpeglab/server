import { ApiProperty } from '@nestjs/swagger';
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  VersionColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity()
export class Pipeline {
  @PrimaryGeneratedColumn('uuid')
  @ApiProperty()
  @Index()
  id: string;

  @Column()
  @ApiProperty()
  title: string;

  @Column()
  @ApiProperty()
  status: string;

  @Column({ type: 'uuid' })
  @ApiProperty()
  @Index()
  user_id: string;

  @Column()
  @ApiProperty()
  downsql: string;

  @Column()
  @ApiProperty()
  upsql: string;

  @Column()
  @ApiProperty()
  yml: string;

  @Column({ default: 'default' })
  @ApiProperty()
  @Index()
  projectId?: string;

  @Column()
  @ApiProperty()
  @Index()
  date?: Date;

  @VersionColumn()
  @ApiProperty()
  version: number;

  @UpdateDateColumn()
  updated: Date;
}
