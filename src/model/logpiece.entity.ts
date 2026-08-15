import { ApiProperty } from '@nestjs/swagger';
import { Entity, Column, PrimaryGeneratedColumn, Index } from 'typeorm';

@Entity()
export class LogPiece {
  @PrimaryGeneratedColumn('uuid')
  @ApiProperty()
  id: string;

  @Column()
  @ApiProperty()
  @Index()
  date: Date;

  @Column()
  @ApiProperty()
  logs: string;

  @Column({ type: 'uuid' })
  @ApiProperty()
  @Index()
  render: string;

  @Column({ type: 'uuid' })
  @ApiProperty()
  @Index()
  user_id: string;
}
