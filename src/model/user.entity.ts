import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ schema: 'auth', synchronize: false })
export class Users {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  email: string;
}
