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
  @Index()
  id: string;

  @Column()
  title: string;

  @Column()
  @Index()
  public: boolean;

  @Column()
  @Index()
  isFolder: boolean;

  @Column({ type: 'uuid' })
  @Index()
  user_id: string;

  @Column({ type: 'uuid' })
  @Index()
  folder: string;

  @Column()
  @Index()
  order: number;

  @Column('simple-json')
  item: any;

  @CreateDateColumn()
  @Index()
  created: Date;

  @UpdateDateColumn()
  @Index()
  updated: Date;
}
