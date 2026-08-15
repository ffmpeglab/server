import type { Media, MinimalMedia, RenderData } from '../types';
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity()
export class Render {
  @PrimaryGeneratedColumn('uuid')
  @Index()
  id: string;

  @Column()
  title: string;

  @Column()
  @Index()
  project: string;

  @Column()
  status: string;

  @Column()
  @Index()
  public: boolean;

  @Column({ type: 'uuid' })
  @Index()
  user_id: string;

  @Column()
  progress: number;

  @Column()
  logs: string;

  @Column('simple-json')
  data: RenderData;

  @Column('simple-json')
  result: MinimalMedia | Media;

  @CreateDateColumn()
  @Index()
  date: Date;
}
