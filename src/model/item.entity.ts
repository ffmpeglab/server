import { ApiProperty } from '@nestjs/swagger';
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
  UpdateDateColumn,
} from 'typeorm';

@Entity()
export class Item {
  @PrimaryGeneratedColumn('uuid')
  @ApiProperty()
  @Index()
  id: string;

  @Column()
  @ApiProperty()
  title: string;

  @Column()
  @ApiProperty()
  @Index()
  public: boolean;

  @Column()
  @ApiProperty()
  @Index()
  isFolder: boolean;

  @Column({ type: 'uuid' })
  @ApiProperty()
  @Index()
  user_id: string;

  @Column({ type: 'uuid' })
  @ApiProperty()
  @Index()
  folder: string;

  @Column()
  @ApiProperty()
  @Index()
  order: number;

  @Column('simple-json')
  @ApiProperty()
  item: any;

  @CreateDateColumn()
  @ApiProperty()
  @Index()
  created: Date;

  @UpdateDateColumn()
  @ApiProperty()
  @Index()
  updated: Date;
}
