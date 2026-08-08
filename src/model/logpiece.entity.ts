import { ApiProperty } from '@nestjs/swagger';
import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class LogPiece {
  @PrimaryGeneratedColumn('uuid')
  @ApiProperty()
  id: string;

  @Column()
  @ApiProperty()
  date: Date;

  @Column()
  @ApiProperty()
  logs: string;

  @Column({ type: 'uuid' })
  @ApiProperty()
  render: string;

  @Column({ type: 'uuid' })
  @ApiProperty()
  user_id: string;
}
