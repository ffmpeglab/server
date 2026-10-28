import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { ApiKey } from './model/apikey.entity';
import { LogPiece } from './model/logpiece.entity';
import { Pipeline } from './model/pipeline.entity';
import { Render } from './model/render.entity';
import * as dotenv from 'dotenv';
import { Item } from './model/item.entity';
import { Role } from './model/roles.entity';
dotenv.config();

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: 5432,
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  synchronize: false,
  logging: false,
  schema: 'public',
  entities: [ApiKey, LogPiece, Pipeline, Render, Item, Role],
  migrations: [],
  subscribers: [],
});
