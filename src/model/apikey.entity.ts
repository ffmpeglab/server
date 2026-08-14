import type { APIKeyData } from '../types';
import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class ApiKey {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @Column({ type: 'varchar', length: 200, unique: true })
  apikey: string;

  @Column({ type: 'uuid' })
  user_id: string;

  @Column('simple-json')
  data: APIKeyData;

  @Column()
  date: Date;
}
