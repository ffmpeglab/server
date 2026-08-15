import type { APIKeyData } from '../types';
import { Entity, Column, PrimaryGeneratedColumn, Index } from 'typeorm';

@Entity()
export class ApiKey {
  @PrimaryGeneratedColumn('uuid')
  @Index()
  id: string;

  @Column()
  title: string;

  @Column({ type: 'varchar', length: 200, unique: true })
  @Index()
  apikey: string;

  @Column({ type: 'uuid' })
  @Index()
  user_id: string;

  @Column('simple-json')
  data: APIKeyData;

  @Column()
  @Index()
  date: Date;
}
